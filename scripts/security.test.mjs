import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validateCatalog, isLocalAsset } from '../src/lib/catalog.js'
import { siteConfig, galleryCsp, gameCsp, buildHeaders, runtimeSources } from './site-policy.mjs'
const games = JSON.parse(await readFile('public/games.json', 'utf8'))
const creators = JSON.parse(await readFile('public/creators.json', 'utf8'))
test('catalog accepts real games and rejects executable URLs, traversal and duplicates', () => {
  assert.equal(validateCatalog(games, creators).length, games.length)
  for (const playUrl of ['javascript:alert(1)', '//evil.example/game', '/games/../index.html', 'https://evil.example/']) {
    assert.throws(() => validateCatalog([{ ...games[0], playUrl }], creators))
  }
  for (const value of ['/games/../secret', '/games/%2e%2e/secret', '//evil.example/x', 'data:image/svg+xml,x', '/games/x?y', '/games/x\\y']) assert.equal(isLocalAsset(value), false)
  assert.throws(() => validateCatalog([games[0], games[0]], creators))
  assert.throws(() => validateCatalog([{ ...games[0], thumbnailLayers: [{ src: 'https://evil.example/x' }] }], creators))
})
test('production URL and preview indexing fail safely', () => {
  assert.equal(siteConfig({}).indexable, false)
  assert.equal(siteConfig({ SITE_URL: 'https://gallery.example', CONTEXT: 'production' }).indexable, true)
  assert.equal(siteConfig({ SITE_URL: 'https://gallery.example', CONTEXT: 'deploy-preview' }).indexable, false)
  assert.equal(siteConfig({ SITE_URL: 'https://gallery.example', CONTEXT: 'branch-deploy' }).indexable, false)
  for (const SITE_URL of ['http://gallery.example', 'https://a.example/sub/', 'https://u:p@a.example', 'https://a.example/?q=1']) assert.throws(() => siteConfig({ SITE_URL }))
  assert.throws(() => siteConfig({ CONTEXT: 'production' }))
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
