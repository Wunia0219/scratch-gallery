import { UUID_PATTERN } from './identifiers.js'
import { rankLeaderboard, validateLeaderboardScore } from './leaderboardRules.js'
import { readStoredObject } from './storage.js'

const API_PATH = '/.netlify/functions/word-alchemy-leaderboard'
const LOCAL_KEY = 'scratch-gallery:leaderboards:v1'

function isLocal() {
  return ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

export async function loadLeaderboard(gameId) {
  if (isLocal()) return rankLeaderboard(readStoredObject(LOCAL_KEY)[gameId])
  const response = await fetch(`${API_PATH}?gameId=${encodeURIComponent(gameId)}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`Leaderboard request failed: ${response.status}`)
  const data = await response.json()
  if (!Array.isArray(data?.leaderboard)) throw new Error('Invalid leaderboard response')
  return data.leaderboard
}

export async function submitLeaderboard(entry) {
  const score = validateLeaderboardScore(entry)
  if (!score || !UUID_PATTERN.test(entry.gameId || '') || !UUID_PATTERN.test(entry.eventId || '')) throw new Error('Invalid leaderboard submission')
  entry = { gameId: entry.gameId, eventId: entry.eventId, ...score }
  if (isLocal()) {
    const data = readStoredObject(LOCAL_KEY)
    const previous = Array.isArray(data[entry.gameId]) ? data[entry.gameId] : []
    data[entry.gameId] = [...previous, { ...entry, achievedAt: new Date().toISOString() }]
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data))
    return rankLeaderboard(data[entry.gameId])
  }
  const response = await fetch(API_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(entry),
    signal: AbortSignal.timeout(10000),
    keepalive: true,
  })
  if (!response.ok) throw new Error(`Leaderboard submission failed: ${response.status}`)
  const data = await response.json()
  if (!Array.isArray(data?.leaderboard)) throw new Error('Invalid leaderboard response')
  return data.leaderboard
}
