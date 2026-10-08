import assert from 'node:assert/strict'
import { readFile, mkdtemp, cp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import handler from '../netlify/functions/home.mjs'
import { initialSiteState } from '../netlify/lib/activity-service.mjs'
import { renderHome } from '../.netlify/server/home.mjs'
const original = process.env.ACTIVITY_DATA_MODE
try {
  process.env.ACTIVITY_DATA_MODE = 'legacy'
  const response = await handler(new Request('http://localhost/'))
  const html = await response.text()
  assert.equal(response.status, 200)
  assert.match(html, /萬聖節魔法 Scratch 創作挑戰/)
  assert.doesNotMatch(html, /(?:src|href)="\/src\//)
  assert.match(html, /id="site-state"/)
  const state = initialSiteState()
  state.mode = 'firebase'; state.featuredActivity = null; state.contentUpdates.events = null
  const closed = await renderHome(state)
  assert.doesNotMatch(closed, /萬聖節魔法 Scratch 創作挑戰|forms\.gle|halloween-activity-intro/)
  assert.match(closed, /敬請期待/)
  state.featuredActivity = { ...initialSiteState().featuredActivity, title: '</script><script>alert(1)</script>' }
  assert.match(await renderHome(state), /&lt;\/script&gt;/)
  assert.doesNotMatch(await renderHome(state), /<script>alert/)
  process.env.ACTIVITY_DATA_MODE = 'invalid'
  const failed = await handler(new Request('http://localhost/'))
  assert.equal(failed.status, 503)
  assert.equal(failed.headers.get('cache-control'), 'no-store')
  const failedHtml = await failed.text()
  assert.match(failedHtml, /活動資訊暫時無法載入/)
  assert.doesNotMatch(failedHtml, /萬聖節魔法 Scratch 創作挑戰|forms\.gle/)
  const config = await readFile('netlify.toml', 'utf8')
  assert.match(config, /included_files = \["\.netlify\/server\/\*\*"\]/)
  assert.equal((await readdir('.netlify/server')).includes('games'), false, 'the homepage Function must not include public game packages')
  const isolated = await mkdtemp(join(tmpdir(), 'scratch-gallery-ssr-'))
  assert.equal(dirname(resolve(isolated)), resolve(tmpdir()))
  try {
    await cp('.netlify/server', isolated, { recursive: true })
    const standalone = await import(pathToFileURL(join(isolated, 'home.mjs')).href)
    assert.match(await standalone.renderHome(initialSiteState()), /萬聖節魔法 Scratch 創作挑戰/)
  } finally { await rm(isolated, { recursive: true, force: true }) }
  console.log('PASS dynamic HTML, hidden activity without JavaScript, escaped content, failure response and runtime files.')
} finally { original === undefined ? delete process.env.ACTIVITY_DATA_MODE : process.env.ACTIVITY_DATA_MODE = original }
