const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function isLocalAsset(value) {
  return typeof value === 'string' && /^\/(?:games|brand)\/[a-zA-Z0-9_./-]+$/.test(value)
    && !value.split('/').some(part => part === '.' || part === '..')
}
export function validateCatalog(games, creators) {
  if (!Array.isArray(games) || !Array.isArray(creators)) throw new Error('目錄必須是陣列')
  const authors = new Map(creators.map(c => [c.id, c]))
  const ids = new Set()
  return games.map(game => {
    const creator = authors.get(game.creatorId)
    if (!uuid.test(game.id) || ids.has(game.id) || !creator) throw new Error('作品 UUID 或作者關聯無效')
    ids.add(game.id)
    if (game.playUrl !== `/games/${game.id}/index.html`) throw new Error('禁止外部或非預期遊戲網址')
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
