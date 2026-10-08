import { readFile, readdir, lstat } from 'node:fs/promises'
import { resolve, relative, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { validateCatalog } from '../../src/lib/catalog.js'
const hash = data => createHash('sha256').update(data).digest('hex')
export async function buildAssetManifest(root = resolve('public')) {
  const games = validateCatalog(JSON.parse(await readFile(resolve(root, 'games.json'), 'utf8')), JSON.parse(await readFile(resolve(root, 'creators.json'), 'utf8')))
  const files = new Map()
  async function add(path) {
    const absolute = resolve(root, path.replace(/^\//, ''))
    const inside = relative(root, absolute)
    if (inside.startsWith('..') || inside.includes(`..${sep}`)) throw new Error('資源路徑超出 public')
    // The import pipeline creates regular files; symlinked assets are not accepted.
    const info = await lstat(absolute)
    if (!info.isFile()) throw new Error(`找不到資源：${path}`)
    if (!files.has(path)) files.set(path, hash(await readFile(absolute)))
  }
  const works = []
  async function walk(folder, paths) {
    for (const entry of await readdir(resolve(root, folder.slice(1)), { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('資源不可使用符號連結')
      if (entry.isDirectory()) await walk(`${folder}/${entry.name}`, paths)
      else paths.add(`${folder}/${entry.name}`)
    }
  }
  for (const [sourceOrder, game] of games.entries()) {
    const paths = new Set()
    const folder = `/games/${game.id}`
    await walk(folder, paths)
    const html = await readFile(resolve(root, game.playUrl.slice(1)), 'utf8')
    for (const match of html.matchAll(/\.\.\/_shared\/(runtime-[a-f0-9]+\.js)/g)) paths.add(`/games/_shared/${match[1]}`)
    const project = JSON.parse(await readFile(resolve(root, folder.slice(1), 'assets/project.json'), 'utf8'))
    for (const target of project.targets) for (const item of [...(target.costumes || []), ...(target.sounds || [])]) {
      if (!/^[a-f0-9]+\.[a-z0-9]+$/i.test(item.md5ext)) throw new Error('Scratch 資源名稱不正確')
      paths.add(`/games/_shared/assets/${item.md5ext}`)
    }
    const thumbnails = [...new Set([game.thumbnail, ...(game.thumbnailLayers || []).map(layer => layer.src)])]
    for (const path of thumbnails) paths.add(path)
    for (const path of paths) await add(path)
    const resources = [...paths].sort().map(path => ({ path, sha256: files.get(path) }))
    works.push({ id: game.id, assetVersion: hash(JSON.stringify(resources)), playUrl: game.playUrl, thumbnail: game.thumbnail, thumbnails, ...(game.thumbnailLayers ? { thumbnailLayers: game.thumbnailLayers } : {}), ...(game.leaderboard ? { leaderboard: game.leaderboard } : {}), sourceOrder, resources })
  }
  const manifest = { schemaVersion: 1, works }
  return { ...manifest, manifestVersion: hash(JSON.stringify(manifest)) }
}
