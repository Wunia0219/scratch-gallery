const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const gamesRoot = path.resolve(projectRoot, 'public', 'games')
const packagesRoot = path.resolve(projectRoot, '.packages')
const manifestPath = path.join(projectRoot, 'public', 'games.json')
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function exists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

function directChild(root, name) {
  const target = path.resolve(root, name)
  if (path.dirname(target) !== root) throw new Error(`不安全的作品路徑：${name}`)
  return target
}

async function moveDirectory(source, destination) {
  try {
    await fs.rename(source, destination)
  } catch (error) {
    if (error.code !== 'EPERM') throw error
    await fs.cp(source, destination, { recursive: true, errorOnExist: true })
    await fs.rm(source, { recursive: true, force: true })
  }
}

async function main() {
  const original = await fs.readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(original)
  const mappings = manifest
    .filter((game) => !uuidPattern.test(game.id))
    .map((game) => ({ game, oldId: game.id, newId: crypto.randomUUID() }))

  if (!mappings.length) {
    console.log('所有作品都已使用 UUID，無需遷移。')
    return
  }

  for (const mapping of mappings) {
    mapping.sourceDirectory = directChild(gamesRoot, mapping.oldId)
    mapping.targetDirectory = directChild(gamesRoot, mapping.newId)
    mapping.sourcePackage = directChild(packagesRoot, `${mapping.oldId}.zip`)
    mapping.targetPackage = directChild(packagesRoot, `${mapping.newId}.zip`)
    if (!(await exists(mapping.sourceDirectory))) throw new Error(`找不到作品資料夾：${mapping.oldId}`)
    if (await exists(mapping.targetDirectory)) throw new Error(`UUID 資料夾已存在：${mapping.newId}`)
    if (await exists(mapping.targetPackage)) throw new Error(`UUID 套件已存在：${mapping.newId}.zip`)
  }

  const completed = []
  try {
    for (const mapping of mappings) {
      await moveDirectory(mapping.sourceDirectory, mapping.targetDirectory)
      mapping.packageMoved = false
      if (await exists(mapping.sourcePackage)) {
        await fs.rename(mapping.sourcePackage, mapping.targetPackage)
        mapping.packageMoved = true
      }
      mapping.game.id = mapping.newId
      mapping.game.playUrl = mapping.game.playUrl?.replace(`/games/${mapping.oldId}/`, `/games/${mapping.newId}/`)
      mapping.game.thumbnail = mapping.game.thumbnail?.replace(`/games/${mapping.oldId}/`, `/games/${mapping.newId}/`)
      if (Array.isArray(mapping.game.thumbnailLayers)) {
        for (const layer of mapping.game.thumbnailLayers) {
          layer.src = layer.src?.replace(`/games/${mapping.oldId}/`, `/games/${mapping.newId}/`)
        }
      }
      completed.push(mapping)
    }
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  } catch (error) {
    for (const mapping of completed.reverse()) {
      if (mapping.packageMoved && await exists(mapping.targetPackage)) await fs.rename(mapping.targetPackage, mapping.sourcePackage)
      if (await exists(mapping.targetDirectory)) await moveDirectory(mapping.targetDirectory, mapping.sourceDirectory)
    }
    await fs.writeFile(manifestPath, original, 'utf8')
    throw error
  }

  for (const mapping of mappings) console.log(`${mapping.oldId} -> ${mapping.newId}`)
}

main().catch((error) => {
  console.error(`UUID 遷移失敗：${error.message}`)
  process.exitCode = 1
})
