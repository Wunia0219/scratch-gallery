export const PLAY_EVENT_STORE = 'scratch-gallery-play-events'
export const PRODUCTION_ORIGIN = 'https://giraffegallery.com'
import { UUID_PATTERN } from '../../src/lib/identifiers.js'
export { UUID_PATTERN }

export function isValidPlayEvent(value) {
  return Boolean(value)
    && typeof value === 'object'
    && UUID_PATTERN.test(value.gameId || '')
    && UUID_PATTERN.test(value.eventId || '')
}

export function playEventKey(gameId, eventId) {
  if (!UUID_PATTERN.test(gameId) || !UUID_PATTERN.test(eventId)) throw new Error('Invalid play event identifier')
  return `${gameId}/${eventId}`
}

export function isProductionPlayRequest(requestUrl, origin) {
  return new URL(requestUrl).origin === PRODUCTION_ORIGIN && (!origin || origin === PRODUCTION_ORIGIN)
}

export function countPlayEvents(blobs, gameIds) {
  const counts = Object.fromEntries(gameIds.map(id => [id, 0]))
  for (const blob of blobs) {
    const gameId = blob.key.split('/', 1)[0]
    if (Object.hasOwn(counts, gameId)) counts[gameId] += 1
  }
  return counts
}
