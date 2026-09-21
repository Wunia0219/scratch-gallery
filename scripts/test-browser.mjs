// Local browser smoke test that serves the generated Netlify header rules.
// This is not a replacement for check:live on an actual Netlify deployment.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { featuredActivity } from '../src/contentUpdates.js'
import { testLeaderboardBrowser } from './test-leaderboard-browser.mjs'
import { studentClasses } from '../src/lib/catalog.js'
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
const testPort = Number(process.env.BROWSER_TEST_PORT || 4173)
const testOrigin = `http://127.0.0.1:${testPort}`
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(testPort, '127.0.0.1', resolve) })
let browser
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.env.CI ? chromium.executablePath() : process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome'), headless: true })
  const page = await browser.newPage()
  const games = JSON.parse(await readFile('public/games.json', 'utf8'))
  const creators = JSON.parse(await readFile('public/creators.json', 'utf8'))
  const creatorRoles = new Map(creators.map(creator => [creator.id, creator.role]))
  const studentCount = games.filter(game => creatorRoles.get(game.creatorId) !== 'teacher').length
  const teacherCount = games.filter(game => creatorRoles.get(game.creatorId) === 'teacher').length
  const initialStudentCards = Math.min(studentCount, 9)
  const initialTeacherCards = Math.min(teacherCount, 9)
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const mediaRequests = []
  page.on('request', request => { if (/\.(?:MP4|mp4)(?:$|\?)/.test(request.url())) mediaRequests.push(request.url()) })
  await page.goto(`${testOrigin}/`)
  await page.locator('.hero-video-frame video').evaluate(video => video.play())
  assert.equal(mediaRequests.some(url => url.includes('IMG_3294')), false, 'homepage must not fetch full video')
  assert.equal(mediaRequests.some(url => url.includes('showcase-preview')), true, 'homepage should fetch small preview')
  await page.getByRole('button', { name: '全螢幕播放並開啟聲音' }).click()
  await page.locator('.video-dialog video').evaluate(video => video.play())
  assert.equal(mediaRequests.some(url => url.includes('IMG_3294')), true, 'full video loads on demand')
  assert.equal(await page.locator('.hero-video-frame video').evaluate(video => video.paused), true, 'background preview pauses in dialog')
  await page.getByRole('button', { name: '關閉影片', exact: true }).click()
  await page.locator('.video-dialog').waitFor({ state: 'detached' })
  assert.equal(await page.locator('.game-card').count(), 0)
  assert.equal(await page.locator('a[href="/students/"]').count() > 0, true)
  assert.equal(await page.locator('a[href="/teachers/"]').count() > 0, true)
  assert.equal(await page.locator('.hero-actions a[href="#announcements"]').count(), 1, 'homepage should include an event shortcut')
  assert.equal(await page.locator('.activity-reminder').count(), 0, 'unpublished activity reminder should stay hidden')
  assert.equal(await page.locator('.nav-drawer-nav a[href="#announcements"] .nav-drawer-update').count(), 0, 'unpublished activity should not show an update badge')
  assert.equal(await page.locator('.header-start > .nav-drawer-trigger + .brand').count(), 1, 'icon menu button should sit to the left of the brand')
  assert.equal(await page.locator('.nav-drawer-trigger-copy').count(), 0, 'desktop menu trigger should remain icon-only')
  await page.locator('.nav-drawer-trigger').click()
  assert.equal(await page.locator('.nav-drawer-layer').evaluate(element => element.classList.contains('is-open')), true, 'navigation drawer should open')
  assert.equal(await page.locator('.nav-drawer-nav a[href="/teachers/"] .nav-drawer-update').getByText('有新內容').count(), 1, 'new teacher work should show a navigation update')
  assert.equal(await page.locator('.nav-drawer-close').evaluate(element => element === document.activeElement), true, 'drawer close button should receive focus')
  assert.equal(await page.locator('body').evaluate(element => element.classList.contains('nav-drawer-open')), true, 'page scroll should lock while drawer is open')
  await page.locator('.nav-drawer-nav a[href="#announcements"]').click()
  await page.waitForTimeout(500)
  assert.equal(new URL(page.url()).hash, '#announcements', 'event navigation should update the URL hash')
  assert.equal(await page.locator('#announcements').evaluate(element => {
    const top = element.getBoundingClientRect().top
    return top >= 0 && top < 160
  }), true, 'event navigation should scroll to the announcement section')
  assert.equal(await page.getByText('敬請期待', { exact: true }).isVisible(), true)
  assert.equal(await page.getByRole('button', { name: '播放萬聖節活動說明' }).count(), 0, 'unpublished activity preview should not be interactive')
  await page.locator('.nav-drawer-trigger').click()
  await page.locator('.nav-drawer-nav a[href="#learning"]').click()
  await page.waitForTimeout(500)
  assert.equal(new URL(page.url()).hash, '#learning', 'learning navigation should update the URL hash')
  assert.equal(await page.locator('#learning').evaluate(element => {
    const top = element.getBoundingClientRect().top
    return top >= 0 && top < 160
  }), true, 'learning navigation should scroll to the learning section')
  await page.goto(`${testOrigin}/students/`)
  assert.equal(await page.locator('.nav-drawer-nav a[aria-current="page"][href="/students/"]').count(), 1)
  assert.equal(await page.locator('.game-card').count(), initialStudentCards)
  await page.locator('.nav-drawer-trigger').click()
  await Promise.all([
    page.waitForURL(`${testOrigin}/#announcements`),
    page.locator('.nav-drawer-nav a[href="/#announcements"]').click(),
  ])
  await page.getByText('敬請期待', { exact: true }).waitFor({ state: 'visible' })
  await page.waitForTimeout(700)
  const crossPageAnnouncementTop = await page.locator('#announcements').evaluate(element => element.getBoundingClientRect().top)
  assert.equal(crossPageAnnouncementTop >= 0 && crossPageAnnouncementTop < 160, true, `cross-page event navigation should land on the announcement section (top: ${crossPageAnnouncementTop})`)
  await page.goto(`${testOrigin}/students/`)
  await page.getByRole('button', { name: 'EN' }).click()
  assert.equal(await page.getByRole('button', { name: 'All classes', exact: true }).count(), 1)
  for (const className of studentClasses(creators).slice(1)) assert.equal(await page.getByRole('button', { name: className, exact: true }).count(), 1)
  await page.locator('#gallery-search').fill('不存在的作品')
  assert.equal(await page.locator('.game-card').count(), 0)
  await page.locator('#gallery-search').fill('')
  await page.goto(`${testOrigin}/teachers/`)
  assert.equal(await page.locator('.nav-drawer-nav a[aria-current="page"][href="/teachers/"]').count(), 1)
  assert.equal(await page.locator('.game-card').count(), teacherCount ? initialTeacherCards : 0)
  assert.equal(await page.locator('.filter-group').count(), 1)
  assert.equal(await page.getByText('Class', { exact: true }).count(), 0)
  await page.goto(`${testOrigin}/`)
  await page.locator('.nav-drawer-trigger').click()
  assert.equal(await page.locator('.nav-drawer-nav a[href="/teachers/"] .nav-drawer-update').count(), 0, 'visiting teacher gallery should mark its update as seen')
  await page.locator('.nav-drawer-close').click()
  for (const game of games) {
    await page.goto(`${testOrigin}/works/${game.id}/`)
    await page.locator('.work-cover .play-count').waitFor({ state: 'visible' })
    assert.equal(await page.locator('.work-cover .play-count span').textContent(), '0', 'a loaded game without plays should show zero')
    await page.locator('.work-cover .game-cover').click()
    const fullscreenButton = page.getByRole('button', { name: '全螢幕遊玩' })
    await fullscreenButton.waitFor({ state: 'visible' })
    const fullscreenButtonBox = await fullscreenButton.boundingBox()
    assert.ok(fullscreenButtonBox.width >= 44 && fullscreenButtonBox.height >= 44, 'fullscreen control should be touch friendly')
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
    assert.equal(await page.locator('.work-cover .play-count span').textContent(), '1', 'localhost play count should increment')
    if (game === games[0]) {
      await page.locator('.work-cover .game-cover').click()
      assert.equal(await page.locator('.work-cover .play-count span').textContent(), '1', '30-minute cooldown should prevent a duplicate count')
      await page.getByRole('button', { name: '關閉遊戲播放器' }).click()
    }
    console.log(`PASS sandbox + gameplay + close: ${game.id}`)
  }
  await testLeaderboardBrowser(browser, testOrigin, games.find(game => game.leaderboard)?.id)
  const reduced = await browser.newContext({ reducedMotion: 'reduce' })
  await reduced.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage denied') } }) })
  const reducedPage = await reduced.newPage()
  const reducedErrors = []
  reducedPage.on('pageerror', error => reducedErrors.push(error.message))
  const reducedVideos = []
  reducedPage.on('request', request => { if (/\.(MP4|mp4)$/.test(request.url())) reducedVideos.push(request.url()) })
  await reducedPage.goto(`${testOrigin}/`)
  await reducedPage.locator('.hero-video-frame video').waitFor()
  assert.equal(await reducedPage.locator('.hero-video-frame video').getAttribute('src'), null)
  assert.equal(reducedVideos.length, 0, 'reduced motion should not download either video by default')
  await reducedPage.getByRole('button', { name: 'EN', exact: true }).click()
  assert.equal(await reducedPage.locator('html').getAttribute('lang'), 'en')
  assert.deepEqual(reducedErrors, [], 'denied storage must not break language or reminders')
  await reducedPage.screenshot({ path: '.packages/home-desktop.webp', type: 'webp' })
  await reducedPage.setViewportSize({ width: 375, height: 812 })
  await reducedPage.screenshot({ path: '.packages/home-mobile.webp', type: 'webp', fullPage: true })
  await reduced.close()
  const noJs = await browser.newContext({ javaScriptEnabled: false })
  const readable = await noJs.newPage()
  await readable.goto(`${testOrigin}/`)
  assert.equal(await readable.locator('.game-card').count(), 0)
  await readable.goto(`${testOrigin}/students/`)
  assert.equal(await readable.locator('.game-card').count(), initialStudentCards)
  await readable.goto(`${testOrigin}/teachers/`)
  assert.equal(await readable.locator('.game-card').count(), teacherCount ? initialTeacherCards : 0)
  await readable.goto(`${testOrigin}/works/${games[0].id}/`)
  assert.equal(await readable.locator('h1').textContent(), games[0].title)
  await noJs.close()
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(`${testOrigin}/works/${games[1].id}/`)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.locator('.work-cover .game-cover').click()
  const mobileFullscreenButton = page.getByRole('button', { name: '全螢幕遊玩' })
  await mobileFullscreenButton.waitFor({ state: 'visible' })
  await page.locator('.game-dialog').evaluate(element => {
    element.requestFullscreen = undefined
    element.webkitRequestFullscreen = undefined
  })
  await mobileFullscreenButton.click()
  assert.equal(await page.locator('.game-dialog').evaluate(element => element.classList.contains('player-expanded')), true, 'mobile fallback should expand without the Fullscreen API')
  const expandedDialogBox = await page.locator('.game-dialog').boundingBox()
  assert.ok(expandedDialogBox.width >= 374 && expandedDialogBox.height >= 811, 'expanded mobile player should fill the visual viewport')
  await page.getByRole('button', { name: '縮小遊戲畫面' }).click()
  await page.getByRole('button', { name: '關閉遊戲播放器' }).click()
  await page.locator('.nav-drawer-trigger').click()
  assert.equal(await page.locator('.nav-drawer-nav a').count(), 4)
  assert.equal(await page.locator('.nav-drawer').isVisible(), true)
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.nav-drawer-layer').evaluate(element => element.classList.contains('is-open')), false, 'Escape should close the drawer')
  assert.equal(await page.locator('.nav-drawer-trigger').evaluate(element => element === document.activeElement), true, 'closing should restore focus to the menu button')
  await page.locator('.nav-drawer-trigger').click()
  if (process.env.SCREENSHOT_PATH) {
    await page.waitForTimeout(400)
    await page.screenshot({ path: process.env.SCREENSHOT_PATH, fullPage: true })
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 812, height: 375 })
  await page.goto(`${testOrigin}/`)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'landscape layout should not overflow')
  assert.deepEqual(errors, [], 'uncaught browser errors')
  console.log(`PASS no-JS SEO content, mobile width, all ${games.length} game runtimes.`)
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
