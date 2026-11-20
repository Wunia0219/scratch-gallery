import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { loadEnv } from 'vite'
import { getFirebaseServices } from '../netlify/lib/firebase-runtime.mjs'
import { initialActivity, readPublicState, mutateActivity, listPublicActivities } from '../netlify/lib/activity-service.mjs'
import { editableActivity } from '../src/lib/activitySchema.js'

Object.assign(process.env, loadEnv('development', process.cwd(), ''))
const args = process.argv.slice(2)
const expectedProject = args.find(value => value.startsWith('--project='))?.slice('--project='.length)
if (!args.includes('--run') || !expectedProject || expectedProject !== process.env.FIREBASE_PROJECT_ID) throw new Error('請使用 --run --project=<目前專案 ID>，明確指定連線檢查目的地')
const services = await getFirebaseServices()
const baseline = await services.store.get('siteSettings/public')
const prefix = `integrationChecks/${randomUUID()}`
assert.match(prefix, /^integrationChecks\/[a-f0-9-]{36}$/)
const scopedPath = value => {
  assert.match(value, /^(activities|activityDrafts|siteSettings|auditLogs)\/[a-zA-Z0-9-]+$/)
  return `${prefix}/${value}`
}
const store = {
  get: path => services.store.get(scopedPath(path)),
  list: path => { assert.match(path, /^(activities|activityDrafts|auditLogs)$/); return services.store.list(`${prefix}/${path}`) },
  transaction: callback => services.store.transaction(tx => callback({
    get: path => tx.get(scopedPath(path)),
    set: (path, value) => tx.set(scopedPath(path), value),
    delete: path => tx.delete(scopedPath(path)),
  })),
}
try {
  const initial = { ...initialActivity(), createdAt: new Date().toISOString() }
  await store.transaction(async tx => {
    tx.set(`activities/${initial.id}`, initial)
    tx.set('siteSettings/public', { featuredActivityId: initial.id, revision: 1, contentVersions: { events: 'connection-check' } })
  })
  const input = { id: initial.id, action: 'save', operationId: randomUUID(), expectedRevision: 1, expectedDraftRevision: 0, activity: { ...editableActivity(initial), title: '隔離的資料庫連線檢查' }, makeFeatured: true }
  const result = await mutateActivity(store, 'connection-check', input)
  assert.deepEqual(await mutateActivity(store, 'connection-check', input), result)
  assert.equal((await readPublicState(store)).featuredActivity.title, initial.title)
  await mutateActivity(store, 'connection-check', { ...input, action: 'publish', expectedDraftRevision: 1, operationId: randomUUID() })
  assert.equal((await readPublicState(store)).featuredActivity.title, input.activity.title)
  assert.equal((await store.get(`activities/${initial.id}`)).createdAt, initial.createdAt)
  assert.equal(await store.get(`activityDrafts/${initial.id}`), null)
  const concurrent = await Promise.allSettled([0, 1].map(() => mutateActivity(store, 'connection-check', { ...input, expectedRevision: 2, operationId: randomUUID() })))
  assert.equal(concurrent.filter(value => value.status === 'fulfilled').length, 1)
  assert.equal(concurrent.find(value => value.status === 'rejected').reason.status, 409)
  await mutateActivity(store, 'connection-check', { id: input.id, action: 'hide', expectedRevision: 2, expectedDraftRevision: 1, operationId: randomUUID() })
  assert.equal((await readPublicState(store)).featuredActivity, null)
  assert.equal((await listPublicActivities(store)).length, 0)
  assert.deepEqual(await services.store.get('siteSettings/public'), baseline)
  console.log(`PASS ${services.projectId}: 真實 Firestore 草稿、發布、關閉、重試與同時修改；公開網站設定未變更。`)
} finally {
  // Delete only this run's randomly named private test subtree.
  await services.db.recursiveDelete(services.db.doc(prefix))
  for (const collection of ['activities', 'activityDrafts', 'siteSettings', 'auditLogs']) assert.equal((await services.store.list(`${prefix}/${collection}`)).length, 0)
  console.log('本次隔離測試資料已清理。')
}
