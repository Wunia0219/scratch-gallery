const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const Packager = require('@turbowarp/packager')
const JSZip = require('@turbowarp/jszip')
const { optimizeGamePackage, pruneSharedResources } = require('./optimize-game-package.cjs')

const projectRoot = path.resolve(__dirname, '..')
const publicRoot = path.join(projectRoot, 'public')
const gamesRoot = path.join(publicRoot, 'games')
const manifestPath = path.join(publicRoot, 'games.json')
const creatorsPath = path.join(publicRoot, 'creators.json')
const packagesRoot = path.join(projectRoot, '.packages')

function usage() {
  console.log(`
用法：npm run import-game -- <game.sb3> [選項]

  --title <名稱>          顯示名稱；預設使用檔名
  --id <作品 UUID>       更新既有作品時指定；新作品會自動產生
  --creator-id <作者 UUID> 新作品必填；更新作品時預設沿用原作者
  --description <簡介>   作品簡介
  --category <分類>      預設「未分類」
  --age <年齡>           預設「全年齡」
  --tags <標籤>          逗號分隔，例如「數學,闖關」
  --thumbnail <路徑>     選用封面；會複製進作品資料夾
  --replace              覆蓋 --id 指定的既有作品
  --dry-run              只驗證與打包，不寫入網站
  --help                 顯示說明
`)
}

