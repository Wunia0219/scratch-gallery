import { readonly, ref } from 'vue'
import { readStoredObject as readObject, writeStored } from '../lib/storage.js'

const API_PATH = '/.netlify/functions/play-counts'
const COOLDOWN_MS = 30 * 60 * 1000
const COUNTS_KEY = 'scratch-gallery:dev-play-counts:v1'
const COOLDOWNS_KEY = 'scratch-gallery:play-cooldowns:v1'
const counts = ref({})
const loaded = ref(false)
let loadingPromise
const pendingGames = new Set()
const sessionCooldowns = {}

function mergeCounts(incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return
  const next = { ...counts.value }
  for (const [id, count] of Object.entries(incoming)) {
    if (Number.isSafeInteger(count) && count >= 0) next[id] = Math.max(next[id] || 0, count)
  }
  counts.value = next
}

function isLocalDevelopment() {
  return ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function saveCooldown(gameId, time) {
  sessionCooldowns[gameId] = time
  const cooldowns = readObject(COOLDOWNS_KEY)
  cooldowns[gameId] = time
  writeStored(COOLDOWNS_KEY, JSON.stringify(cooldowns))
}

function isCoolingDown(gameId, time) {
  const lastPlay = Math.max(sessionCooldowns[gameId] || 0, Number(readObject(COOLDOWNS_KEY)[gameId] || 0))
  return time - lastPlay < COOLDOWN_MS
}

async function load() {
  if (loaded.value) return
  if (loadingPromise) return loadingPromise
  loadingPromise = (async () => {
    if (isLocalDevelopment()) {
      mergeCounts(readObject(COUNTS_KEY))
      loaded.value = true
      return
    }
    try {
      const response = await fetch(API_PATH, { headers: { accept: 'application/json' } })
      if (!response.ok) throw new Error(`Play count request failed: ${response.status}`)
      const data = await response.json()
      if (!data?.counts || typeof data.counts !== 'object' || Array.isArray(data.counts)) throw new Error('Invalid play counts')
      mergeCounts(data.counts)
      loaded.value = true
    } catch {
      // Counts are optional; a storage outage must never block the gallery or player.
    }
  })().finally(() => { loadingPromise = null })
  return loadingPromise
}

async function record(gameId) {
  const now = Date.now()
  if (pendingGames.has(gameId) || isCoolingDown(gameId, now)) return false
  pendingGames.add(gameId)

  try {
    if (isLocalDevelopment()) {
      const nextCounts = { ...counts.value, [gameId]: Number(counts.value[gameId] || 0) + 1 }
      counts.value = nextCounts
      writeStored(COUNTS_KEY, JSON.stringify(nextCounts))
      saveCooldown(gameId, now)
      loaded.value = true
      return true
    }

    const response = await fetch(API_PATH, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ gameId, eventId: crypto.randomUUID() }),
    })
    if (!response.ok) return false
    const data = await response.json()
    if (!Number.isSafeInteger(data.count) || data.count < 0) return false
    mergeCounts({ [gameId]: data.count })
    saveCooldown(gameId, now)
    return true
  } catch {
    return false
  } finally {
    pendingGames.delete(gameId)
  }
}

export function usePlayCounts() {
  return { counts: readonly(counts), loaded: readonly(loaded), load, record }
}
