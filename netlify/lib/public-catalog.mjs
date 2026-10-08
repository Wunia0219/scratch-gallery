import { catalogMode, legacyCatalog, catalogServices } from './catalog-runtime.mjs'
import { listPublishedWorks, readPublishedWork } from './work-service.mjs'
import { ActivityError } from '../../src/lib/activitySchema.js'
export async function publicList(filters = {}) {
  if (catalogMode() === 'firebase') {
    const { store, manifest, environment } = await catalogServices()
    return listPublishedWorks(store, manifest, environment, filters)
  }
  const { role = 'student', q = '', className = '', device = 'all', cursor = '' } = filters
  if (!['student', 'teacher'].includes(role) || q.length > 120 || className.length > 100 || !['all', 'desktop', 'mobile'].includes(device) || (cursor && !/^\d{1,6}$/.test(cursor))) throw new ActivityError('搜尋條件不正確')
  const catalog = legacyCatalog(), needle = q.trim().toLocaleLowerCase('zh-Hant')
  const matches = catalog.filter(work => work.creatorType === role && (!className || work.className === className) && (device === 'all' || work.devices.includes(device)) && (!needle || [work.title, work.description, work.category, work.student, work.className, ...work.tags].join(' ').toLocaleLowerCase('zh-Hant').includes(needle)))
  const offset = Number(cursor || 0)
  return { items: matches.slice(offset, offset + 9), cursor: offset + 9 < matches.length ? String(offset + 9) : null, total: matches.length, classes: ['全部', ...new Set(catalog.filter(game => game.creatorType === 'student').map(game => game.className))], revision: 1, mode: 'legacy' }
}
export async function publicDetail(id) {
  let game
  if (catalogMode() === 'firebase') {
    const { store, manifest, environment } = await catalogServices()
    game = await readPublishedWork(store, manifest, environment, id)
  } else game = legacyCatalog().find(work => work.id === id)
  if (!game) throw new ActivityError('作品不存在或已下架', 404)
  const list = await publicList({ role: game.creatorType, q: game.category })
  return { game, related: list.items.filter(work => work.id !== id && work.category === game.category).slice(0, 3), revision: list.revision }
}
export async function publishedIds(leaderboard = false) {
  if (catalogMode() === 'legacy') return legacyCatalog().filter(game => !leaderboard || game.leaderboard?.type === 'word-alchemy-v1').map(game => game.id)
  const { store, manifest, environment } = await catalogServices()
  const ids = []
  for (const role of ['student', 'teacher']) {
    let cursor = ''
    do { const page = await listPublishedWorks(store, manifest, environment, { role, cursor }); ids.push(...page.items.filter(game => !leaderboard || game.leaderboard?.type === 'word-alchemy-v1').map(game => game.id)); cursor = page.cursor || '' } while (cursor)
  }
  return ids
}
export async function eligibleWork(id, leaderboard = false) {
  try {
    let game
    if (catalogMode() === 'legacy') game = legacyCatalog().find(work => work.id === id)
    else { const { store, manifest, environment } = await catalogServices(); game = await readPublishedWork(store, manifest, environment, id) }
    return Boolean(game && (!leaderboard || game.leaderboard?.type === 'word-alchemy-v1'))
  } catch (error) { if (error.status === 404) return false; throw error }
}
