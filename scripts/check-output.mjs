import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { siteConfig } from './site-policy.mjs'
import { loadEnv } from 'vite'
import { halloweenShowcase, halloweenWorkIds } from '../src/lib/halloweenShowcase.js'
Object.assign(process.env, loadEnv('production', process.cwd(), ''))
const games = JSON.parse(await readFile('public/games.json', 'utf8'))
const { origin, indexable } = siteConfig()
const firebaseCatalog = process.env.CATALOG_DATA_MODE === 'firebase'
if (indexable) assert.equal(origin, 'https://giraffegallery.com', 'production origin must use the verified custom domain')
const sitemap = await readFile('dist/sitemap.xml', 'utf8')
const titles = new Set()
const released = games.filter(game => !game.releasePending)
const showcasePublished = released.some(game => halloweenWorkIds.includes(game.id))
const pageRoutes = firebaseCatalog ? ['/'] : ['/', '/students/', '/teachers/', halloweenShowcase.path, ...released.map(g => `/works/${g.id}/`)]
for (const route of pageRoutes) {
  const html = await readFile(`dist${route}index.html`, 'utf8')
  assert.equal((html.match(/<h1\b/g) || []).length, 1, `${route} missing or duplicate h1`)
  assert.match(html, /property="og:title"/)
  if (indexable) assert.ok(html.includes(`property="og:url" content="${origin}${route}"`))
  assert.doesNotMatch(html, /(?:src|href)="\/src\//, 'development asset URL in generated HTML')
  const pageIndexable = indexable && (route !== halloweenShowcase.path || showcasePublished)
  assert.match(html, new RegExp(`content="${pageIndexable ? 'index, follow' : 'noindex, nofollow'}"`))
  if (pageIndexable) assert.ok(html.includes(`rel="canonical" href="${origin}${route}"`))
  const title = html.match(/<title>(.*?)<\/title>/s)[1]
  assert.ok(!titles.has(title), `duplicate title: ${title}`)
  titles.add(title)
  if (route !== '/') assert.equal(sitemap.includes(`<loc>${origin}${route}</loc>`), pageIndexable, 'page and sitemap indexing differ')
}
assert.equal((sitemap.match(/<loc>/g) || []).length, indexable && !firebaseCatalog ? released.length + 3 + Number(showcasePublished) : 0)
if (firebaseCatalog) {
  const files = await readdir('dist')
  assert.equal(files.includes('works'), false, 'Firebase build must not publish stale static work pages')
  assert.equal(files.includes('events'), false, 'Firebase build must not publish stale static showcase pages')
  assert.equal(files.includes('games.json'), false, 'draft source catalog must not be public')
  assert.equal(files.includes('creators.json'), false)
  assert.ok((await readFile('.netlify/server/catalog-template.json', 'utf8')).includes('id=\\"app\\"'))
}
assert.doesNotMatch(sitemap, /\/games\//)
const admin = await readFile('dist/admin/index.html', 'utf8')
assert.match(admin, /name="robots" content="noindex, nofollow"/)
assert.doesNotMatch(sitemap, /\/admin\//)
assert.doesNotMatch(admin, /PRIVATE KEY|FIREBASE_PRIVATE_KEY|GOOGLE_APPLICATION_CREDENTIALS/)
const headers = await readFile('dist/_headers', 'utf8')
assert.match(headers, /\/admin\/\n  Content-Security-Policy: [^\n]+\n  X-Frame-Options: DENY\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-store/)
// Prevent common accidental secret/build-source publication; not a comprehensive secret scanner.
async function inspect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    assert.ok(!/^(?:\.env(?:\..*)?|\.git|\.netlify|id_rsa|id_ed25519)$|\.(?:pem|key|sb3|zip|map)$/i.test(entry.name), `private/source file in deploy: ${dir}/${entry.name}`)
    if (entry.isDirectory()) await inspect(`${dir}/${entry.name}`)
  }
}
await inspect('dist')
console.log(`部署輸出檢查通過：${titles.size} 頁、收錄設定、站內連結與敏感檔名。`)
