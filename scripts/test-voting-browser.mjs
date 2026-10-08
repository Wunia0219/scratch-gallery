// Manual owner UI test. Voting writes use an isolated in-memory API, never real votes.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, mkdir } from 'node:fs/promises'
import { loadEnv } from 'vite'
import { chromium } from 'playwright-core'
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirebaseServices } from '../netlify/lib/firebase-runtime.mjs'
import { memoryStore } from './lib/test-memory-store.mjs'
import { ingestSummary } from '../netlify/lib/voting-service.mjs'
import { createVotingAdminHandler } from '../netlify/functions/voting-admin.mjs'
import { createPublicVotingHandler } from '../netlify/functions/voting.mjs'
import { initialActivity, initialSiteState } from '../netlify/lib/activity-service.mjs'
import { publicActivity } from '../src/lib/activitySchema.js'
Object.assign(process.env, loadEnv('development', process.cwd(), ''))
if (!process.argv.includes('--run') || !process.argv.includes(`--project=${process.env.FIREBASE_PROJECT_ID}`) || process.env.CONTEXT) throw new Error('請使用 --run --project=<Firebase project ID>，僅供本機驗證')
const { auth, store, db } = await getFirebaseServices(), owner = await auth.getUserByEmail('nini900219@gmail.com')
if (!owner.emailVerified || !(await store.get(`admins/${owner.uid}`))?.enabled) throw new Error('站主授權不存在')
const realWorks = (await store.list('publicWorks')).slice(0, 2), activity = { ...initialActivity(), id: 'browser-voting', status: 'published', title: '投票功能驗收範例' }
const localStore = memoryStore({ [`activities/${activity.id}`]: activity, ...Object.fromEntries(realWorks.map(work => [`publicWorks/${work.id}`, work])) })
let sourceRevision = 0, sourceFail = false
const control = async (store, id, revision, jobId) => {
  if (sourceFail) { const { markSyncFailure } = await import('../netlify/lib/voting-service.mjs'); await markSyncFailure(store, id, revision, jobId); return 'failed' }
  const config = await store.get(`votingConfigs/${id}`), source = await store.get(`voteSources/${id}`)
  await ingestSummary(store, { action: 'summary', activityId: id, jobId, sourceRevision: ++sourceRevision, configRevision: config.revision, mappingVersion: config.mappingVersion, sourceGeneratedAt: new Date().toISOString(), countsByWorkId: Object.fromEntries(config.entries.map((entry, index) => [entry.workId, index ? 1 : 2])), ballotCount: 3, selectionCount: 3, invalidCount: 0, excludedCount: 0, formId: source.formId, questionItemId: source.questionItemId, formUrl: config.formUrl, acceptingResponses: config.acceptanceDesired, schemaVerified: true }); return 'confirmed'
}
const admin = createVotingAdminHandler({ services: async () => ({ store: localStore }), owner: async () => owner.uid, control, purge: async () => {} }), publicVotes = createPublicVotingHandler(async () => ({ store: localStore }))
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
await mkdir('.packages/voting-stage3', { recursive: true })
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/admin/vot*', async route => { const request = route.request(), response = await admin(new Request(request.url(), { method: request.method(), headers: request.headers(), ...(request.postData() ? { body: request.postData() } : {}) })); await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }) })
  await page.goto('http://127.0.0.1:3000/admin/?section=voting'); await page.getByRole('button', { name: '使用 Google 帳號登入' }).waitFor()
  const signer = initializeApp({ credential: cert(JSON.parse(await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))) }, `voting-ui-${randomUUID()}`), token = await getAuth(signer).createCustomToken(owner.uid)
  await page.evaluate(async token => { const app = await import('/node_modules/.vite/deps/firebase_app.js'), sdk = await import('/node_modules/.vite/deps/firebase_auth.js'); await sdk.signInWithCustomToken(sdk.getAuth(app.getApp('gallery-admin')), token) }, token)
  const ownerToken = await page.evaluate(async () => { const app = await import('/node_modules/.vite/deps/firebase_app.js'), sdk = await import('/node_modules/.vite/deps/firebase_auth.js'); return sdk.getAuth(app.getApp('gallery-admin')).currentUser.getIdToken() })
  // Node fetch bypasses the browser's memory fixture: read the actual local owner API once.
  const actual = await fetch('http://127.0.0.1:3000/api/admin/voting', { headers: { Authorization: `Bearer ${ownerToken}` } })
  assert.equal(actual.status, 200); const actualList = await actual.json(); assert.equal(typeof actualList.connectionReady, 'boolean'); assert.equal(actualList.works.length >= 2, true)
  assert.doesNotMatch(JSON.stringify(actualList), /SYNC_KEY|CONTROL_KEY|private_key/)
  assert.equal((await fetch('http://127.0.0.1:3000/api/admin/vote-template?file=script')).status, 401)
  await page.getByRole('heading', { name: '投票設定', exact: true }).waitFor()
  await page.getByRole('heading', { name: '投票串接指南', exact: true }).waitFor()
  await page.locator('.vote-connection-guide').screenshot({ path: '.packages/voting-stage3/voting-guide-demo.png' })
  await page.setViewportSize({ width: 375, height: 812 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.setViewportSize({ width: 1280, height: 900 })
  assert.equal(await page.getByRole('button', { name: '下載私密連線設定', exact: true }).isDisabled(), true)
  const scriptDownload = page.waitForEvent('download'); await page.getByRole('button', { name: '下載 Script 範本', exact: true }).click(); assert.equal((await scriptDownload).suggestedFilename(), 'Code.gs')
  await page.getByRole('button', { name: '收合指南', exact: true }).click()
  for (const work of realWorks) await page.locator(`input[type="checkbox"][value="${work.id}"]`).check()
  await page.getByLabel('投票名稱', { exact: true }).fill('投票功能驗收範例（模擬資料）')
  await page.getByRole('button', { name: '儲存投票草稿', exact: true }).click(); await page.getByText('投票草稿已儲存，尚未公開。', { exact: true }).waitFor()
  assert.equal((await localStore.get(`votingDrafts/${activity.id}`)).formId, '')
  await page.getByLabel('投票開始（台灣時間）', { exact: true }).fill(new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 19))
  await page.getByLabel('表單編輯 ID', { exact: true }).fill('browserForm123456789012345')
  await page.getByLabel('投票題目 ID', { exact: true }).fill('1234567')
  await page.getByLabel('表單完整填答網址', { exact: true }).fill('https://docs.google.com/forms/d/e/browserForm123456789012345/viewform')
  await page.getByLabel('Apps Script 控制網址', { exact: true }).fill('https://script.google.com/macros/s/browserScript123456789012345/exec')
  await page.getByRole('button', { name: '儲存投票草稿', exact: true }).click(); await page.getByText('投票草稿已儲存，尚未公開。', { exact: true }).waitFor()
  assert.equal((await publicVotes(new Request(`http://127.0.0.1:3000/api/voting/${activity.id}`))).status, 200)
  await page.getByRole('button', { name: '確認啟用設定', exact: true }).click(); await page.getByRole('button', { name: '確認操作', exact: true }).click()
  await page.getByRole('heading', { name: '收票與同步狀態', exact: true }).waitFor()
  await page.getByRole('button', { name: '完整同步統計', exact: true }).click(); await page.getByText('有效選票 3 張 · 總選擇 3 次 · 無效 0 張 · 期限外排除 0 張', { exact: true }).waitFor()
  await page.getByRole('button', { name: '開放收票', exact: true }).click(); await page.getByRole('button', { name: '確認操作', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.vote-health')?.textContent.includes('仍在收票'))
  await page.screenshot({ path: '.packages/voting-stage3/voting-admin-demo.png', fullPage: true })
  sourceFail = true; await page.getByRole('button', { name: '關閉收票並重算', exact: true }).click(); await page.getByRole('button', { name: '確認操作', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Google 表單尚未確認' }).waitFor()
  assert.equal((await localStore.get(`votingConfigs/${activity.id}`)).entryEnabled, false)
  sourceFail = false; await page.getByRole('button', { name: '完整同步統計', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.vote-health')?.textContent.includes('已停止收票'))
  await page.getByRole('button', { name: '確認結算結果', exact: true }).click(); await page.getByLabel('結算／更正說明', { exact: true }).fill('已核對模擬選票，同票依活動規則處理。'); await page.getByRole('button', { name: '確認操作', exact: true }).click()
  await page.getByRole('heading', { name: '固定結算結果 · 版本 1', exact: true }).waitFor()
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '匯出結算 CSV', exact: true }).click(); assert.match((await download).suggestedFilename(), /results-v1\.csv$/)
  await page.setViewportSize({ width: 375, height: 812 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.screenshot({ path: '.packages/voting-stage3/voting-admin-mobile-demo.png', fullPage: true })
  await page.getByRole('button', { name: '登出', exact: true }).click(); await page.getByRole('button', { name: '使用 Google 帳號登入' }).waitFor(); assert.equal(await page.getByRole('heading', { name: '投票設定', exact: true }).count(), 0)
  const home = await context.newPage(); home.on('pageerror', error => errors.push(error.message))
  await home.route('**/api/site-config', route => route.fulfill({ json: { ...initialSiteState(), featuredActivity: publicActivity(activity), mode: 'firebase' } }))
  await home.route('**/api/voting/*', async route => { const response = await publicVotes(new Request(route.request().url())); await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }) })
  await home.goto('http://127.0.0.1:3000/#announcements'); await home.locator('.voting-results').waitFor(); await home.locator('.voting-results').scrollIntoViewIfNeeded()
  await home.getByText('有效選票 3 張', { exact: true }).waitFor(); assert.equal(await home.getByRole('link', { name: '前往 Google 表單投票', exact: true }).count(), 0)
  await home.screenshot({ path: '.packages/voting-stage3/voting-public-demo.png', fullPage: true })
  assert.deepEqual(errors, []); console.log('PASS owner tabs, private draft, activation, full recount, open/failed-close/retry, final CSV, public stats, mobile width and logout; all voting writes stayed in memory.')
} finally { await browser.close(); await db.terminate() }
