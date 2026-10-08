import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createCatalogPageHandler } from '../netlify/functions/catalog-pages.mjs'
import api from '../netlify/functions/works.mjs'
import { legacyCatalog } from '../netlify/lib/catalog-runtime.mjs'
import { renderCatalog } from '../.netlify/server/catalog.mjs'
const previous = { CATALOG_DATA_MODE: process.env.CATALOG_DATA_MODE, SITE_URL: process.env.SITE_URL, CONTEXT: process.env.CONTEXT }
const template = JSON.parse(await readFile('.netlify/server/catalog-template.json', 'utf8'))
const handler = createCatalogPageHandler(async () => [{ renderCatalog }, { ...template, origin: 'https://giraffegallery.com', indexable: true }])
try {
  process.env.CATALOG_DATA_MODE = 'legacy'; process.env.SITE_URL = 'https://giraffegallery.com'; delete process.env.CONTEXT
  const game = legacyCatalog()[0]
  const response = await handler(new Request(`https://giraffegallery.com${game.detailUrl}`)), html = await response.text()
  assert.equal(response.status, 200); assert.match(html, /id="catalog-state"/)
  assert.ok(html.includes(game.title)); assert.ok(html.includes(`rel="canonical" href="https://giraffegallery.com${game.detailUrl}"`))
  assert.doesNotMatch(html, /(?:src|href)="\/src\//)
  const list = await api(new Request('https://giraffegallery.com/api/works?role=student'))
  assert.equal((await list.json()).items.length, Math.min(9, legacyCatalog().filter(game => game.creatorType === 'student').length))
  const unknown = await handler(new Request('https://giraffegallery.com/works/123e4567-e89b-42d3-a456-426614174fff/'))
  assert.equal(unknown.status, 404); assert.equal(unknown.headers.get('cache-control'), 'no-store'); assert.doesNotMatch(await unknown.text(), /萬聖節魔法|id="site-state"/)
  assert.equal((await handler(new Request('https://giraffegallery.com/works/invalid/extra/'))).status, 404)
  const sitemap = await (await handler(new Request('https://giraffegallery.com/sitemap.xml'))).text()
  assert.equal((sitemap.match(/<loc>/g) || []).length, legacyCatalog().length + 3)
  assert.doesNotMatch(sitemap, /\/games\//)
  const escaped = await renderCatalog('work', { id: game.id }, { game: { ...game, title: '</script><script>alert(1)</script>' }, related: [] })
  assert.match(escaped, /&lt;\/script&gt;/); assert.doesNotMatch(escaped, /<script>alert/)
  process.env.CATALOG_DATA_MODE = 'invalid'
  const failed = await handler(new Request('https://giraffegallery.com/students/'))
  assert.equal(failed.status, 503); assert.equal(failed.headers.get('cache-control'), 'no-store'); assert.match(await failed.text(), /作品暫時無法載入/)
  const config = await readFile('netlify.toml', 'utf8')
  assert.match(config, /\[functions\.catalog-pages\][\s\S]*?\.netlify\/catalog\/\*\*/)
  assert.equal((await readdir('.netlify/server')).includes('games'), false)
  console.log('PASS catalog server HTML, metadata, sitemap, 9-item API, escaped content, real 404/503 and runtime files.')
} finally { for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value }
