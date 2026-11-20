import { mkdir, writeFile, chmod } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const run = promisify(execFile)
export async function saveCatalogBackup(value) {
  const folder = resolve('.packages/firebase-backups')
  await mkdir(folder, { recursive: true }); await chmod(folder, 0o700)
  if (process.platform === 'win32') {
    const { stdout } = await run('whoami', [])
    await run('icacls', [folder, '/inheritance:r', '/grant:r', `${stdout.trim()}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'])
  }
  const path = resolve(folder, `catalog-${Date.now()}.json`)
  await writeFile(path, JSON.stringify(value, null, 2), { mode: 0o600 })
  return path
}
