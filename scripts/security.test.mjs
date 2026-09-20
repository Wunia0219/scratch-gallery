import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validateCatalog, isLocalAsset } from '../src/lib/catalog.js'
import { siteConfig, assertReleaseReady, galleryCsp, gameCsp, buildHeaders, runtimeSources } from './site-policy.mjs'
import { countPlayEvents, isProductionPlayRequest, isValidPlayEvent, playEventKey } from '../netlify/lib/play-events.mjs'
const games = JSON.parse(await readFile('public/games.json', 'utf8'))
const creators = JSON.parse(await readFile('public/creators.json', 'utf8'))
test('catalog accepts real games and rejects executable URLs, traversal and duplicates', () => {
  assert.equal(validateCatalog(games, creators).length, games.length)
  for (const playUrl of ['javascript:alert(1)', '//evil.example/game', '/games/../index.html', 'https://evil.example/']) {
    assert.throws(() => validateCatalog([{ ...games[0], playUrl }], creators))
  }
  for (const value of ['/games/../secret', '/games/%2e%2e/secret', '//evil.example/x', 'data:image/svg+xml,x', '/games/x?y', '/games/x\\y']) assert.equal(isLocalAsset(value), false)
  assert.throws(() => validateCatalog([games[0], games[0]], creators))
  assert.throws(() => validateCatalog([{ ...games[0], publishedAt: 'not-a-date' }], creators))
  assert.throws(() => validateCatalog([{ ...games[0], releasePending: false }], creators))
  assert.throws(() => validateCatalog([{ ...games[0], releasePending: true, publishedAt: '2026-09-20T00:00:00Z' }], creators))
  assert.throws(() => validateCatalog([{ ...games[0], thumbnailLayers: [{ src: 'https://evil.example/x' }] }], creators))
  assert.throws(() => validateCatalog([{ ...games[0], leaderboard: { type: 'unknown' } }], creators))
  assert.doesNotThrow(() => validateCatalog([{ ...games[0], leaderboard: { type: 'word-alchemy-v1' } }], creators))
})
test('production URL and preview indexing fail safely', () => {
  assert.equal(siteConfig({}).indexable, false)
  assert.equal(siteConfig({ BROWSER_TEST_PORT: '4174' }).origin, 'http://127.0.0.1:4174')
  assert.throws(() => siteConfig({ BROWSER_TEST_PORT: 'invalid' }))
  assert.equal(siteConfig({ SITE_URL: 'https://gallery.example', CONTEXT: 'production' }).indexable, true)
  assert.equal(siteConfig({ SITE_URL: 'https://gallery.example', CONTEXT: 'deploy-preview' }).indexable, false)
  assert.equal(siteConfig({ SITE_URL: 'https://gallery.example', CONTEXT: 'branch-deploy' }).indexable, false)
  for (const SITE_URL of ['http://gallery.example', 'https://a.example/sub/', 'https://u:p@a.example', 'https://a.example/?q=1']) assert.throws(() => siteConfig({ SITE_URL }))
  assert.throws(() => siteConfig({ CONTEXT: 'production' }))
})
test('only an indexable production build requires release timestamps', () => {
  const pending = [{ id: '123e4567-e89b-42d3-a456-426614174000', releasePending: true }]
  assert.doesNotThrow(() => assertReleaseReady(pending, false))
  assert.throws(() => assertReleaseReady(pending, true), /尚未標記發布時間/)
  assert.doesNotThrow(() => assertReleaseReady([{ ...pending[0], releasePending: undefined, publishedAt: '2026-09-20T00:00:00.000Z' }], true))
})
test('gallery stays strict; runtime sandbox never gains same-origin, navigation or popups', async () => {
  assert.doesNotMatch(galleryCsp, /unsafe-inline|unsafe-eval/)
  assert.match(galleryCsp, /frame-ancestors 'none'/)
  assert.doesNotMatch(gameCsp('https://gallery.example'), /allow-same-origin|allow-top-navigation|allow-popups/)
  const component = await readFile('src/components/GamePlayerDialog.vue', 'utf8')
  assert.match(component, /sandbox="allow-scripts allow-pointer-lock"/)
  const headers = buildHeaders('https://gallery.example', false, ['/works/test/'])
  assert.match(headers, /X-Robots-Tag: noindex/)
  assert.match(headers, /\/works\/test\/index.html/)
  assert.match(headers, /Access-Control-Allow-Origin: \*/)
})
test('preview games allow their deployment asset host without allowing arbitrary hosts', () => {
  const sources = runtimeSources('https://gallery.example', { DEPLOY_URL: 'https://123--gallery.netlify.app', DEPLOY_PRIME_URL: 'https://preview--gallery.netlify.app' })
  assert.match(gameCsp(sources), /connect-src https:\/\/gallery.example https:\/\/123--gallery.netlify.app https:\/\/preview--gallery.netlify.app;/)
  assert.throws(() => runtimeSources('https://gallery.example', { DEPLOY_URL: 'https://bad.example/;unsafe' }))
})
test('anonymous play events use scoped UUID keys and count concurrent events separately', () => {
  const gameId = games[0].id
  const firstEvent = '123e4567-e89b-42d3-a456-426614174000'
  const secondEvent = '123e4567-e89b-42d3-a456-426614174001'
  assert.equal(isValidPlayEvent({ gameId, eventId: firstEvent }), true)
  assert.equal(isValidPlayEvent({ gameId: '../secret', eventId: firstEvent }), false)
  assert.equal(playEventKey(gameId, firstEvent), `${gameId}/${firstEvent}`)
  assert.equal(isProductionPlayRequest('https://giraffegallery.com/.netlify/functions/play-counts', 'https://giraffegallery.com'), true)
  assert.equal(isProductionPlayRequest('https://preview--scratch-gallery.netlify.app/.netlify/functions/play-counts', 'https://preview--scratch-gallery.netlify.app'), false)
  assert.equal(isProductionPlayRequest('https://giraffegallery.com/.netlify/functions/play-counts', 'https://evil.example'), false)
  assert.deepEqual(countPlayEvents([
    { key: `${gameId}/${firstEvent}` },
    { key: `${gameId}/${secondEvent}` },
    { key: `unknown/${firstEvent}` },
  ], [gameId]), { [gameId]: 2 })
})
