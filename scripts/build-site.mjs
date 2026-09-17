import { readFile, writeFile, mkdir, unlink, rmdir } from 'node:fs/promises'
import { createServer } from 'vite'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { siteConfig, buildHeaders, runtimeSources } from './site-policy.mjs'

export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const { origin, indexable } = siteConfig()
const template = await readFile('dist/index.html', 'utf8')
const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'))
function productionAssets(html) {
  for (const asset of Object.values(manifest)) {
    if (asset.src) html = html.replaceAll(`/${asset.src}`, `/${asset.file}`)
  }
  return html
}
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { default: App } = await server.ssrLoadModule('/src/App.vue')
  const { default: WorkPage } = await server.ssrLoadModule('/src/WorkPage.vue')
  const { catalog } = await server.ssrLoadModule('/src/composables/useGames.js')
  const pages = [{ path: '/', title: '東勢長頸鹿美語｜Scratch 遊戲與學生創作成果展', description: '探索東勢長頸鹿美語的 Scratch 學生與老師作品，線上遊玩互動遊戲、欣賞程式創作成果。', component: App },
    ...catalog.map(game => ({ path: game.detailUrl, title: `${game.title}｜${game.student}的 Scratch 作品｜東勢長頸鹿`, description: `${game.description} 探索${game.student}的 Scratch 創作，點選封面即可線上遊玩。`, component: WorkPage, game }))]
  for (const page of pages) {
    const canonical = origin + page.path
    const image = origin + (page.game?.thumbnail?.endsWith('.webp') ? page.game.thumbnail : '/brand/dongshi-giraffe-logo.webp')
    const metadata = `<meta name="robots" content="${indexable ? 'index, follow' : 'noindex, nofollow'}">\n${indexable ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : ''}\n<meta property="og:type" content="website"><meta property="og:locale" content="zh_TW"><meta property="og:site_name" content="東勢長頸鹿 Scratch 創作館"><meta property="og:title" content="${escapeHtml(page.title)}"><meta property="og:description" content="${escapeHtml(page.description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:image" content="${escapeHtml(image)}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escapeHtml(page.title)}"><meta name="twitter:description" content="${escapeHtml(page.description)}"><meta name="twitter:image" content="${escapeHtml(image)}">`
    const html = template.replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(page.title)}</title>`)
      .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escapeHtml(page.description)}">`)
      .replace('</head>', `${metadata}\n</head>`)
      .replace('<div id="app"></div>', `<div id="app">${await renderToString(createSSRApp(page.component, page.game ? { game: page.game } : {}))}</div>`)
    await mkdir(`dist${page.path}`, { recursive: true })
    await writeFile(`dist${page.path}index.html`, productionAssets(html))
  }
  await writeFile('dist/robots.txt', `User-agent: *\nAllow: /\n${indexable ? `Sitemap: ${origin}/sitemap.xml\n` : ''}`)
  await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${indexable ? pages.map(p => `<url><loc>${escapeHtml(origin + p.path)}</loc></url>`).join('') : ''}</urlset>`)
  await writeFile('dist/_headers', buildHeaders(origin, indexable, catalog.map(g => g.detailUrl), runtimeSources(origin)))
  await writeFile('dist/404.html', '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>找不到頁面｜Scratch 創作館</title><main><h1>找不到這個頁面</h1><p>作品可能已移動或下架。</p><a href="/">返回創作館</a></main></html>')
  console.log(`已產生 ${pages.length} 個靜態頁面；${indexable ? `正式收錄網址：${origin}` : '預覽模式：不收錄，無正式 sitemap 網址'}。`)
  await unlink('dist/.vite/manifest.json')
  await rmdir('dist/.vite')
} finally { await server.close() }
