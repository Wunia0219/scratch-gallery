import { cp, readFile, writeFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { validateCatalog } from '../../src/lib/catalog.js'
import { sharedResourcePaths } from './game-assets.mjs'

export function releasedFilesOnly() {
  return process.env.PUBLISH_RELEASED_ONLY === 'true' && process.env.CATALOG_DATA_MODE !== 'firebase'
}

export async function copyReleasedFiles() {
  const root = resolve('public')
  const read = async name => JSON.parse(await readFile(resolve(root, name), 'utf8'))
  const games = (await read('games.json')).filter(game => !game.releasePending)
  const creatorIds = new Set(games.map(game => game.creatorId))
  const creators = (await read('creators.json')).filter(creator => creatorIds.has(creator.id))
  validateCatalog(games, creators)
  const standalone = await read('standalone-games.json')
  for (const game of standalone) {
    if (!/^[a-z0-9-]+$/.test(game.id) || game.playUrl !== `/games/${game.id}/index.html`) throw new Error('獨立示範路徑無效')
  }
  const published = [...games, ...standalone]
  const ids = new Set(published.map(game => game.id))
  const shared = new Set(['/games/_shared', '/games/_shared/assets'])
  for (const game of published) {
    for (const file of await sharedResourcePaths(root, game)) shared.add(file)
  }
  await cp(root, 'dist', { recursive: true, filter(source) {
    const path = relative(root, source).split(sep).join('/')
    if (path === 'games.json' || path === 'creators.json') return false
    const [folder, id] = path.split('/')
    if (folder !== 'games' || !id) return true
    return id === '_shared' ? shared.has('/' + path) : ids.has(id)
  } })
  await writeFile('dist/games.json', JSON.stringify(games))
  await writeFile('dist/creators.json', JSON.stringify(creators))
}
