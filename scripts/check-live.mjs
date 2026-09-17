import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const target = process.argv[2]
if (!target || new URL(target).protocol !== 'https:') throw new Error('用法：npm run check:live -- https://正式網址')
const origin = new URL(target).origin
const games = JSON.parse(await readFile('public/games.json', 'utf8'))
async function get(path) {
  return fetch(origin + path, { signal: AbortSignal.timeout(15000) })
}
for (const path of ['/', `/works/${games[0].id}/`]) {
  const response = await get(path)
  assert.equal(response.status, 200, path)
  assert.match(response.headers.get('content-security-policy') || '', /frame-ancestors 'none'/)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.ok(response.headers.get('strict-transport-security'))
  assert.doesNotMatch(response.headers.get('x-robots-tag') || '', /noindex/)
  const html = await response.text()
  assert.ok(html.includes(`rel="canonical" href="${origin}${path}"`))
  assert.ok(!html.includes('content="noindex, nofollow"'))
}
const runtime = await get(games[0].playUrl)
assert.equal(runtime.status, 200)
assert.match(runtime.headers.get('content-security-policy') || '', /sandbox allow-scripts allow-pointer-lock/)
assert.doesNotMatch(runtime.headers.get('content-security-policy') || '', /allow-same-origin/)
assert.match(runtime.headers.get('x-robots-tag') || '', /noindex/)
assert.equal(runtime.headers.get('access-control-allow-origin'), '*')
assert.equal((await get('/works/this-page-must-not-exist/')).status, 404)
assert.ok((await (await get('/robots.txt')).text()).includes(`Sitemap: ${origin}/sitemap.xml`))
assert.ok((await (await get('/sitemap.xml')).text()).includes(`<loc>${origin}/</loc>`))
const legacy = await fetch('https://scratch-gallery.netlify.app/', { redirect: 'manual', signal: AbortSignal.timeout(15000) })
assert.equal(legacy.status, 301)
assert.equal(legacy.headers.get('location'), `${origin}/`)
console.log('線上正式站抽查通過：HTTPS、安全標頭、作品頁、canonical、sitemap、404。請另外實際遊玩與測試分享預覽。')
