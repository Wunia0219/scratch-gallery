// Generates ignored local configuration only; never deploys or prints credentials.
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { loadEnv } from 'vite'
import { ACTIVITY_ID } from '../src/lib/activitySchema.js'
import { votingKey } from '../netlify/lib/voting-signature.mjs'
const args = process.argv.slice(2), arg = name => args.find(value => value.startsWith(name + '='))?.slice(name.length + 1)
const activityId = arg('--activity'), setupPath = arg('--setup')
if (!activityId || !ACTIVITY_ID.test(activityId) || process.env.CONTEXT) throw new Error('僅能在本機使用 --activity=<活動代號> [--setup=<串接 JSON 路徑>]')
Object.assign(process.env, loadEnv('development', process.cwd(), ''))
let setup = setupPath ? JSON.parse(await readFile(resolve(setupPath), 'utf8')) : null
if (setup && setup.activityId !== activityId) throw new Error('串接設定與指定活動不同')
if (!args.includes('--apply')) { console.log('預覽：將建立此活動的私密 Script Properties 設定；不部署、不連接 Google、不修改投票資料。確認後加上 --apply。'); process.exit(0) }
const localEnv = resolve('.env.local'), folder = resolve('.packages/firebase-local/voting'), destination = resolve(folder, `${activityId}-properties.json`)
for (const path of [localEnv, destination]) { execFileSync('git', ['check-ignore', '--quiet', path]); try { execFileSync('git', ['ls-files', '--error-unmatch', path], { stdio: 'ignore' }); throw new Error('Secret destination is tracked') } catch (error) { if (error.message === 'Secret destination is tracked') throw error } }
await mkdir(folder, { recursive: true })
function protect(path, directory = false) {
  if (process.platform === 'win32') {
    const account = execFileSync('whoami', [], { encoding: 'utf8' }).trim(), inherited = directory ? '(OI)(CI)' : ''
    execFileSync('icacls', [path, '/inheritance:r', '/grant:r', `${account}:${inherited}F`, `*S-1-5-18:${inherited}F`, `*S-1-5-32-544:${inherited}F`], { stdio: 'ignore' })
  } else return chmod(path, directory ? 0o700 : 0o600)
}
await protect(folder, true)
let envText = await readFile(localEnv, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error })
for (const name of ['VOTING_SYNC_SECRET', 'VOTING_CONTROL_SECRET']) {
  const root = process.env[name] || randomBytes(32).toString('hex')
  if (!/^[0-9a-f]{64}$/.test(root)) throw new Error('現有投票金鑰格式不正確；不自動覆寫')
  process.env[name] = root
  if (!new RegExp(`^${name}=`, 'm').test(envText)) envText += `\n${name}=${root}\n`
}
// If no .env.local exists yet, create an empty file and restrict it before adding secrets.
await writeFile(localEnv, await readFile(localEnv, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error }), { mode: 0o600 }); await protect(localEnv)
await writeFile(localEnv, envText, { mode: 0o600 })
const properties = { ACTIVITY_ID: activityId, FORM_ID: setup?.formId || '', SYNC_URL: '', SYNC_KEY: votingKey(activityId, 'sync'), CONTROL_KEY: votingKey(activityId, 'control') }
if (setup) {
  const body = JSON.stringify({ activityId, title: setup.title, maxChoices: setup.maxChoices, entries: setup.entries })
  if (Buffer.byteLength(body) <= 8000) properties.BOOTSTRAP_JSON = body
  else for (let index = 0; index * 1500 < body.length; index++) properties[`BOOTSTRAP_${index}`] = body.slice(index * 1500, (index + 1) * 1500)
}
await writeFile(destination, JSON.stringify(properties, null, 2), { mode: 0o600 }); await protect(destination)
console.log(`已保存私密串接設定：${destination}\n請從本機檔案填入 Apps Script 的 Script Properties。SYNC_URL 留空，待核對測試／正式環境網址後設定。未部署或開放投票。`)
