// Local browser smoke test that serves the generated Netlify header rules.
// This is not a replacement for check:live on an actual Netlify deployment.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
const root = path.resolve('dist')
const rules = (await readFile('dist/_headers', 'utf8')).trim().split(/\n\s*\n/).map(block => {
  const [pattern, ...lines] = block.split('\n')
  return { pattern, headers: lines.map(line => { const i = line.indexOf(':'); return [line.slice(0, i).trim(), line.slice(i + 1).trim()] }) }
})
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' }
const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)
    let file = path.resolve(root, '.' + urlPath)
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return }
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html')
    const body = await readFile(file)
    for (const rule of rules) {
      if (rule.pattern.endsWith('*') ? urlPath.startsWith(rule.pattern.slice(0, -1)) : urlPath === rule.pattern) {
        for (const [key, value] of rule.headers) res.setHeader(key, value)
      }
    }
    res.setHeader('Content-Type', types[path.extname(file).toLowerCase()] || 'application/octet-stream')
    res.end(body)
  } catch { res.writeHead(404).end('Not found') }
})
await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.env.CI ? chromium.executablePath() : process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome'), headless: true })
  const page = await browser.newPage()
  const games = JSON.parse(await readFile('public/games.json', 'utf8'))
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:4173/')
  assert.equal(await page.locator('.game-card').count(), games.length)
  await page.locator('#game-search').fill('不存在的作品')
  assert.equal(await page.locator('#games .game-card').count(), 0)
  await page.locator('#game-search').fill('')
  for (const game of games) {
    await page.goto(`http://127.0.0.1:4173/works/${game.id}/`)
    await page.locator('.work-cover .game-cover').click()
    const iframe = page.frameLocator('dialog iframe')
    await iframe.locator('#launch').waitFor({ state: 'visible', timeout: 30000 })
    const frame = page.frames().find(f => f.url().includes(game.id + '/index.html'))
    assert.ok(frame, 'game frame loaded')
    assert.equal(await frame.evaluate(() => { try { return Boolean(parent.document.body) } catch { return false } }), false, 'game must not read parent document')
    assert.equal(await frame.evaluate(() => { try { localStorage.setItem('isolation-test', '1'); return true } catch { return false } }), false, 'game must not access gallery storage')
    await iframe.locator('#launch').click()
    await frame.waitForFunction(() => typeof scaffolding !== 'undefined' && scaffolding.vm.runtime.threads.length > 0)
    await page.getByRole('button', { name: '關閉遊戲播放器' }).click()
    assert.equal(await page.locator('iframe').count(), 0)
    console.log(`PASS sandbox + gameplay + close: ${game.id}`)
  }
  const noJs = await browser.newContext({ javaScriptEnabled: false })
  const readable = await noJs.newPage()
  await readable.goto('http://127.0.0.1:4173/')
  assert.equal(await readable.locator('.game-card').count(), games.length)
  await readable.goto(`http://127.0.0.1:4173/works/${games[0].id}/`)
  assert.equal(await readable.locator('h1').textContent(), games[0].title)
  await noJs.close()
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(`http://127.0.0.1:4173/works/${games[1].id}/`)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH, fullPage: true })
  assert.deepEqual(errors, [], 'uncaught browser errors')
  console.log(`PASS no-JS SEO content, mobile width, all ${games.length} game runtimes.`)
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
