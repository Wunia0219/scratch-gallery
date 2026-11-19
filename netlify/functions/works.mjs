import { publicList, publicDetail } from '../lib/public-catalog.mjs'
import { catalogResponse, catalogFailure } from '../lib/catalog-http.mjs'
import { halloweenShowcase } from '../../src/lib/halloweenShowcase.js'
import { readHalloweenShowcase } from '../lib/halloween-showcase.mjs'
export default async request => {
  if (request.method !== 'GET') return catalogResponse({ error: '不支援此操作' }, 405)
  try {
    const url = new URL(request.url), id = url.pathname.match(/^\/api\/works\/([^/]+)$/)?.[1]
    if (url.pathname === halloweenShowcase.api) return catalogResponse(await readHalloweenShowcase(url.searchParams.get('view') === 'teaser'), 200, true)
    const result = id ? await publicDetail(id) : url.pathname === '/api/works' ? await publicList({ role: url.searchParams.get('role') || 'student', q: url.searchParams.get('q') || '', className: url.searchParams.get('className') || '', device: url.searchParams.get('device') || 'all', cursor: url.searchParams.get('cursor') || '' }) : null
    return result ? catalogResponse(result, 200, true) : catalogResponse({ error: '作品不存在' }, 404)
  } catch (error) { return catalogFailure(error) }
}
export const config = { path: ['/api/works', '/api/works/*'] }
