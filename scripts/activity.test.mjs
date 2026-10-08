import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { initialActivity, readPublicState, mutateActivity } from '../netlify/lib/activity-service.mjs'
import { editableActivity, validateActivity } from '../src/lib/activitySchema.js'
import { requireOwner, firebaseEnvironment } from '../netlify/lib/firebase-runtime.mjs'

function memoryStore() {
  const activity = initialActivity()
  const data = new Map([[`activities/${activity.id}`, activity], ['siteSettings/public', { featuredActivityId: activity.id, revision: 1, contentVersions: { events: 'original' } }]])
  let queue = Promise.resolve()
  const store = { get: async key => structuredClone(data.get(key) ?? null), list: async key => [...data.entries()].filter(([path]) => path.startsWith(`${key}/`)).map(([, value]) => structuredClone(value)), transaction(callback) {
    const result = queue.then(async () => {
      const changes = new Map()
      const value = await callback({ get: store.get, set: (key, value) => changes.set(key, structuredClone(value)), delete: key => changes.set(key, null) })
      for (const [key, value] of changes) value === null ? data.delete(key) : data.set(key, value)
      return value
    })
    queue = result.catch(() => {})
    return result
  } }
  return { store, data, input: { id: activity.id, action: 'save', operationId: randomUUID(), expectedRevision: 1, expectedDraftRevision: 0, activity: { ...editableActivity(activity), title: '尚未公開的草稿', description: '私人草稿內容' }, makeFeatured: true } }
}
test('草稿保持私有，發布與關閉原子更新公開版本', async () => {
  const { store, data, input } = memoryStore()
  await mutateActivity(store, 'owner', input)
  assert.equal((await readPublicState(store)).featuredActivity.title, initialActivity().title)
  assert.doesNotMatch(JSON.stringify(await readPublicState(store)), /私人草稿|updatedBy|actorUid/)
  await mutateActivity(store, 'owner', { ...input, action: 'publish', expectedDraftRevision: 1, operationId: randomUUID() })
  assert.equal((await readPublicState(store)).featuredActivity.title, input.activity.title)
  assert.equal(data.has(`activityDrafts/${input.id}`), false)
  await mutateActivity(store, 'owner', { id: input.id, action: 'hide', expectedRevision: 2, expectedDraftRevision: 0, operationId: randomUUID() })
  assert.equal((await readPublicState(store)).featuredActivity, null)
  assert.equal((await readPublicState(store)).contentUpdates.events, null)
})
test('重試同一操作不重複更新；相同識別碼不能更換內容', async () => {
  const { store, data, input } = memoryStore()
  const first = await mutateActivity(store, 'owner', input)
  assert.deepEqual(await mutateActivity(store, 'owner', input), first)
  assert.equal([...data.keys()].filter(key => key.startsWith('auditLogs/')).length, 1)
  await assert.rejects(mutateActivity(store, 'owner', { ...input, activity: { ...input.activity, title: '另一份草稿' } }), error => error.status === 409)
})
test('兩個分頁同時修改，只有第一個版本可儲存；發布需對應已儲存草稿', async () => {
  const { store, input } = memoryStore()
  const results = await Promise.allSettled([mutateActivity(store, 'owner', input), mutateActivity(store, 'owner', { ...input, operationId: randomUUID() })])
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1)
  assert.equal(results.find(item => item.status === 'rejected').reason.status, 409)
  await assert.rejects(mutateActivity(store, 'owner', { ...input, action: 'publish', expectedDraftRevision: 1, operationId: randomUUID(), activity: { ...input.activity, title: '未儲存版本' } }), error => error.status === 409)
  assert.equal((await readPublicState(store)).revision, 1)
})
test('管理入口驗證 token 撤銷狀態與啟用的 owner 權限', async () => {
  const services = { auth: { async verifyIdToken(token, revoked) { assert.equal(token, 'valid'); assert.equal(revoked, true); return { uid: 'owner', email_verified: true } } }, store: { get: async () => ({ enabled: true, role: 'owner' }) } }
  await assert.rejects(requireOwner(new Request('http://localhost'), services), error => error.status === 401)
  const request = new Request('http://localhost', { headers: { Authorization: 'Bearer valid' } })
  assert.equal(await requireOwner(request, services), 'owner')
  services.store.get = async () => ({ enabled: false, role: 'owner' })
  await assert.rejects(requireOwner(request, services), error => error.status === 403)
  services.auth.verifyIdToken = async () => { throw Object.assign(new Error('expired'), { code: 'auth/id-token-expired' }) }
  await assert.rejects(requireOwner(request, services), error => error.status === 401)
  services.auth.verifyIdToken = async () => { throw Object.assign(new Error('server credential unavailable'), { code: 'app/invalid-credential' }) }
  await assert.rejects(requireOwner(request, services), error => error.status === 503)
})
test('預覽不可連正式 Firebase，正式環境不可使用模擬器', () => {
  const keys = ['CONTEXT', 'FIREBASE_PROJECT_ID', 'FIREBASE_ENVIRONMENT', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST']
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  try {
    for (const key of keys) delete process.env[key]
    Object.assign(process.env, { CONTEXT: 'deploy-preview', FIREBASE_PROJECT_ID: 'scratch-gallery-c0e33', FIREBASE_ENVIRONMENT: 'production' })
    assert.throws(firebaseEnvironment, error => error.status === 503)
    Object.assign(process.env, { CONTEXT: 'production', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' })
    assert.throws(firebaseEnvironment, error => error.status === 503)
  } finally { for (const key of keys) previous[key] === undefined ? delete process.env[key] : process.env[key] = previous[key] }
})
test('表單與示範白名單、日期及未知欄位均在伺服器拒絕', () => {
  const activity = editableActivity(initialActivity())
  for (const change of [{ submissionUrl: 'javascript:alert(1)' }, { submissionUrl: 'https://evil.example/forms/a' }, { previewId: '../../secret' }, { startsAt: activity.endsAt }, { role: 'owner' }]) assert.throws(() => validateActivity({ ...activity, ...change }))
})
