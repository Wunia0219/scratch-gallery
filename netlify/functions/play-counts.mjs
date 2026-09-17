import { getStore } from '@netlify/blobs'
import games from '../../public/games.json' with { type: 'json' }
import { PLAY_EVENT_STORE, countPlayEvents, isProductionPlayRequest, isValidPlayEvent, playEventKey } from '../lib/play-events.mjs'

const gameIds = games.map(game => game.id)
const knownGameIds = new Set(gameIds)
const responseHeaders = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders })
}

export default async function playCounts(request) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { ...responseHeaders, allow: 'GET, POST' } })
  }

  try {
    const store = getStore({ name: PLAY_EVENT_STORE, consistency: 'strong' })

    if (request.method === 'GET') {
      const { blobs } = await store.list()
      return json({ counts: countPlayEvents(blobs, gameIds) })
    }

    if (!isProductionPlayRequest(request.url, request.headers.get('origin'))) return json({ error: 'Production writes only' }, 403)
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return json({ error: 'JSON content type required' }, 415)
    }
    const contentLength = Number(request.headers.get('content-length') || 0)
    if (contentLength > 512) return json({ error: 'Request too large' }, 413)

    let event
    try {
      event = await request.json()
    } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }
    if (!isValidPlayEvent(event) || !knownGameIds.has(event.gameId)) return json({ error: 'Invalid play event' }, 400)

    await store.set(playEventKey(event.gameId, event.eventId), new Date().toISOString())
    const { blobs } = await store.list({ prefix: `${event.gameId}/` })
    return json({ count: blobs.length }, 201)
  } catch (error) {
    console.error('Play count storage failed', error)
    return json({ error: 'Play counts temporarily unavailable' }, 503)
  }
}
