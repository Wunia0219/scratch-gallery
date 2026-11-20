import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { relative, join, sep } from 'node:path'
import { siteConfig } from './site-policy.mjs'
import { loadEnv } from 'vite'
import { releasedFilesOnly } from './lib/released-files.mjs'
import { sharedResourcePaths } from './lib/game-assets.mjs'
import { halloweenShowcase, halloweenWorkIds } from '../src/lib/halloweenShowcase.js'
Object.assign(process.env, loadEnv('production', process.cwd(), ''))
const games = JSON.parse(await readFile('public/games.json', 'utf8'))
const { origin, indexable } = siteConfig()
const firebaseCatalog = process.env.CATALOG_DATA_MODE === 'firebase'
if (indexable) assert.equal(origin, 'https://giraffegallery.com', 'production origin must use the verified custom domain')
const sitemap = await readFile('dist/sitemap.xml', 'utf8')
const titles = new Set()
const released = games.filter(game => !game.releasePending)
if (releasedFilesOnly()) {
  const json = async path => JSON.parse(await readFile(path, 'utf8'))
  const standalone = await json('public/standalone-games.json')
  const allowed = [...released, ...standalone]
  assert.deepEqual(await json('dist/games.json'), released)
  const creators = await json('public/creators.json')
  assert.deepEqual(await json('dist/creators.json'), creators.filter(c => released.some(g => g.creatorId === c.id)))
  assert.deepEqual(new Set(await readdir('dist/games')), new Set(['_shared', ...allowed.map(g => g.id)]))
  assert.deepEqual(new Set(await readdir('dist/works')), new Set(released.map(g => g.id)))
  const manifest = await json('dist/game-assets.json')
  assert.deepEqual(manifest.works.map(w => w.id), released.map(g => g.id))
  assert.deepEqual(await json('.netlify/catalog/assets.json'), manifest)
  const shared = new Set()
  for (const game of allowed) for (const path of await sharedResourcePaths('public', game)) shared.add(path)
  const files = await readdir('dist/games/_shared', { recursive: true, withFileTypes: true })
  const paths = files.filter(file => file.isFile()).map(file => {
    return '/' + relative('dist', join(file.parentPath, file.name)).split(sep).join('/')
  })
  assert.deepEqual(new Set(paths), shared)
}
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
const privateNames = [
  /^\.(?:env(?:\..*)?|git|netlify|packages|npmrc|yarnrc\.yml)$/i,
  /^(?:id_rsa|id_ed25519)$/i,
  /\.(?:pem|key|p12|pfx|sb3|zip|map)$/i,
  /(?:^service-account.*|-firebase-adminsdk-.*|-private-properties)\.json$/i,
]
async function inspect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`
    assert.ok(!privateNames.some(pattern => pattern.test(entry.name)), `private/source file in deploy: ${file}`)
    if (entry.isDirectory()) await inspect(file)
    else if (entry.name.toLowerCase().endsWith('.json')) {
      const content = await readFile(file, 'utf8')
      let data
      try { data = JSON.parse(content) } catch { throw new Error(`invalid JSON in deploy: ${file}`) }
      assert.ok(data?.type !== 'service_account' && !data?.private_key && !data?.SYNC_KEY && !data?.CONTROL_KEY, `credential JSON in deploy: ${file}`)
    }
  }
}
await inspect('dist')
console.log(`部署輸出檢查通過：${titles.size} 頁、收錄設定、站內連結與敏感檔名。`)
