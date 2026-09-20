import assert from 'node:assert/strict'
import { createLeaderboardHandler } from '../netlify/lib/leaderboards.mjs'

export async function testLeaderboardBrowser(browser, testOrigin, gameId) {
  const origin = 'https://giraffegallery.com'
  const values = new Map()
  const submissions = []
  let rejectNext = false
  const handler = createLeaderboardHandler(() => ({
    async get(key) { return values.has(key) ? JSON.parse(values.get(key)) : null },
    async set(key, value) { values.set(key, value) },
    async *list({ prefix }) { yield { blobs: [...values.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) } },
  }), [gameId])
  const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  // Serve our local build under the production origin to exercise fetch/API code,
  // while ALL requests are intercepted. Never send test scores to production.
  await context.route(`${origin}/**`, async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.endsWith('/word-alchemy-leaderboard')) {
      const body = request.postData()
      if (body) submissions.push(JSON.parse(body))
      await new Promise(resolve => setTimeout(resolve, 350))
      if (body && rejectNext) { rejectNext = false; await route.fulfill({ status: 503, json: { error: 'test outage' } }); return }
      const response = await handler(new Request(request.url(), { method: request.method(), headers: { 'content-type': 'application/json', origin }, ...(body ? { body } : {}) }))
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() })
    } else if (url.pathname.endsWith('/play-counts')) {
      await route.fulfill({ json: request.method() === 'POST' ? { count: 1 } : { counts: {} } })
    } else {
      const response = await context.request.get(`${testOrigin}${url.pathname}${url.search}`)
      const headers = response.headers()
      if (headers['content-security-policy']) headers['content-security-policy'] = headers['content-security-policy'].replaceAll(testOrigin, origin)
      await route.fulfill({ status: response.status(), headers, body: await response.body() })
    }
  })
  async function openGame() {
    await page.goto(`${origin}/works/${gameId}/`)
    await page.locator('.work-cover .game-cover').click()
    const frame = await (await page.locator('dialog iframe').elementHandle()).contentFrame()
    await frame.locator('#launch').click()
    await frame.waitForFunction(() => {
      try { return scaffolding.vm.runtime.getSpriteTargetByName('排行榜按鈕').visible } catch { return false }
    })
    await page.waitForTimeout(150)
    return frame
  }
  async function openBoard(frame) {
    await frame.evaluate(() => {
      const runtime = scaffolding.vm.runtime
      runtime.startHats('event_whenthisspriteclicked', {}, runtime.getSpriteTargetByName('排行榜按鈕'))
    })
    await page.getByRole('status').filter({ hasText: '排行榜已更新。' }).waitFor()
  }
  async function renderedRows(frame) {
    // Each visible clone is one actually rendered glyph, not just an updated list.
    return frame.evaluate(() => {
      const clones = scaffolding.vm.runtime.getSpriteTargetByName('排行榜字元').sprite.clones.slice(1).filter(t => t.visible)
      const rows = new Map()
      for (const t of clones) {
        const chars = rows.get(t.y) || []
        chars.push({ x: t.x, char: t.getCostumes()[t.currentCostume].name.replace(/^字元/, '') })
        rows.set(t.y, chars)
      }
      return [...rows].sort((a, b) => b[0] - a[0]).map(([, chars]) => chars.sort((a, b) => a.x - b.x).map(c => c.char).join(''))
    })
  }
  async function endGame(frame, player, floor, score) {
    await frame.evaluate(({ player, floor, score }) => {
      const runtime = scaffolding.vm.runtime
      const stage = runtime.getTargetForStage()
      runtime.stopForTarget(stage)
      scaffolding.setVariable('玩家', player)
      scaffolding.setVariable('樓層', floor)
      scaffolding.setVariable('分數', score)
      // Execute the real SB3 ending chain: snapshot, submit, eight-second dialog.
      const block = Object.values(stage.blocks._blocks).find(b => b.opcode === 'data_setvariableto' && b.fields.VARIABLE?.value === '送出玩家')
      if (!block) throw new Error('Missing settlement snapshot block')
      runtime._pushThread(block.id, stage, { stackClick: true })
    }, { player, floor, score })
  }
  try {
    let frame = await openGame()
    assert.deepEqual(await frame.evaluate(() => scaffolding.getList('排行玩家')), [], 'no bundled test scores')
    await openBoard(frame)
    assert.deepEqual(await renderedRows(frame), [], 'new leaderboard renders empty')
    const start = Date.now()
    await endGame(frame, 'LOL', 3, 1060)
    await page.getByRole('status').filter({ hasText: '成績已儲存。' }).waitFor()
    await frame.waitForFunction(() => scaffolding.getVariable('狀態') === '成績已儲存。')
    assert.ok(Date.now() - start < 7000, 'save must finish before eight-second ending dialog')
    await page.waitForTimeout(600)
    assert.deepEqual(await renderedRows(frame), ['LOL31060'])
    // Return, ask again, and check clone counts do not grow with each response.
    for (let i = 0; i < 2; i++) {
      await frame.evaluate(() => { scaffolding.vm.runtime.startHats('event_whenbroadcastreceived', { BROADCAST_OPTION: '顯示主選單' }) })
      await openBoard(frame)
      await page.waitForTimeout(400)
      assert.deepEqual(await renderedRows(frame), ['LOL31060'])
    }
    frame = await openGame()
    await openBoard(frame)
    await page.waitForTimeout(400)
    assert.deepEqual(await renderedRows(frame), ['LOL31060'], 'reload paints saved server score')
    await page.screenshot({ path: '.packages/leaderboard-reload.png' })
    // Failure then retry must reuse the same immutable score even after a restart.
    rejectNext = true
    await endGame(frame, 'LOL', 4, 1900)
    await page.getByRole('button', { name: '重試儲存成績' }).waitFor()
    await frame.evaluate(() => scaffolding.vm.greenFlag())
    await page.getByRole('button', { name: '重試儲存成績' }).click()
    await page.getByRole('status').filter({ hasText: '成績已儲存。' }).waitFor()
    assert.deepEqual(submissions.at(-1), submissions.at(-2), 'retry keeps event ID and ending snapshot')
    await openBoard(frame)
    await page.waitForTimeout(400)
    assert.deepEqual(await renderedRows(frame), ['LOL41900'])
    frame = await openGame()
    await openBoard(frame)
    await page.waitForTimeout(400)
    assert.deepEqual(await renderedRows(frame), ['LOL41900'])
    assert.deepEqual(errors, [])
    console.log('PASS real SB3 ending + production API path + delayed repaint + reload + retry after green flag (isolated test store)')
  } finally { await context.close() }
}
