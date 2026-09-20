import { UUID_PATTERN as uuid } from './identifiers.js'

export function validateCreators(creators) {
  if (!Array.isArray(creators)) throw new Error('作者目錄必須是陣列')
  const ids = new Set()
  for (const creator of creators) {
    if (!creator || !uuid.test(creator.id) || ids.has(creator.id)) throw new Error('作者 UUID 無效或重複')
    ids.add(creator.id)
    if (typeof creator.name !== 'string' || !creator.name.trim() || typeof creator.className !== 'string' || !creator.className.trim()) throw new Error('作者缺少姓名或班級')
    if (!['student', 'teacher'].includes(creator.role)) throw new Error('作者身分無效')
  }
  return creators
}

export function studentClasses(creators) {
  return ['全部', ...new Set(creators.filter(creator => creator.role === 'student').map(creator => creator.className))]
}
export function isLocalAsset(value) {
  return typeof value === 'string' && /^\/(?:games|brand)\/[a-zA-Z0-9_./-]+$/.test(value)
    && !value.split('/').some(part => part === '.' || part === '..')
}
export function validateCatalog(games, creators) {
  if (!Array.isArray(games) || !Array.isArray(creators)) throw new Error('目錄必須是陣列')
  validateCreators(creators)
  const authors = new Map(creators.map(c => [c.id, c]))
  const ids = new Set()
  return games.map(game => {
    if (!game || typeof game !== 'object') throw new Error('作品資料無效')
    const creator = authors.get(game.creatorId)
    if (!uuid.test(game.id) || ids.has(game.id) || !creator) throw new Error('作品 UUID 或作者關聯無效')
    ids.add(game.id)
    if (game.playUrl !== `/games/${game.id}/index.html`) throw new Error('禁止外部或非預期遊戲網址')
    if (game.thumbnailLayers !== undefined && (!Array.isArray(game.thumbnailLayers) || game.thumbnailLayers.some(layer => !layer || !isLocalAsset(layer.src)))) throw new Error('封面圖層無效')
    if (game.tags !== undefined && (!Array.isArray(game.tags) || game.tags.some(tag => typeof tag !== 'string'))) throw new Error('作品標籤無效')
    if (game.devices !== undefined && (!Array.isArray(game.devices) || game.devices.some(device => !['desktop', 'mobile'].includes(device)))) throw new Error('作品裝置無效')
    for (const key of ['controls', 'objective']) if (game[key] !== undefined && typeof game[key] !== 'string') throw new Error('操作或目標說明無效')
    for (const asset of [game.thumbnail, ...(game.thumbnailLayers || []).map(layer => layer.src)].filter(Boolean)) {
      if (!isLocalAsset(asset)) throw new Error('禁止外部或非預期素材網址')
    }
    if (game.publishedAt !== undefined && (typeof game.publishedAt !== 'string' || !Number.isFinite(Date.parse(game.publishedAt)))) {
      throw new Error('作品上架時間格式無效')
    }
    if (typeof game.title !== 'string' || !game.title.trim() || typeof game.description !== 'string') throw new Error('作品缺少標題或說明')
    return { ...game, student: creator.name, creatorType: creator.role, className: creator.className, detailUrl: `/works/${game.id}/` }
  })
}
