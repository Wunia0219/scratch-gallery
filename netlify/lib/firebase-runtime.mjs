import { ActivityError } from '../../src/lib/activitySchema.js'

export const envValue = key => globalThis.Netlify?.env?.get(key) ?? process.env[key]
export function firebaseEnvironment() {
  const projectId = envValue('FIREBASE_PROJECT_ID')
  if (!projectId || !/^[a-z][a-z0-9-]{4,62}$/.test(projectId)) throw new ActivityError('Firebase 尚未完成連接設定', 503)
  const context = envValue('CONTEXT')
  if (Boolean(envValue('FIREBASE_AUTH_EMULATOR_HOST')) !== Boolean(envValue('FIRESTORE_EMULATOR_HOST'))) throw new ActivityError('登入與資料庫必須使用同一組測試環境', 503)
  if (context && context !== 'production' && (envValue('FIREBASE_ENVIRONMENT') !== 'test' || projectId === 'scratch-gallery-c0e33')) throw new ActivityError('預覽環境尚未配置獨立測試專案', 503)
  if (context === 'production' && (envValue('FIREBASE_AUTH_EMULATOR_HOST') || envValue('FIRESTORE_EMULATOR_HOST') || envValue('FIREBASE_ENVIRONMENT') !== 'production')) throw new ActivityError('正式環境 Firebase 設定不一致', 503)
  return projectId
}
let services
export async function getFirebaseServices() {
  const projectId = firebaseEnvironment()
  if (services?.projectId === projectId) return services
  const [{ initializeApp, getApps, cert, applicationDefault }, { getAuth }, { getFirestore, Timestamp }] = await Promise.all([
    import('firebase-admin/app'), import('firebase-admin/auth'), import('firebase-admin/firestore'),
  ])
  const clientEmail = envValue('FIREBASE_CLIENT_EMAIL')
  const privateKey = envValue('FIREBASE_PRIVATE_KEY')
  const emulator = Boolean(envValue('FIRESTORE_EMULATOR_HOST'))
  const options = { projectId }
  if (!emulator) options.credential = clientEmail && privateKey ? cert({ projectId, clientEmail, privateKey: privateKey.replaceAll('\\n', '\n') }) : applicationDefault()
  const app = getApps().find(item => item.name === projectId) || initializeApp(options, projectId)
  const db = getFirestore(app)
  function toStored(value) {
    if (Array.isArray(value)) return value.map(toStored)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /^(remindFrom|startsAt|endsAt|createdAt|updatedAt|publishedAt|verifiedAt|assetsDeployedAt)$/.test(key) && typeof item === 'string' ? Timestamp.fromDate(new Date(item)) : toStored(item)]))
    return value
  }
  function toPlain(value) {
    if (value instanceof Timestamp) return value.toDate().toISOString()
    if (Array.isArray(value)) return value.map(toPlain)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toPlain(item)]))
    return value
  }
  const store = {
    async get(path) { const snap = await db.doc(path).get(); return snap.exists ? toPlain(snap.data()) : null },
    async list(path) { const snap = await db.collection(path).limit(501).get(); if (snap.size > 500) throw new ActivityError('管理清單超過 500 筆，請先擴充後台分頁', 503); return snap.docs.map(doc => ({ ...toPlain(doc.data()), id: doc.id })) },
    async query(path, options) {
      let query = db.collection(path).orderBy(options.orderBy, options.direction || 'asc')
      if (options.after !== undefined) query = query.startAfter(options.after)
      else if (options.startAt !== undefined) query = query.startAt(options.startAt)
      if (options.endBefore !== undefined) query = query.endBefore(options.endBefore)
      const snap = await query.limit(options.limit).get()
      return snap.docs.map(doc => ({ ...toPlain(doc.data()), id: doc.id }))
    },
    async transaction(callback) {
      return db.runTransaction(tx => callback({
        async get(path) { const snap = await tx.get(db.doc(path)); return snap.exists ? toPlain(snap.data()) : null },
        set(path, data) { tx.set(db.doc(path), toStored(data)) },
        delete(path) { tx.delete(db.doc(path)) },
      }))
    },
  }
  services = { projectId, store, auth: getAuth(app), db }
  return services
}
export async function requireOwner(request, services) {
  const token = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/)?.[1]
  if (!token) throw new ActivityError('請先登入管理帳號', 401)
  let user
  try { user = await services.auth.verifyIdToken(token, true) } catch (reason) {
    const invalidToken = new Set(['auth/id-token-expired', 'auth/id-token-revoked', 'auth/invalid-id-token', 'auth/argument-error', 'auth/user-disabled', 'auth/user-not-found'])
    if (invalidToken.has(reason.code)) throw new ActivityError('登入已失效，請重新登入', 401)
    console.error('Firebase login verification unavailable:', reason.code || reason.name)
    throw new ActivityError('後台登入驗證暫時無法使用，請確認伺服器連接設定', 503)
  }
  if (!user.email_verified) throw new ActivityError('此帳號尚未完成驗證', 403)
  const owner = await services.store.get(`admins/${user.uid}`)
  if (!owner?.enabled || owner.role !== 'owner') throw new ActivityError('此帳號沒有管理權限', 403)
  return user.uid
}
