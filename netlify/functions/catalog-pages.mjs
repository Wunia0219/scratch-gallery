import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { publicList, publicDetail } from '../lib/public-catalog.mjs'
import { galleryCsp } from '../../scripts/site-policy.mjs'
let runtime
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const json = value => JSON.stringify(value).replaceAll('<', '\\u003c')
async function loadRuntime() {
  runtime ??= Promise.all([import(pathToFileURL(resolve('.netlify/server/catalog.mjs')).href), readFile(resolve('.netlify/server/catalog-template.json'), 'utf8').then(JSON.parse)])
  return runtime
}
export function createCatalogPageHandler(load = loadRuntime) { return async request => {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } })
  const path = new URL(request.url).pathname.replace(/index\.html$/, '')
  const [{ renderCatalog }, template] = await load()
  const { origin, indexable } = template
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate', 'Netlify-CDN-Cache-Control': 'public, durable, max-age=15', 'Netlify-Cache-Tag': 'catalog', 'Content-Security-Policy': galleryCsp, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Strict-Transport-Security': 'max-age=31536000', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()', ...(!indexable ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}) }
  let status = 200, data, props, kind, title, description, body
  try {
    if (path === '/sitemap.xml') {
      const paths = ['/', '/students/', '/teachers/']
      if (indexable) for (const role of ['student', 'teacher']) {
        let cursor = ''
        do { const page = await publicList({ role, cursor }); paths.push(...page.items.map(work => work.detailUrl)); cursor = page.cursor || '' } while (cursor)
      }
      body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${indexable ? paths.map(route => `<url><loc>${escape(origin + route)}</loc></url>`).join('') : ''}</urlset>`
      headers['Content-Type'] = 'application/xml; charset=utf-8'
    } else {
      const role = path === '/students/' ? 'student' : path === '/teachers/' ? 'teacher' : null
      if (role) {
        kind = 'gallery'; props = { creatorType: role }; data = await publicList({ role })
        title = `${role === 'teacher' ? '老師' : '學生'} Scratch 作品集｜東勢長頸鹿`
        description = role === 'teacher' ? '瀏覽東勢長頸鹿老師設計的 Scratch 遊戲、教學示範與互動創作。' : '瀏覽東勢長頸鹿學生完成的 Scratch 遊戲與互動創作，依班級、裝置或關鍵字探索作品。'
      } else {
        const id = path.match(/^\/works\/([^/]+)\/$/)?.[1]
        if (!id) throw Object.assign(new Error('作品不存在'), { status: 404 })
        kind = 'work'; props = { id }; data = await publicDetail(id)
        title = `${data.game.title}｜${data.game.student}的 Scratch 作品｜東勢長頸鹿`
        description = `${data.game.description} 探索${data.game.student}的 Scratch 創作，點選封面即可線上遊玩。`
      }
    }
  } catch (error) {
    status = error.status === 404 ? 404 : 503
    title = status === 404 ? '找不到這個作品｜Scratch 創作館' : '作品暫時無法載入｜Scratch 創作館'
    description = status === 404 ? '作品可能已移動或下架。' : '請稍後重新載入。'
    kind = 'work'; props = { id: path.split('/')[2] || '' }; data = { status }
    headers['Cache-Control'] = 'no-store'; headers['Netlify-CDN-Cache-Control'] = 'no-store'; headers['X-Robots-Tag'] = 'noindex, nofollow'
    if (path === '/sitemap.xml') { headers['Content-Type'] = 'application/xml; charset=utf-8'; body = '<error>作品服務暫時無法取得</error>' }
  }
  if (body === undefined) {
    let rendered = await renderCatalog(kind, props, data)
    for (const asset of Object.values(template.assets)) if (asset.src) rendered = rendered.replaceAll(`/${asset.src}`, `/${asset.file}`)
    const canonical = origin + path, image = origin + (data?.game?.thumbnail || '/brand/dongshi-giraffe-logo.webp')
    const metadata = `<meta name="robots" content="${status === 200 && indexable ? 'index, follow' : 'noindex, nofollow'}">${status === 200 && indexable ? `<link rel="canonical" href="${escape(canonical)}">` : ''}<meta property="og:type" content="website"><meta property="og:locale" content="zh_TW"><meta property="og:site_name" content="東勢長頸鹿 Scratch 創作館"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(canonical)}"><meta property="og:image" content="${escape(image)}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}"><meta name="twitter:image" content="${escape(image)}">`
    body = template.html.replace(/<title>.*?<\/title>/s, () => `<title>${escape(title)}</title>`).replace(/<meta name="description"[^>]*>/, () => `<meta name="description" content="${escape(description)}">`).replace('</head>', `${metadata}</head>`).replace('<div id="app"></div>', () => `<div id="app">${rendered}</div>`).replace('</body>', () => `<script type="application/json" id="catalog-state">${json(data)}</script></body>`)
  }
  return new Response(request.method === 'HEAD' ? null : body, { status, headers })
} }
export default createCatalogPageHandler()
export const config = { path: ['/students/', '/students/index.html', '/teachers/', '/teachers/index.html', '/works/*', '/sitemap.xml'] }
