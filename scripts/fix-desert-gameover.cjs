const fs = require('node:fs/promises')
const path = require('node:path')
const JSZip = require('@turbowarp/jszip')

const sourcePath = process.argv[2]

if (!sourcePath) {
  throw new Error('請提供「逃離沙漠.sb3」的完整路徑')
}

async function exists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function main() {
  const resolvedSource = path.resolve(sourcePath)
  const parsed = path.parse(resolvedSource)
  const backupPath = path.join(parsed.dir, `${parsed.name}.gameover修正前${parsed.ext}`)

  const archive = await JSZip.loadAsync(await fs.readFile(resolvedSource))
  const projectFile = archive.file('project.json')
  if (!projectFile) throw new Error('SB3 中找不到 project.json')

  const project = JSON.parse(await projectFile.async('string'))
  const giraffe = project.targets.find((target) => target.name === 'giraffe')
  if (!giraffe) throw new Error('找不到 giraffe 角色')

  const blocks = giraffe.blocks
  const gameOverSwitchEntry = Object.entries(blocks).find(([, block]) => {
    if (block.opcode !== 'looks_switchcostumeto') return false
    const costumeMenuId = block.inputs?.COSTUME?.[1]
    return blocks[costumeMenuId]?.fields?.COSTUME?.[0] === 'gameover'
  })
  if (!gameOverSwitchEntry) throw new Error('找不到切換至 gameover 造型的積木')

  const [switchId, switchBlock] = gameOverSwitchEntry
  const waitUntilEntry = Object.entries(blocks).find(([, block]) => block.next === switchId)
  if (!waitUntilEntry || waitUntilEntry[1].opcode !== 'control_wait_until') {
    throw new Error('gameover 前方不是「等待直到」積木，為避免改錯已停止')
  }

  const stopAllId = switchBlock.next
  const stopAllBlock = blocks[stopAllId]
  if (!stopAllBlock || stopAllBlock.opcode !== 'control_stop' || stopAllBlock.fields?.STOP_OPTION?.[0] !== 'all') {
    throw new Error('gameover 後方不是「停止全部」積木，為避免改錯已停止')
  }

  const stopOtherId = 'codex_stop_other_giraffe_scripts'
  const renderWaitId = 'codex_wait_for_gameover_render'
  if (blocks[stopOtherId] || blocks[renderWaitId]) {
    throw new Error('修正積木已存在，未重複修改')
  }

  const [waitUntilId, waitUntilBlock] = waitUntilEntry
  waitUntilBlock.next = stopOtherId
  blocks[stopOtherId] = {
    opcode: 'control_stop',
    next: switchId,
    parent: waitUntilId,
    inputs: {},
    fields: { STOP_OPTION: ['other scripts in sprite', null] },
    mutation: { tagName: 'mutation', children: [], hasnext: 'true' },
  }
  switchBlock.parent = stopOtherId
  switchBlock.next = renderWaitId
  blocks[renderWaitId] = {
    opcode: 'control_wait',
    next: stopAllId,
    parent: switchId,
    inputs: { DURATION: [1, [5, '0.1']] },
    fields: {},
  }
  stopAllBlock.parent = renderWaitId

  if (!(await exists(backupPath))) await fs.copyFile(resolvedSource, backupPath)

  archive.file('project.json', JSON.stringify(project))
  const updated = await archive.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  const temporaryPath = `${resolvedSource}.tmp`
  await fs.writeFile(temporaryPath, updated)
  await fs.copyFile(temporaryPath, resolvedSource)
  await fs.rm(temporaryPath, { force: true })

  const verificationArchive = await JSZip.loadAsync(await fs.readFile(resolvedSource))
  const verificationProject = JSON.parse(await verificationArchive.file('project.json').async('string'))
  const verificationBlocks = verificationProject.targets.find((target) => target.name === 'giraffe')?.blocks
  if (!verificationBlocks?.[stopOtherId] || !verificationBlocks?.[renderWaitId]) {
    throw new Error('寫入後驗證失敗；請使用備份檔還原')
  }

  console.log(`完成修正：${resolvedSource}`)
  console.log(`原始備份：${backupPath}`)
}

main().catch((error) => {
  console.error(`修正失敗：${error.message}`)
  process.exitCode = 1
})
