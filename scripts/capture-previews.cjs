const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const Packager = require('@turbowarp/packager')
const JSZip = require('@turbowarp/jszip')
const { chromium } = require('playwright-core')

const projectRoot = path.resolve(__dirname, '..')
const previewsRoot = path.join(projectRoot, '.packages', 'previews')

function usage() {
  console.log(`
用法：npm run capture-previews -- <game.sb3> [選項]

  --slug <英文代號>      預覽圖資料夾名稱；預設由檔名產生
  --times <毫秒清單>    擷取時間，例如「1200,2500,4500,7000」
  --help                 顯示說明

候選圖會寫入 .packages/previews/<slug>/，不會修改網站。
`)
}

function parseArguments(argv) {
  const options = {}
  const positional = []
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) {
      positional.push(argument)
      continue
    }
    const name = argument.slice(2)
    if (name === 'help') {
      options.help = true
      continue
    }
    if (!['slug', 'times'].includes(name)) throw new Error(`未知選項：--${name}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`--${name} 需要一個值`)
    options[name] = value
    index += 1
  }
  if (positional.length > 1) throw new Error('一次只能處理一個 SB3 檔案')
  options.input = positional[0]
  return options
}

function makeSlug(value) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
}

function parseTimes(value) {
  const times = (value || '1200,2500,4500,7000,10000')
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
  if (!times.length || times.some((item) => !Number.isFinite(item) || item < 250 || item > 30000)) {
    throw new Error('--times 必須是 250–30000 之間的毫秒數，以逗號分隔')
  }
  return [...new Set(times)].sort((a, b) => a - b)
}

function findBrowser() {
  const configured = process.env.SCRATCH_PREVIEW_BROWSER
  const candidates = [
    configured,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean)
  const browser = candidates.find((candidate) => fsSync.existsSync(candidate))
  if (!browser) {
    throw new Error('找不到 Chrome 或 Edge；可用 SCRATCH_PREVIEW_BROWSER 指定瀏覽器執行檔')
  }
  return browser
}

function safePath(root, relativePath) {
  const normalized = relativePath.replace(/\\/g, '/')
  const segments = normalized.split('/')
  if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized) || segments.includes('..')) {
    throw new Error(`ZIP 包含不安全路徑：${relativePath}`)
  }
  const resolved = path.resolve(root, ...segments)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`ZIP 路徑超出暫存資料夾：${relativePath}`)
  }
  return resolved
}

async function extractZip(buffer, destination) {
  const archive = await JSZip.loadAsync(buffer)
  const entries = Object.values(archive.files)
  if (!entries.some((entry) => entry.name === 'index.html')) throw new Error('預覽套件缺少 index.html')
  for (const entry of entries) {
    const target = safePath(destination, entry.name)
    if (entry.dir) {
      await fs.mkdir(target, { recursive: true })
    } else {
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, await entry.async('nodebuffer'))
    }
  }
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
  }[extension] || 'application/octet-stream'
}

function startServer(root) {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1)
      const target = safePath(root, relative)
      const data = await fs.readFile(target)
      response.writeHead(200, { 'Content-Type': contentType(target), 'Cache-Control': 'no-store' })
      response.end(data)
    } catch {
      response.writeHead(404)
      response.end('Not found')
    }
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
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
  const slug = options.slug || makeSlug(path.basename(inputPath, '.sb3')) || 'scratch-game'
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('slug 只能包含小寫英文字母、數字與中間連字號')
  const times = parseTimes(options.times)
  const outputDirectory = path.join(previewsRoot, slug)
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scratch-preview-'))
  const gameRoot = path.join(tempRoot, 'game')
  const browser = findBrowser()

  console.log(`[1/4] 讀取並驗證 ${inputPath}`)
  const loadedProject = await Packager.loadProject(await fs.readFile(inputPath))
  const packager = new Packager.Packager()
  packager.project = loadedProject
  packager.options.target = 'zip'
  packager.options.turbo = false
  packager.options.autoplay = true
  packager.options.controls.greenFlag.enabled = false
  packager.options.controls.stopAll.enabled = false
  packager.options.controls.pause.enabled = false
  packager.options.controls.fullscreen.enabled = false
  console.log('[2/4] 建立僅供截圖使用的暫存預覽')
  const result = await packager.package()
  if (result.type !== 'application/zip') throw new Error(`預期 ZIP，實際得到 ${result.type}`)

  await fs.mkdir(gameRoot, { recursive: true })
  await extractZip(result.data, gameRoot)
  await fs.rm(outputDirectory, { recursive: true, force: true })
  await fs.mkdir(outputDirectory, { recursive: true })
  const server = await startServer(gameRoot)
  const port = server.address().port
  console.log(`[3/4] 擷取 ${times.length} 張不同時間點的候選畫面`)
  let launchedBrowser
  try {
    launchedBrowser = await chromium.launch({
      executablePath: browser,
      headless: true,
      args: ['--mute-audio', '--disable-gpu'],
    })
    const page = await launchedBrowser.newPage({ viewport: { width: 480, height: 360 } })
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
    let elapsed = 0
    for (let index = 0; index < times.length; index += 1) {
      const delay = times[index]
      const filename = `${String(index + 1).padStart(2, '0')}-${delay}ms.webp`
      const output = path.join(outputDirectory, filename)
      await page.waitForTimeout(delay - elapsed)
      await page.screenshot({ path: output, type: 'webp', quality: 82, animations: 'allow' })
      elapsed = delay
      console.log(`  ${filename}`)
    }
  } finally {
    if (launchedBrowser) await launchedBrowser.close()
    await new Promise((resolve) => server.close(resolve))
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
  console.log(`[4/4] 完成：${outputDirectory}`)
  console.log('請檢視候選圖，選出最能代表玩法、主角清楚且特效不遮擋畫面的一張，再以 --thumbnail 匯入網站。')
}

main().catch((error) => {
  console.error(`\n預覽圖擷取失敗：${error.message}`)
  process.exitCode = 1
})
