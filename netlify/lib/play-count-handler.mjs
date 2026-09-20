import { PLAY_EVENT_STORE, isProductionPlayRequest, isValidPlayEvent, playEventKey } from './play-events.mjs'

const headers = { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' }
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } })

export function createPlayCountHandler(getStore, gameIds) {
  const knownIds = new Set(gameIds)
  return async request => {
    if (!['GET', 'POST'].includes(request.method)) return new Response(null, { status: 405, headers: { ...headers, allow: 'GET, POST' } })
    try {
      if (request.method === 'GET') {
        const store = getStore({ name: PLAY_EVENT_STORE, consistency: 'strong' })
        const counts = Object.fromEntries(gameIds.map(id => [id, 0]))
        // Consume pages incrementally rather than collecting every event in RAM.
        for await (const { blobs } of store.list({ paginate: true })) {
          for (const { key } of blobs) {
            const id = key.split('/', 1)[0]
            if (knownIds.has(id)) counts[id]++
          }
        }
        // Public aggregate only. Writes/errors never receive a CDN cache policy.
        return json({ counts }, 200, {
          'cache-control': 'public, max-age=0, must-revalidate',
          'netlify-cdn-cache-control': 'public, durable, max-age=60',
        })
      }
      if (!isProductionPlayRequest(request.url, request.headers.get('origin'))) return json({ error: 'Production writes only' }, 403)
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'JSON content type required' }, 415)
      // Enforce actual bytes too: chunked requests may omit content-length.
      const reader = request.body?.getReader()
      let body = ''
      if (reader) {
        const chunks = []
        let size = 0
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > 512) { await reader.cancel(); return json({ error: 'Request too large' }, 413) }
          chunks.push(value)
        }
        body = new TextDecoder().decode(Buffer.concat(chunks))
      }
      let event
      try { event = JSON.parse(body) } catch { return json({ error: 'Invalid JSON' }, 400) }
      if (!isValidPlayEvent(event) || !knownIds.has(event.gameId)) return json({ error: 'Invalid play event' }, 400)
      const store = getStore({ name: PLAY_EVENT_STORE, consistency: 'strong' })
      await store.set(playEventKey(event.gameId, event.eventId), new Date().toISOString())
      let count = 0
      for await (const { blobs } of store.list({ prefix: `${event.gameId}/`, paginate: true })) count += blobs.length
      return json({ count }, 201)
    } catch (error) {
      console.error('Play count storage failed', error)
      return json({ error: 'Play counts temporarily unavailable' }, 503)
    }
  }
}
