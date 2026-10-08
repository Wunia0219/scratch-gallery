// Manual owner UI check against localhost; never used in CI or production deploys.
// Uses a short-lived Firebase custom token from the already authorized server key.
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { loadEnv } from 'vite'
import { chromium } from 'playwright-core'
import games from '../public/games.json' with { type: 'json' }
import creators from '../public/creators.json' with { type: 'json' }
import { getFirebaseServices } from '../netlify/lib/firebase-runtime.mjs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
Object.assign(process.env, loadEnv('development', process.cwd(), ''))
if (!process.argv.includes('--run') || !process.argv.includes(`--project=${process.env.FIREBASE_PROJECT_ID}`) || process.env.CONTEXT) throw new Error('僅可明確使用 --run --project=<project ID> 驗證本機後台')
const { auth, store } = await getFirebaseServices()
const owner = await auth.getUserByEmail('nini900219@gmail.com')
const permission = await store.get(`admins/${owner.uid}`)
if (!owner.emailVerified || owner.disabled || !permission?.enabled || permission.role !== 'owner') throw new Error('站主授權不存在')
const game = games[0], draftPath = `workDrafts/${game.id}`
if (await store.get(draftPath)) throw new Error('此作品已有使用者草稿，不執行會覆寫草稿的驗證')
const marker = `草稿驗證 ${randomUUID().slice(0, 8)}`, title = `${game.title}（${marker}）`
await mkdir('.packages/work-stage2', { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1264, height: 900 } }), page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:3000/admin/?section=works')
  await page.getByRole('button', { name: '使用 Google 帳號登入' }).waitFor()
  const signer = initializeApp({ credential: cert(JSON.parse(await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))) }, 'local-ui-check')
  const token = await getAuth(signer).createCustomToken(owner.uid)
  // These are the app's own Vite development modules, in an isolated Chrome context.
  await page.evaluate(async token => {
    const app = await import('/node_modules/.vite/deps/firebase_app.js')
    const sdk = await import('/node_modules/.vite/deps/firebase_auth.js')
    await sdk.signInWithCustomToken(sdk.getAuth(app.getApp('gallery-admin')), token)
  }, token)
  await page.getByRole('heading', { name: '編輯作品', exact: true }).waitFor()
  const authorName = creators.find(creator => creator.id === game.creatorId).name
  const row = page.locator('.admin-list .admin-activity-item').filter({ hasText: authorName })
  assert.equal(await row.count(), 1); await row.click()
  assert.equal(await page.getByLabel('作品代號', { exact: true }).inputValue(), game.id)
  assert.equal(await page.getByRole('button', { name: '活動管理', exact: true }).count(), 1)
  assert.equal(await page.getByRole('button', { name: '作品管理', exact: true }).count(), 1)
  await page.getByLabel('作品名稱', { exact: true }).fill(title)
  await page.getByRole('button', { name: '儲存草稿', exact: true }).click()
  await page.getByText('草稿已儲存，前台維持原公開內容。', { exact: true }).waitFor()
  assert.equal((await store.get(draftPath)).title, title)
  const publicResult = await page.request.get(`http://127.0.0.1:3000/api/works/${game.id}`)
  assert.equal(publicResult.status(), 200); assert.equal((await publicResult.json()).game.title, game.title)
  await page.getByRole('button', { name: '預覽作品', exact: true }).click()
  await page.locator('.admin-work-preview .game-card').waitFor()
  assert.ok((await page.locator('.admin-work-preview').textContent()).includes(marker))
  await page.getByRole('button', { name: '確認上架', exact: true }).click()
  await page.getByRole('heading', { name: '將此版本上架到作品庫？', exact: true }).waitFor()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  // Remove only the untouched draft created by this check; public content stays unchanged.
  await store.transaction(async tx => {
    const draft = await tx.get(draftPath)
    if (draft?.title !== title || draft.updatedBy !== owner.uid || draft.revision !== 1) throw new Error('測試草稿已被修改，保留供人工確認')
    tx.delete(draftPath)
  })
  await page.getByRole('button', { name: '重新載入', exact: true }).click()
  await page.waitForFunction(expected => document.querySelector('.admin-editor input:not([readonly])')?.value === expected, game.title)
  assert.equal(await page.locator('.admin-list .admin-activity-item').count(), games.length)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: '.packages/work-stage2/admin-works-overview.png' })
  await page.screenshot({ path: '.packages/work-stage2/admin-works-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 375, height: 812 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: '.packages/work-stage2/admin-works-mobile.png', fullPage: true })
  assert.deepEqual(errors, [])
  await page.getByRole('button', { name: '登出', exact: true }).click()
  await page.getByRole('button', { name: '使用 Google 帳號登入' }).waitFor()
  assert.equal(await page.getByRole('heading', { name: '編輯作品', exact: true }).count(), 0)
  console.log('PASS owner editor, private draft, preview, publish confirmation, 15 works, mobile width and logout; public content unchanged.')
} finally {
  await store.transaction(async tx => { const draft = await tx.get(draftPath); if (draft?.title === title && draft.updatedBy === owner.uid && draft.revision === 1) tx.delete(draftPath) })
  await browser.close()
  await (await getFirebaseServices()).db.terminate()
}
