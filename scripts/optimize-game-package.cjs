const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const gamesRoot = path.join(projectRoot, 'public', 'games')
const sharedRoot = path.join(gamesRoot, '_shared')
const sharedAssetsRoot = path.join(sharedRoot, 'assets')

async function exists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

function digest(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

async function moveIntoShared(source, destination) {
  const sourceData = await fs.readFile(source)
  if (await exists(destination)) {
    const existingData = await fs.readFile(destination)
    if (digest(existingData) !== digest(sourceData)) {
      throw new Error(`共用資源檔名衝突：${path.basename(destination)}`)
    }
  } else {
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.writeFile(destination, sourceData)
  }
  await fs.rm(source)
  return sourceData.length
}

async function optimizeGamePackage(gameDirectory) {
  const indexPath = path.join(gameDirectory, 'index.html')
  let html = await fs.readFile(indexPath, 'utf8')
  let pooledBytes = 0
  let pooledFiles = 0

  const runtimePath = path.join(gameDirectory, 'script.js')
  if (await exists(runtimePath)) {
    const runtimeData = await fs.readFile(runtimePath)
    const runtimeName = `runtime-${digest(runtimeData).slice(0, 16)}.js`
    pooledBytes += await moveIntoShared(runtimePath, path.join(sharedRoot, runtimeName))
    pooledFiles += 1
    html = html.replace(/<script src=["']script\.js["']><\/script>/, `<script src="../_shared/${runtimeName}"></script>`)
  }

  const assetsDirectory = path.join(gameDirectory, 'assets')
  if (await exists(assetsDirectory)) {
    for (const entry of await fs.readdir(assetsDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name === 'project.json') continue
      pooledBytes += await moveIntoShared(
        path.join(assetsDirectory, entry.name),
        path.join(sharedAssetsRoot, entry.name),
      )
      pooledFiles += 1
    }
  }

  html = html.replace(
    /new URL\(['"]\.\/assets\/['"] \+ asset\.assetId \+ ['"]\.['"] \+ asset\.dataFormat, location\)\.href/g,
    "new URL('../_shared/assets/' + asset.assetId + '.' + asset.dataFormat, location).href",
  )
  await fs.writeFile(indexPath, html, 'utf8')
  return { pooledBytes, pooledFiles }
}

async function referencedSharedFiles() {
  const assets = new Set()
  const runtimes = new Set()
  if (!(await exists(gamesRoot))) return { assets, runtimes }

  for (const entry of await fs.readdir(gamesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === '_shared') continue
    const gameDirectory = path.join(gamesRoot, entry.name)
    const projectPath = path.join(gameDirectory, 'assets', 'project.json')
    if (await exists(projectPath)) {
      const project = JSON.parse(await fs.readFile(projectPath, 'utf8'))
      for (const target of project.targets || []) {
        for (const costume of target.costumes || []) if (costume.md5ext) assets.add(costume.md5ext)
        for (const sound of target.sounds || []) if (sound.md5ext) assets.add(sound.md5ext)
      }
    }
    const indexPath = path.join(gameDirectory, 'index.html')
    if (await exists(indexPath)) {
      const html = await fs.readFile(indexPath, 'utf8')
      for (const match of html.matchAll(/\.\.\/_shared\/(runtime-[a-f0-9]+\.js)/g)) runtimes.add(match[1])
    }
  }
  return { assets, runtimes }
}

async function pruneSharedResources() {
  const referenced = await referencedSharedFiles()
  let removedFiles = 0
  let removedBytes = 0
  if (!(await exists(sharedRoot))) return { removedFiles, removedBytes }

  for (const entry of await fs.readdir(sharedRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.startsWith('runtime-') || referenced.runtimes.has(entry.name)) continue
    const target = path.join(sharedRoot, entry.name)
    removedBytes += (await fs.stat(target)).size
    await fs.rm(target)
    removedFiles += 1
  }
  if (await exists(sharedAssetsRoot)) {
    for (const entry of await fs.readdir(sharedAssetsRoot, { withFileTypes: true })) {
      if (!entry.isFile() || referenced.assets.has(entry.name)) continue
      const target = path.join(sharedAssetsRoot, entry.name)
      removedBytes += (await fs.stat(target)).size
      await fs.rm(target)
      removedFiles += 1
    }
  }
  return { removedFiles, removedBytes }
}

async function optimizeAllGames() {
  let pooledBytes = 0
  let pooledFiles = 0
  for (const entry of await fs.readdir(gamesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === '_shared') continue
    const result = await optimizeGamePackage(path.join(gamesRoot, entry.name))
    pooledBytes += result.pooledBytes
    pooledFiles += result.pooledFiles
  }
  const pruned = await pruneSharedResources()
  return { pooledBytes, pooledFiles, ...pruned }
}

module.exports = { optimizeGamePackage, optimizeAllGames, pruneSharedResources }

if (require.main === module) {
  optimizeAllGames().then((result) => {
    console.log(`已池化 ${result.pooledFiles} 個遊戲資源（掃描 ${(result.pooledBytes / 1024 / 1024).toFixed(2)} MB）`)
    console.log(`已清除 ${result.removedFiles} 個未引用共用資源（${(result.removedBytes / 1024 / 1024).toFixed(2)} MB）`)
  }).catch((error) => {
    console.error(`遊戲資源優化失敗：${error.message}`)
    process.exitCode = 1
  })
}
