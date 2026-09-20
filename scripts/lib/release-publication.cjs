function markGamePublished(games, id, now = new Date().toISOString()) {
  if (!Array.isArray(games)) throw new Error('作品目錄必須是陣列')
  const game = games.find(item => item.id === id)
  if (!game) throw new Error(`找不到作品 UUID：${id}`)
  if (!game.releasePending) throw new Error(`作品不是待發布狀態：${id}`)
  if (!Number.isFinite(Date.parse(now))) throw new Error('正式發布時間無效')
  delete game.releasePending
  game.publishedAt = now
  return game
}

module.exports = { markGamePublished }
