import { UUID_PATTERN } from './identifiers.js'
import { validateLeaderboardScore } from './leaderboardRules.js'

const API_PATH = '/.netlify/functions/word-alchemy-leaderboard'
const LOCAL_KEY = 'scratch-gallery:leaderboards:v1'

function sort(entries) {
  const best = new Map()
  for (const entry of entries) {
    const key = entry.player.normalize('NFKC').toLocaleLowerCase('zh-Hant')
    const previous = best.get(key)
    if (!previous || entry.floor > previous.floor || (entry.floor === previous.floor && entry.score > previous.score)) best.set(key, entry)
  }
  return [...best.values()].sort((a, b) => b.floor - a.floor || b.score - a.score || a.achievedAt.localeCompare(b.achievedAt)).slice(0, 5)
}

function localData() {
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch { return {} }
}

function isLocal() {
  return ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

export async function loadLeaderboard(gameId) {
  if (isLocal()) return sort(localData()[gameId] || [])
  const response = await fetch(`${API_PATH}?gameId=${encodeURIComponent(gameId)}`, { headers: { accept: 'application/json' } })
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
    const data = localData()
    data[entry.gameId] = [...(data[entry.gameId] || []), { ...entry, achievedAt: new Date().toISOString() }]
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data))
    return sort(data[entry.gameId])
  }
  const response = await fetch(API_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(entry),
  })
  if (!response.ok) throw new Error(`Leaderboard submission failed: ${response.status}`)
  const data = await response.json()
  if (!Array.isArray(data?.leaderboard)) throw new Error('Invalid leaderboard response')
  return data.leaderboard
}