function parseArguments(argv) {
  const options = { replace: false }
  const positional = []
  const valueOptions = new Set(['title', 'id', 'creator-id', 'description', 'category', 'age', 'tags', 'thumbnail'])
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) {
      positional.push(argument)
      continue
    }
    const name = argument.slice(2)
    if (name === 'replace' || name === 'dry-run' || name === 'help') {
      options[name] = true
      continue
    }
    if (!valueOptions.has(name)) throw new Error(`未知選項：--${name}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`--${name} 需要一個值`)
    options[name] = value
    index += 1
  }
  if (positional.length > 1) throw new Error('一次只能匯入一個 SB3 檔案')
  options.input = positional[0]
  return options
}

function validateId(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('--id 必須是有效的 UUID v4')
  }
}

function resolveInside(root, relativePath) {
  const normalized = relativePath.replace(/\\/g, '/')
  const segments = normalized.split('/')
  if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized) || segments.includes('..')) {
    throw new Error(`ZIP 包含不安全路徑：${relativePath}`)
  }
  const resolved = path.resolve(root, ...segments)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`ZIP 路徑超出作品資料夾：${relativePath}`)
  }
  return resolved
}

async function exists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function extractZip(buffer, destination) {
  const archive = await JSZip.loadAsync(buffer)
  const entries = Object.values(archive.files)
  if (!entries.some((entry) => entry.name === 'index.html')) {
    throw new Error('TurboWarp 輸出的 ZIP 中找不到根目錄 index.html')
  }
  for (const entry of entries) {
    const target = resolveInside(destination, entry.name)
    if (entry.dir) {
      await fs.mkdir(target, { recursive: true })
    } else {
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, await entry.async('nodebuffer'))
    }
  }
}

async function readManifest() {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  if (!Array.isArray(manifest)) throw new Error('public/games.json 必須是 JSON 陣列')
  return manifest
}

async function readCreators() {
  const creators = JSON.parse(await fs.readFile(creatorsPath, 'utf8'))
  if (!Array.isArray(creators)) throw new Error('public/creators.json 必須是 JSON 陣列')
  return creators
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) return usage()
  if (!options.input) {
    usage()
    throw new Error('請提供 .sb3 檔案路徑')
  }

  const inputPath = path.resolve(options.input)
  if (path.extname(inputPath).toLowerCase() !== '.sb3') throw new Error('輸入檔案必須使用 .sb3 副檔名')
  if (!(await fs.stat(inputPath)).isFile()) throw new Error('輸入路徑不是檔案')

  const baseName = path.basename(inputPath, path.extname(inputPath))
  const title = options.title || baseName
  if (options.replace && !options.id) throw new Error('--replace 必須搭配既有作品的 --id，避免誤覆蓋其他作品')
  const id = options.id || crypto.randomUUID()
  validateId(id)

  const gameDirectory = path.join(gamesRoot, id)
  const packagePath = path.join(packagesRoot, `${id}.zip`)
  let previewCandidatesDirectory = ''
  const manifest = await readManifest()
  const existingIndex = manifest.findIndex((game) => game.id === id)
  const existingEntry = existingIndex === -1 ? null : manifest[existingIndex]
  const creatorId = options['creator-id'] || existingEntry?.creatorId
  if (!creatorId) throw new Error('新作品必須使用 --creator-id 指定已註冊作者的 UUID')
  validateId(creatorId)
  const creators = await readCreators()
  const creator = creators.find((item) => item.id === creatorId)
  if (!creator) throw new Error(`找不到作者 UUID：${creatorId}；請先執行 npm run register:creator`)
  const hasDirectory = await exists(gameDirectory)
  if ((existingIndex !== -1 || hasDirectory) && !options.replace) {
    throw new Error(`作品「${id}」已存在；若確定要覆蓋，請加上 --id ${id} --replace`)
  }

  console.log(`[1/5] 讀取 ${inputPath}`)
  const loadedProject = await Packager.loadProject(await fs.readFile(inputPath))
  console.log('[2/5] TurboWarp 已完成 SB3 分析')

  const packager = new Packager.Packager()
  packager.project = loadedProject
  packager.options.target = 'zip'
  // 保留 Scratch 的逐幀迴圈速度；Turbo 模式會讓沒有等待積木的移動迴圈瞬間跑完。
  packager.options.turbo = false
  // 讓展示網站保留 Scratch 式的遊戲控制列，避免載入後直接開始。
  packager.options.autoplay = false
  packager.options.controls.greenFlag.enabled = true
  packager.options.controls.stopAll.enabled = true
  packager.options.controls.pause.enabled = true
  packager.options.controls.fullscreen.enabled = true
  packager.options.app.windowTitle = title
  packager.options.app.packageName = `game-${id}`
  console.log('[3/5] 正在打包網站 ZIP')
  const result = await packager.package()
  if (result.type !== 'application/zip') throw new Error(`預期 ZIP，實際得到 ${result.type}`)

  if (options['dry-run']) {
    const archive = await JSZip.loadAsync(result.data)
    if (!archive.file('index.html')) throw new Error('測試 ZIP 缺少 index.html')
    console.log(`\n驗證成功：已產生 ${(result.data.byteLength / 1024 / 1024).toFixed(2)} MB ZIP，未寫入網站。`)
    return
  }

  await fs.mkdir(packagesRoot, { recursive: true })
  await fs.writeFile(packagePath, result.data)

  console.log('[4/5] 正在安全解壓到 public/games')
  const stagingDirectory = path.join(gamesRoot, `.${id}-${Date.now()}.tmp`)
  await fs.mkdir(stagingDirectory, { recursive: false })
  let thumbnailExtension = ''
  try {
    await extractZip(result.data, stagingDirectory)
    if (options.thumbnail) {
      const thumbnailPath = path.resolve(options.thumbnail)
      thumbnailExtension = path.extname(thumbnailPath).toLowerCase()
      if (!['.avif', '.webp', '.png', '.jpg', '.jpeg'].includes(thumbnailExtension)) {
        throw new Error('封面只支援 AVIF、WebP、PNG 或 JPG')
      }
      const thumbnailSize = (await fs.stat(thumbnailPath)).size
      if (thumbnailSize > 1.5 * 1024 * 1024) {
        console.warn(`提醒：封面大小為 ${(thumbnailSize / 1024 / 1024).toFixed(2)} MB，建議先轉成 WebP/AVIF 並控制在 1.5 MB 以下。`)
      }
      await fs.copyFile(thumbnailPath, path.join(stagingDirectory, `cover${thumbnailExtension}`))
      const previewsRoot = path.join(packagesRoot, 'previews')
      const thumbnailDirectory = path.dirname(thumbnailPath)
      if (thumbnailDirectory.startsWith(`${previewsRoot}${path.sep}`)) {
        previewCandidatesDirectory = thumbnailDirectory
      }
    }
    console.log('正在共用 TurboWarp 執行核心與重複素材')
    await optimizeGamePackage(stagingDirectory)
    if (hasDirectory) await fs.rm(gameDirectory, { recursive: true, force: true })
    try {
      await fs.rename(stagingDirectory, gameDirectory)
    } catch (error) {
      // 某些 Windows 環境會阻擋資料夾 rename；改用複製後清除暫存資料夾。
      if (error.code !== 'EPERM') throw error
      await fs.cp(stagingDirectory, gameDirectory, { recursive: true, errorOnExist: true })
      await fs.rm(stagingDirectory, { recursive: true, force: true })
    }
  } catch (error) {
    await fs.rm(stagingDirectory, { recursive: true, force: true })
    throw error
  }

  console.log('[5/5] 正在更新 public/games.json')
  const entry = {
    id,
    creatorId,
    title,
    description: options.description || '尚未提供作品說明。',
    category: options.category || '未分類',
    age: options.age || '全年齡',
    tags: options.tags ? options.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
    playUrl: `/games/${id}/index.html`,
    thumbnail: thumbnailExtension ? `/games/${id}/cover${thumbnailExtension}` : '',
  }
  if (existingIndex === -1) manifest.push(entry)
  else manifest[existingIndex] = entry
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await pruneSharedResources()
  if (previewCandidatesDirectory) {
    await fs.rm(previewCandidatesDirectory, { recursive: true, force: true })
    console.log('已清除匯入完成後的預覽候選圖')
  }

  console.log(`\n完成：${title}`)
  console.log(`網站路徑：${entry.playUrl}`)
  console.log(`保留 ZIP：${packagePath}`)
}

main().catch((error) => {
  console.error(`\n匯入失敗：${error.message}`)
  process.exitCode = 1
})
