import { UUID_PATTERN } from '../../src/lib/identifiers.js'
import { isProductionPlayRequest } from './play-events.mjs'
import { createHash } from 'node:crypto'
import { compareScores, rankLeaderboard, normalizePlayerName, scoreBounds, validateLeaderboardScore } from '../../src/lib/leaderboardRules.js'

export { compareScores, rankLeaderboard, normalizePlayerName, scoreBounds }

export const LEADERBOARD_STORE = 'scratch-gallery-leaderboard-events'
export const LEADERBOARD_TYPE = 'word-alchemy-v1'

const headers = { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers })

export function leaderboardKey(gameId, player) {
  if (!UUID_PATTERN.test(gameId)) throw new Error('Invalid leaderboard game identifier')
  const normalized = normalizePlayerName(player).toLocaleLowerCase('en-US')
  if (!normalized) throw new Error('Invalid leaderboard player')
  return `${gameId}/${createHash('sha256').update(normalized).digest('hex')}`
}

export function validateLeaderboardEvent(value, knownGames) {
  if (!value || typeof value !== 'object' || !knownGames.has(value.gameId)) return null
  if (!UUID_PATTERN.test(value.gameId || '') || !UUID_PATTERN.test(value.eventId || '')) return null
  const result = validateLeaderboardScore(value)
  return result && { gameId: value.gameId, eventId: value.eventId, ...result }
}

async function readBody(request, maximum = 1024) {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maximum) { await reader.cancel(); return null }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

async function loadEvents(store, gameId) {
  const events = []
  for await (const { blobs } of store.list({ prefix: `${gameId}/`, paginate: true })) {
    for (const { key } of blobs) {
      const value = await store.get(key, { type: 'json' })
      if (value) events.push(value)
    }
  }
  return events
}

export function createLeaderboardHandler(getStore, gameIds, clock = () => new Date().toISOString()) {
  const knownGames = new Set(gameIds)
  return async request => {
    if (!['GET', 'POST'].includes(request.method)) return new Response(null, { status: 405, headers: { ...headers, allow: 'GET, POST' } })
    try {
      const store = getStore({ name: LEADERBOARD_STORE, consistency: 'strong' })
      if (request.method === 'GET') {
        const gameId = new URL(request.url).searchParams.get('gameId') || ''
        if (!knownGames.has(gameId)) return json({ error: 'Unknown leaderboard' }, 404)
        return json({ leaderboard: rankLeaderboard(await loadEvents(store, gameId)) })
      }
      if (!isProductionPlayRequest(request.url, request.headers.get('origin'))) return json({ error: 'Production writes only' }, 403)
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'JSON content type required' }, 415)
      const body = await readBody(request)
      if (body === null) return json({ error: 'Request too large' }, 413)
      let submitted
      try { submitted = JSON.parse(body) } catch { return json({ error: 'Invalid JSON' }, 400) }
      const event = validateLeaderboardEvent(submitted, knownGames)
      if (!event) return json({ error: 'Invalid leaderboard event' }, 400)
      const key = leaderboardKey(event.gameId, event.player)
      const existing = await store.get(key, { type: 'json' })
      const stored = { ...event, achievedAt: clock() }
      if (!existing || compareScores(stored, existing) < 0) await store.set(key, JSON.stringify(stored))
      return json({ leaderboard: rankLeaderboard(await loadEvents(store, event.gameId)) }, 201)
    } catch (error) {
      console.error('Leaderboard storage failed', error)
      return json({ error: 'Leaderboard temporarily unavailable' }, 503)
    }
  }
}
