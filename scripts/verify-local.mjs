import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Run through npm so the installed, lockfile-controlled project tools are used.
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('請使用 npm run verify:local 執行')
const env = { ...process.env }
for (const key of ['SITE_URL', 'CONTEXT', 'NETLIFY', 'URL', 'DEPLOY_URL', 'DEPLOY_PRIME_URL']) delete env[key]
const cwd = fileURLToPath(new URL('../', import.meta.url))
console.log('執行免費本機檢查：建置、安全回歸、Chrome 遊戲測試及 npm 弱點掃描。')
console.log('此指令產生 noindex 測試版 dist/；正式上線請交由 Netlify 重新建置。')
for (const args of [['run', 'verify'], ['run', 'test:browser'], ['audit', '--audit-level=high']]) {
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd, env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    console.error(`本機檢查未通過：npm ${args.join(' ')}。未執行更新、推送或部署。`)
    process.exit(result.status || 1)
  }
}
console.log('本機檢查全部通過。這是本次檢查結果；不會在電腦關閉後持續監控。')
