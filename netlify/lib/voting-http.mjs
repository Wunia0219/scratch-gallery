import { ActivityError } from '../../src/lib/activitySchema.js'
export function votingResponse(value, status = 200, isPublic = false) {
  return Response.json(value, { status, headers: { 'Cache-Control': isPublic && status === 200 ? 'public, max-age=0, must-revalidate' : 'no-store',
    ...(isPublic && status === 200 ? { 'Netlify-CDN-Cache-Control': 'public, durable, max-age=15', 'Netlify-Cache-Tag': 'voting', 'Netlify-Vary': 'query' } : {}),
    'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' } })
}
export function votingFailure(error) {
  if (error instanceof ActivityError) return votingResponse({ error: error.message }, error.status)
  console.error('Voting service failed:', error?.code || error?.name || 'unknown')
  return votingResponse({ error: '投票服務暫時無法使用，請稍後重試' }, 503)
}
export async function readVotingBody(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ActivityError('請使用 JSON 格式', 415)
  const reader = request.body?.getReader(), chunks = []; let length = 0
  if (!reader) throw new ActivityError('缺少投票資料')
  while (true) {
    const { done, value } = await reader.read(); if (done) break
    length += value.byteLength
    if (length > 64000) { await reader.cancel(); throw new ActivityError('投票資料過長', 413) }
    chunks.push(Buffer.from(value))
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new ActivityError('投票資料格式不正確') }
}
