let auth, sdk
export async function initializeAdminAuth(config, callback) {
  const [appSdk, authSdk] = await Promise.all([import('firebase/app'), import('firebase/auth')])
  sdk = authSdk
  const app = appSdk.getApps().find(item => item.name === 'gallery-admin') ?? appSdk.initializeApp(config.firebase, 'gallery-admin')
  auth = sdk.getAuth(app)
  if (config.authEmulator && !auth.emulatorConfig) sdk.connectAuthEmulator(auth, config.authEmulator, { disableWarnings: true })
  await sdk.setPersistence(auth, sdk.browserSessionPersistence)
  return sdk.onAuthStateChanged(auth, callback)
}
export async function signInAdmin() {
  const provider = new sdk.GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  return sdk.signInWithPopup(auth, provider)
}
export const signOutAdmin = () => sdk.signOut(auth)
export async function adminRequest(path, body) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('請先登入管理帳號')
  const response = await fetch(`/api/admin/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store' })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || '暫時無法完成操作')
  return result
}
export async function adminDownload(path, filename, body) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('請先登入管理帳號')
  const response = await fetch(`/api/admin/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store' })
  if (!response.ok) { const value = await response.json(); throw new Error(value.error || '匯出暫時無法完成') }
  const url = URL.createObjectURL(await response.blob()), link = document.createElement('a')
  link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
}
