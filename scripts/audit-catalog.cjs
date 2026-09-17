const fs = require('node:fs/promises')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const publicRoot = path.join(projectRoot, 'public')
const gamesRoot = path.join(publicRoot, 'games')
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function uniqueIds(items, label, errors) {
  const seen = new Set()
  for (const item of items) {
    if (!uuidPattern.test(item.id || '')) errors.push(`${label} UUID 無效：${item.id || '(空白)'}`)
    if (seen.has(item.id)) errors.push(`${label} UUID 重複：${item.id}`)
    seen.add(item.id)
  }
  return seen
}

async function main() {
  const [games, creators] = await Promise.all([
    fs.readFile(path.join(publicRoot, 'games.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(publicRoot, 'creators.json'), 'utf8').then(JSON.parse),
  ])
  if (!Array.isArray(games) || !Array.isArray(creators)) throw new Error('games.json 與 creators.json 必須是陣列')

  const errors = []
  const gameIds = uniqueIds(games, '作品', errors)
  const creatorIds = uniqueIds(creators, '作者', errors)
  for (const creator of creators) {
    if (!creator.name?.trim()) errors.push(`作者 ${creator.id} 缺少姓名`)
    if (!['student', 'teacher'].includes(creator.role)) errors.push(`作者 ${creator.id} role 無效`)
    if (!creator.className?.trim()) errors.push(`作者 ${creator.id} 缺少班級`)
  }
  for (const game of games) {
    if (!creatorIds.has(game.creatorId)) errors.push(`作品 ${game.id} 找不到作者 ${game.creatorId}`)
    const expectedUrl = `/games/${game.id}/index.html`
    if (game.playUrl !== expectedUrl) errors.push(`作品 ${game.id} playUrl 應為 ${expectedUrl}`)
    try {
      await fs.access(path.join(gamesRoot, game.id, 'index.html'))
    } catch {
      errors.push(`作品 ${game.id} 缺少 index.html`)
    }
  }

  for (const entry of await fs.readdir(gamesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '_shared' || entry.name.startsWith('.')) continue
    if (!gameIds.has(entry.name)) errors.push(`未登錄的遊戲資料夾：${entry.name}`)
  }

  if (errors.length) {
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }
  console.log(`目錄關聯正確：${creators.length} 位作者、${games.length} 個作品。`)
}

main().catch((error) => {
  console.error(`目錄稽核失敗：${error.message}`)
  process.exitCode = 1
})
