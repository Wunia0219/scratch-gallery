import { ActivityError } from '../../src/lib/activitySchema.js'
export function catalogResponse(value, status = 200, isPublic = false) {
  return Response.json(value, { status, headers: { 'Cache-Control': isPublic && status === 200 ? 'public, max-age=0, must-revalidate' : 'no-store', ...(isPublic && status === 200 ? { 'Netlify-CDN-Cache-Control': 'public, durable, max-age=15', 'Netlify-Cache-Tag': 'catalog', 'Netlify-Vary': 'query' } : {}), 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' } })
}
export function catalogFailure(error) {
  if (error instanceof ActivityError) return catalogResponse({ error: error.message }, error.status)
  console.error('Catalog service unavailable:', error?.code ?? error?.name)
  return catalogResponse({ error: '作品服務暫時無法取得，請稍後重試' }, 503)
}
