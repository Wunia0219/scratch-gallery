import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { envValue, getFirebaseServices } from './firebase-runtime.mjs'
import { ActivityError } from '../../src/lib/activitySchema.js'
import { validateCatalog } from '../../src/lib/catalog.js'
import games from '../../public/games.json' with { type: 'json' }
import creators from '../../public/creators.json' with { type: 'json' }
export function catalogMode() {
  const mode = envValue('CATALOG_DATA_MODE') || 'legacy'
  if (!['firebase', 'legacy'].includes(mode)) throw new ActivityError('作品資料模式設定不正確', 503)
  return mode
}
export const legacyCatalog = () => validateCatalog(games, creators).filter(game => !game.releasePending).map((game, index) => ({ ...game, sortOrder: 0, sortKey: `legacy:${String(9999999999999 - (Date.parse(game.publishedAt) || 0)).padStart(13, '0')}:${String(index).padStart(6, '0')}` })).sort((a, b) => a.sortKey.localeCompare(b.sortKey))
let manifest
export async function assetManifest() {
  if (!envValue('CONTEXT') && envValue('CATALOG_LOCAL_ASSETS') === 'true') {
    const { buildAssetManifest } = await import('../../scripts/lib/game-assets.mjs')
    return buildAssetManifest()
  }
  manifest ??= readFile(resolve('.netlify/catalog/assets.json'), 'utf8').then(JSON.parse)
  return manifest
}
export async function catalogServices() {
  if (catalogMode() !== 'firebase') throw new ActivityError('作品資料庫尚未切換', 503)
  const services = await getFirebaseServices(), context = envValue('CONTEXT')
  const test = envValue('FIREBASE_ENVIRONMENT') === 'test' && services.projectId !== 'scratch-gallery-c0e33'
  return { ...services, manifest: await assetManifest(), environment: context ? context === 'production' ? 'production' : 'test' : test ? 'test' : envValue('CATALOG_LOCAL_ASSETS') === 'true' ? 'local' : 'production' }
}
