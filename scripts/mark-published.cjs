const fs = require('node:fs/promises')
const path = require('node:path')
const { UUID_PATTERN } = require('../src/lib/identifiers.js')
const { markGamePublished } = require('./lib/release-publication.cjs')

const manifestPath = path.resolve(__dirname, '..', 'public', 'games.json')

async function main() {
  const [id, ...extra] = process.argv.slice(2)
  if (!id || extra.length || !UUID_PATTERN.test(id)) {
    throw new Error('用法：npm run release:mark -- <待發布作品 UUID>')
  }
  const games = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const game = markGamePublished(games, id)
  await fs.writeFile(manifestPath, `${JSON.stringify(games, null, 2)}\n`, 'utf8')
  console.log(`已標記正式發布：${game.title}`)
  console.log(`正式發布時間：${game.publishedAt}`)
}

main().catch(error => {
  console.error(`標記正式發布失敗：${error.message}`)
  process.exitCode = 1
})
