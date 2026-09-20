const fs = require('node:fs/promises')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const publicRoot = path.join(projectRoot, 'public')
const gamesRoot = path.join(publicRoot, 'games')
const { validateCatalog } = require('../src/lib/catalog.js')
const { SLUG_PATTERN: slugPattern } = require('../src/lib/identifiers.js')

async function main() {
  const [games, standaloneGames, creators] = await Promise.all([
    fs.readFile(path.join(publicRoot, 'games.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(publicRoot, 'standalone-games.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(publicRoot, 'creators.json'), 'utf8').then(JSON.parse),
  ])
  if (!Array.isArray(games) || !Array.isArray(standaloneGames) || !Array.isArray(creators)) throw new Error('作品、獨立預覽與作者目錄必須是陣列')

  const errors = []
  validateCatalog(games, creators)
  const gameIds = new Set(games.map(game => game.id))
  const standaloneIds = new Set()
  for (const game of standaloneGames) {
    if (!slugPattern.test(game.id || '')) errors.push(`獨立預覽代號無效：${game.id || '(空白)'}`)
    if (standaloneIds.has(game.id) || gameIds.has(game.id)) errors.push(`獨立預覽代號重複：${game.id}`)
    standaloneIds.add(game.id)
  }
  for (const game of games) {
    try {
      await fs.access(path.join(gamesRoot, game.id, 'index.html'))
    } catch {
      errors.push(`作品 ${game.id} 缺少 index.html`)
    }
  }
  for (const game of standaloneGames) {
    const expectedUrl = `/games/${game.id}/index.html`
    if (game.playUrl !== expectedUrl) errors.push(`獨立預覽 ${game.id} playUrl 應為 ${expectedUrl}`)
    if (game.thumbnail && !game.thumbnail.startsWith(`/games/${game.id}/`)) errors.push(`獨立預覽 ${game.id} thumbnail 路徑無效`)
    try {
      await fs.access(path.join(gamesRoot, game.id, 'index.html'))
    } catch {
      errors.push(`獨立預覽 ${game.id} 缺少 index.html`)
    }
  }

  for (const entry of await fs.readdir(gamesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '_shared' || entry.name.startsWith('.')) continue
    if (!gameIds.has(entry.name) && !standaloneIds.has(entry.name)) errors.push(`未登錄的遊戲資料夾：${entry.name}`)
  }

  if (errors.length) {
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }
  console.log(`目錄關聯正確：${creators.length} 位作者、${games.length} 個作品、${standaloneGames.length} 個獨立預覽。`)
}

main().catch((error) => {
  console.error(`目錄稽核失敗：${error.message}`)
  process.exitCode = 1
})
