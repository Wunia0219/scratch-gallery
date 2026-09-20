const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

function buildEntry({ existing, options, id, creatorId, baseName, standalone, thumbnail, now = new Date().toISOString() }) {
  const entry = {
    ...(standalone ? {} : { description: '尚未提供作品說明。', category: '未分類', age: '全年齡', tags: [] }),
    ...existing,
    id,
    title: options.title ?? existing?.title ?? baseName,
    playUrl: `/games/${id}/index.html`,
    thumbnail: thumbnail ?? existing?.thumbnail ?? '',
  }
  if (!standalone) {
    entry.creatorId = creatorId
    if (!existing) entry.releasePending = true
    for (const key of ['description', 'category', 'age', 'controls', 'objective']) {
      if (options[key] !== undefined) entry[key] = options[key]
    }
    for (const key of ['tags', 'devices']) {
      if (options[key] !== undefined) entry[key] = options[key].split(',').map(value => value.trim()).filter(Boolean)
    }
    if (options.leaderboard) entry.leaderboard = { type: 'word-alchemy-v1' }
  }
  return entry
}

async function preserveImages(existing, id, publicRoot, staging, replaceThumbnail) {
  const { isLocalAsset } = require('../../src/lib/catalog.js')
  const urls = [replaceThumbnail ? null : existing?.thumbnail, ...(existing?.thumbnailLayers || []).map(layer => layer.src)].filter(Boolean)
  for (const url of new Set(urls)) {
    if (!isLocalAsset(url)) throw new Error(`無效的既有封面路徑：${url}`)
    const prefix = `/games/${id}/`
    // Shared or brand images stay in place. Only this game's files are replaced.
    if (!url.startsWith(prefix)) continue
    const relative = url.slice(prefix.length)
    const target = path.resolve(staging, relative)
    if (!target.startsWith(path.resolve(staging) + path.sep)) throw new Error('封面路徑超出暫存目錄')
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.copyFile(path.join(publicRoot, url.slice(1)), target)
  }
}

// Backups live outside public/. A failed copy or manifest replacement restores
// both old files and metadata; failed recovery deliberately retains the backup.
async function commitImport({ gamesRoot, gameDirectory, staging, manifestPath, manifest, backupRoot, io = fs }) {
  gamesRoot = path.resolve(gamesRoot)
  gameDirectory = path.resolve(gameDirectory)
  if (path.dirname(gameDirectory) !== gamesRoot || path.basename(gameDirectory).startsWith('.')) throw new Error('不安全的作品目錄')
  const transaction = await io.mkdtemp(path.join(backupRoot, 'import-backup-'))
  const backup = path.join(transaction, 'game')
  const manifestBackup = path.join(transaction, 'manifest.json')
  const pendingManifest = `${manifestPath}.${randomUUID()}.tmp`
  let oldGame = false
  let touchedGame = false
  let committed = false
  try {
    await io.copyFile(manifestPath, manifestBackup)
    try { await io.access(gameDirectory); oldGame = true } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (oldGame) await io.cp(gameDirectory, backup, { recursive: true, errorOnExist: true, force: false })
    await io.writeFile(pendingManifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    touchedGame = true
    await io.rm(gameDirectory, { recursive: true, force: true })
    await io.cp(staging, gameDirectory, { recursive: true, errorOnExist: true, force: false })
    await io.rename(pendingManifest, manifestPath)
    committed = true
  } catch (error) {
    if (touchedGame) {
      try {
        await io.rm(gameDirectory, { recursive: true, force: true })
        if (oldGame) await io.cp(backup, gameDirectory, { recursive: true, errorOnExist: true, force: false })
      } catch (recoveryError) {
        throw new AggregateError([error, recoveryError], `匯入及回復失敗；請保留並還原 ${transaction}`)
      }
    }
    await io.rm(transaction, { recursive: true, force: true })
    throw error
  } finally {
    await io.rm(pendingManifest, { force: true }).catch(() => {})
  }
  if (committed) await io.rm(transaction, { recursive: true, force: true }).catch(error => console.warn(`匯入成功；備份清理失敗：${transaction} (${error.message})`))
}

module.exports = { buildEntry, preserveImages, commitImport }
