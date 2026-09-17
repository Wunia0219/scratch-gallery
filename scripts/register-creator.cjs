const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

const creatorsPath = path.resolve(__dirname, '..', 'public', 'creators.json')

function usage() {
  console.log(`
用法：npm run register:creator -- --name <姓名> --class <班級> [--teacher]

每次執行都會建立新的作者 UUID。同名作者不會自動合併，以免混淆不同學生。
`)
}

function parseArguments(argv) {
  const options = { teacher: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--teacher') {
      options.teacher = true
      continue
    }
    if (argument === '--help') {
      options.help = true
      continue
    }
    if (!['--name', '--class'].includes(argument)) throw new Error(`未知選項：${argument}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${argument} 需要一個值`)
    options[argument.slice(2)] = value.trim()
    index += 1
  }
  return options
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) return usage()
  if (!options.name || !options.class) {
    usage()
    throw new Error('必須提供 --name 與 --class')
  }
  const creators = JSON.parse(await fs.readFile(creatorsPath, 'utf8'))
  if (!Array.isArray(creators)) throw new Error('public/creators.json 必須是 JSON 陣列')
  const creator = {
    id: crypto.randomUUID(),
    name: options.name,
    role: options.teacher ? 'teacher' : 'student',
    className: options.class,
  }
  creators.push(creator)
  await fs.writeFile(creatorsPath, `${JSON.stringify(creators, null, 2)}\n`, 'utf8')
  console.log(`已建立作者：${creator.name}`)
  console.log(`作者 UUID：${creator.id}`)
}

main().catch((error) => {
  console.error(`建立作者失敗：${error.message}`)
  process.exitCode = 1
})
