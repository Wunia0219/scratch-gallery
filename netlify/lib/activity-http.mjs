import { ActivityError } from '../../src/lib/activitySchema.js'
export function activityResponse(value, status = 200, isPublic = false) {
  return Response.json(value, { status, headers: {
    'Cache-Control': isPublic && status === 200 ? 'public, max-age=0, must-revalidate' : 'no-store',
    ...(isPublic && status === 200 ? { 'Netlify-CDN-Cache-Control': 'public, durable, max-age=15', 'Netlify-Cache-Tag': 'activities', 'Netlify-Vary': 'query' } : {}),
    'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow',
  } })
}
export function activityFailure(error) {
  if (error instanceof ActivityError) return activityResponse({ error: error.message }, error.status)
  console.error('Activity service failed', error?.code ?? error?.name ?? 'unknown')
  return activityResponse({ error: '暫時無法連接活動服務，請稍後重試' }, 503)
}
export async function readActivityBody(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ActivityError('請使用 JSON 格式', 415)
  const chunks = [], reader = request.body?.getReader()
  let length = 0
  if (!reader) throw new ActivityError('缺少活動內容')
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > 16000) { await reader.cancel(); throw new ActivityError('活動內容過長', 413) }
    chunks.push(Buffer.from(value))
  }
  const body = Buffer.concat(chunks).toString('utf8')
  try { return JSON.parse(body) } catch { throw new ActivityError('資料格式不正確') }
}
