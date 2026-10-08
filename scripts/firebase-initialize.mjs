import { loadEnv } from 'vite'
import { getFirebaseServices } from '../netlify/lib/firebase-runtime.mjs'
import { initialActivity } from '../netlify/lib/activity-service.mjs'
import { contentUpdates } from '../src/contentUpdates.js'

Object.assign(process.env, loadEnv('development', process.cwd(), ''))
const args = process.argv.slice(2)
const emulator = args.includes('--emulator')
const expectedProject = emulator ? 'demo-scratch-gallery' : 'scratch-gallery-c0e33'
if (!args.includes('--initialize') || process.env.FIREBASE_PROJECT_ID !== expectedProject) throw new Error(`請明確使用 --initialize，並確認專案為 ${expectedProject}`)
if (emulator !== Boolean(process.env.FIRESTORE_EMULATOR_HOST)) throw new Error('專案與模擬器設定不一致')
const services = await getFirebaseServices()
const email = 'nini900219@gmail.com'
let account
try { account = await services.auth.getUserByEmail(email) } catch (reason) {
  if (reason.code !== 'auth/user-not-found') throw new Error(`Firebase 登入服務尚未連接，請檢查私密金鑰與 IAM 權限（${reason.code || reason.name}）。`)
  if (!emulator) throw new Error('請先以站主 Google 帳號在本機後台登入一次，再執行初始化；不要建立密碼帳號代替。')
  account = await services.auth.createUser({ uid: 'emulator-owner', email, emailVerified: true })
}
if (!account.emailVerified || (!emulator && !account.providerData.some(item => item.providerId === 'google.com'))) throw new Error('站主需要已驗證的 Google 帳號')
await services.store.transaction(async tx => {
  const [settings, owner, activity] = await Promise.all([tx.get('siteSettings/public'), tx.get(`admins/${account.uid}`), tx.get(`activities/${initialActivity().id}`)])
  if (owner && (owner.role !== 'owner' || !owner.enabled)) throw new Error('既有管理權限已停用或變更，初始化不會自動覆寫')
  if (!owner) tx.set(`admins/${account.uid}`, { role: 'owner', enabled: true, email, createdAt: new Date().toISOString() })
  if (!activity) tx.set(`activities/${initialActivity().id}`, { ...initialActivity(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
  if (!settings) tx.set('siteSettings/public', { featuredActivityId: initialActivity().id, contentVersions: contentUpdates, revision: 1, schemaVersion: 1, updatedAt: new Date().toISOString() })
})
console.log(`Firebase 初始化完成：${services.projectId}；站主與活動資料已確認。既有資料未覆寫。`)
