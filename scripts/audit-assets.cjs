const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')

const projectRoot = path.resolve(__dirname, '..')
const roots = [path.join(projectRoot, 'public'), path.join(projectRoot, 'src', 'assets')]
const sharedGameAssetsRoot = path.join(projectRoot, 'public', 'games', '_shared', 'assets')
const duplicateBudget = 256 * 1024
const limits = {
  video: 12 * 1024 * 1024,
  image: 1.5 * 1024 * 1024,
  audio: 2 * 1024 * 1024,
  other: 15 * 1024 * 1024,
  gameAsset: 2.5 * 1024 * 1024,
}
const extensions = {
  video: new Set(['.mp4', '.webm', '.mov']),
  image: new Set(['.avif', '.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg']),
  audio: new Set(['.mp3', '.m4a', '.ogg', '.wav']),
}

function category(file) {
  if (file.startsWith(`${sharedGameAssetsRoot}${path.sep}`)) return 'gameAsset'
  const extension = path.extname(file).toLowerCase()
  return Object.entries(extensions).find(([, values]) => values.has(extension))?.[0] || 'other'
}

function megabytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

async function collect(directory) {
  const files = []
  try {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) files.push(...await collect(target))
      else if (entry.isFile()) files.push({ path: target, size: (await fs.stat(target)).size })
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  return files
}

async function main() {
  const files = (await Promise.all(roots.map(collect))).flat().sort((a, b) => b.size - a.size)
  const total = files.reduce((sum, file) => sum + file.size, 0)
  const oversized = files.filter((file) => file.size > limits[category(file.path)])
  const hashed = new Map()
  for (const file of files.filter((item) => item.size >= 4096)) {
    const hash = crypto.createHash('sha256').update(await fs.readFile(file.path)).digest('hex')
    const matches = hashed.get(hash) || []
    matches.push(file)
    hashed.set(hash, matches)
  }
  const duplicateGroups = [...hashed.values()].filter((group) => group.length > 1)
  const duplicateBytes = duplicateGroups.reduce((sum, group) => sum + group[0].size * (group.length - 1), 0)

  console.log(`資源總量：${megabytes(total)}（${files.length} 個檔案）`)
  console.log('最大資源：')
  for (const file of files.slice(0, 10)) {
    console.log(`- ${megabytes(file.size).padStart(9)}  ${path.relative(projectRoot, file.path)}`)
  }
  console.log(`\n重複內容：${megabytes(duplicateBytes)}（預算 ${megabytes(duplicateBudget)}）`)
  for (const group of duplicateGroups.slice(0, 5)) {
    console.log(`- ${group.length} 份 × ${megabytes(group[0].size)}：${path.relative(projectRoot, group[0].path)}`)
  }

  if (oversized.length || duplicateBytes > duplicateBudget) {
    console.error('\n超出建議上限：')
    for (const file of oversized) {
      const type = category(file.path)
      console.error(`- ${path.relative(projectRoot, file.path)}：${megabytes(file.size)}，上限 ${megabytes(limits[type])}`)
    }
    if (duplicateBytes > duplicateBudget) {
      console.error(`- 重複內容 ${megabytes(duplicateBytes)} 超過預算 ${megabytes(duplicateBudget)}；請執行 npm run optimize:games`)
    }
    process.exitCode = 1
  } else {
    console.log('\n所有資源均在建議大小範圍內。')
  }
}

main().catch((error) => {
  console.error(`資源稽核失敗：${error.message}`)
  process.exitCode = 1
})
