import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { editableWork, validateWork, publicWork } from '../src/lib/workSchema.js'
import { mutateWork, listPublishedWorks, readPublishedWork, listWorkHistory } from '../netlify/lib/work-service.mjs'
const id = '123e4567-e89b-42d3-a456-426614174000', creatorId = '123e4567-e89b-42d3-a456-426614174001'
const creator = { id: creatorId, name: '學生甲', className: 'Scratch-115', role: 'student' }
const asset = { id, assetVersion: 'version1', playUrl: `/games/${id}/index.html`, thumbnail: `/games/${id}/cover.webp`, thumbnails: [`/games/${id}/cover.webp`] }
const manifest = { works: [asset] }
const content = { id, creatorId, title: '新作品', description: '作品介紹', category: '創意', tags: ['互動'], devices: ['desktop'], controls: '', objective: '', thumbnail: asset.thumbnail, sortOrder: 0 }
export function memoryStore(initial = {}) {
  const data = new Map(Object.entries(initial).map(([key, value]) => [key, structuredClone(value)]))
  let queue = Promise.resolve()
  const store = {
    data, queries: [],
    async get(path) { return structuredClone(data.get(path) ?? null) },
    async list(path) { return [...data].filter(([key]) => key.startsWith(path + '/') && key.split('/').length === path.split('/').length + 1).map(([key, value]) => ({ ...structuredClone(value), id: key.split('/').at(-1) })) },
    async query(path, options) {
      store.queries.push(options)
      return (await store.list(path)).filter(item => (!options.startAt || item[options.orderBy] >= options.startAt) && (!options.endBefore || item[options.orderBy] < options.endBefore) && (options.after === undefined || item[options.orderBy] > options.after)).sort((a, b) => (a[options.orderBy] < b[options.orderBy] ? -1 : 1) * (options.direction === 'desc' ? -1 : 1)).slice(0, options.limit)
    },
    transaction(callback) {
      const result = queue.then(async () => {
        let writing = false; const writes = []
        const result = await callback({ async get(path) { assert.equal(writing, false, 'Firestore transaction must read before writes'); return store.get(path) }, set(path, value) { writing = true; writes.push([path, structuredClone(value)]) }, delete(path) { writing = true; writes.push([path, null]) } })
        for (const [path, value] of writes) value === null ? data.delete(path) : data.set(path, value)
        return result
      })
      queue = result.catch(() => {})
      return result
    },
  }
  return store
}
function fixture(extra = {}) {
  return memoryStore({ [`creators/${creatorId}`]: creator, [`works/${id}`]: { ...content, status: 'draft', hasPublished: false, publishedAt: null, revision: 1, sourceOrder: 0 }, [`workAssets/${id}`]: { id, assetVersion: asset.assetVersion, environment: 'test', verifiedAt: '2026-10-08T00:00:00.000Z' }, 'siteSettings/public': { revision: 1, contentVersions: {} }, 'siteSettings/catalog': { revision: 1, counts: { student: 0, teacher: 0 }, classCounts: {} }, ...extra })
}
const input = (action, revision = 1, draftRevision = 0, extra = {}) => ({ id, action, expectedRevision: revision, expectedDraftRevision: draftRevision, operationId: randomUUID(), ...(['save', 'publish'].includes(action) ? { work: content } : {}), ...extra })
const apply = (store, body, date = '2026-10-08T03:00:00.000Z', environment = 'test') => mutateWork(store, 'owner', body, manifest, environment, () => date)
test('draft stays private; publish records first date once; retry and relisting preserve it', async () => {
  const store = fixture()
  await apply(store, input('save'))
  assert.equal(await store.get(`publicWorks/${id}`), null)
  const command = input('publish', 1, 1)
  const first = await apply(store, command)
  assert.deepEqual(await apply(store, command, '2026-10-09T03:00:00.000Z'), first)
  assert.equal((await store.get('siteSettings/catalog')).counts.student, 1)
  const published = await readPublishedWork(store, manifest, 'test', id)
  assert.equal(published.publishedAt, '2026-10-08T03:00:00.000Z')
  assert.equal('updatedBy' in published, false)
  await apply(store, input('hide', 2, 0))
  await assert.rejects(readPublishedWork(store, manifest, 'test', id), error => error.status === 404)
  assert.equal((await store.get('siteSettings/catalog')).counts.student, 0)
  await apply(store, input('save', 3, 0))
  await apply(store, input('publish', 3, 1), '2026-11-08T03:00:00.000Z')
  assert.equal((await store.get(`publicWorks/${id}`)).publishedAt, first.publishedAt)
  assert.equal((await listWorkHistory(store, id)).length, 3)
})
test('resources, exact saved content, optimistic revisions, and operation identity are enforced', async () => {
  const store = fixture()
  const save = input('save')
  await apply(store, save)
  await assert.rejects(apply(store, input('publish', 1, 1), undefined, 'production'), /檔案已部署/)
  await assert.rejects(apply(store, input('publish', 1, 1, { work: { ...content, title: '未儲存的標題' } })), /儲存目前草稿/)
  await assert.rejects(apply(store, input('save')), error => error.status === 409)
  await assert.rejects(apply(store, { ...save, work: { ...content, title: '重用操作代號' } }), error => error.status === 409)
  const results = await Promise.allSettled([apply(store, input('save', 1, 1)), apply(store, input('save', 1, 1))])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
})
test('historical unknown dates remain unknown; restore creates a private draft', async () => {
  const store = fixture({ [`works/${id}`]: { ...content, revision: 1, status: 'published', hasPublished: true, publishedAt: null }, [`publicWorks/${id}`]: publicWork({ ...content, revision: 1, publishedAt: null }, asset, creator), 'siteSettings/catalog': { revision: 1, counts: { student: 1, teacher: 0 }, classCounts: { 'Scratch-115': 1 } } })
  await apply(store, input('save'))
  await apply(store, input('publish', 1, 1))
  assert.equal((await store.get(`publicWorks/${id}`)).publishedAt, null)
  await apply(store, input('restore', 2, 0, { historyRevision: 1 }))
  assert.equal((await store.get(`workDrafts/${id}`)).title, content.title)
  assert.equal((await store.get(`publicWorks/${id}`)).revision, 2)
})
test('clients cannot supply executable paths or override server dates/roles/resources', () => {
  for (const change of [{ thumbnail: 'https://example.com/x.webp' }, { creatorType: 'teacher' }, { publishedAt: '2026-01-01' }, { assetVersion: 'fake' }, { sortOrder: 10000 }, { devices: [] }]) assert.throws(() => validateWork({ ...content, ...change }, asset, creator))
  assert.equal(editableWork({ ...content, updatedBy: 'private' }).updatedBy, undefined)
})
test('local resource verification cannot start a real new work publication', async () => {
  const store = fixture({ [`workAssets/${id}`]: { assetVersion: asset.assetVersion, environment: 'local', verifiedAt: '2026-10-08T00:00:00.000Z' } })
  await apply(store, input('save'), undefined, 'local')
  await assert.rejects(apply(store, input('publish', 1, 1), undefined, 'local'), error => error.status === 409)
  assert.equal((await store.get(`works/${id}`)).publishedAt, null)
})
test('a deployment with unverified public resources fails without a misleading partial catalog', async () => {
  const store = fixture({ [`publicWorks/${id}`]: publicWork({ ...content, revision: 1, publishedAt: null }, asset, creator) })
  await assert.rejects(listPublishedWorks(store, manifest, 'production'), error => error.status === 503)
  await assert.rejects(readPublishedWork(store, manifest, 'production', id), error => error.status === 404)
})
test('cursor uses stable server ordering, excludes drafts and rejects stale revisions', async () => {
  const store = fixture(), assets = []
  for (let i = 0; i < 23; i++) {
    const nextId = `123e4567-e89b-42d3-a456-${String(i).padStart(12, '0')}`
    const nextAsset = { ...asset, id: nextId }, work = { ...content, id: nextId, title: i === 22 ? '找到目標' : '作品', sourceOrder: i, revision: 1, publishedAt: null }
    assets.push(nextAsset)
    store.data.set(`publicWorks/${nextId}`, publicWork(work, nextAsset, creator))
    store.data.set(`workAssets/${nextId}`, { assetVersion: nextAsset.assetVersion, environment: 'test', verifiedAt: '2026-10-08T00:00:00.000Z' })
  }
  const m = { works: assets }, first = await listPublishedWorks(store, m, 'test', { role: 'student' }), second = await listPublishedWorks(store, m, 'test', { role: 'student', cursor: first.cursor })
  assert.equal(first.items.length, 9); assert.equal(second.items.length, 9)
  assert.equal(new Set([...first.items, ...second.items].map(work => work.id)).size, 18)
  assert.equal((await listPublishedWorks(store, m, 'test', { role: 'student', q: '找到' })).items[0].title, '找到目標')
  assert.equal((await listPublishedWorks(store, m, 'test', { role: 'teacher' })).items.length, 0)
  store.data.get('siteSettings/catalog').revision++
  await assert.rejects(listPublishedWorks(store, m, 'test', { cursor: first.cursor }), error => error.status === 409)
  await assert.rejects(listPublishedWorks(store, m, 'test', { cursor: first.cursor, device: 'mobile' }), error => error.status === 400)
})
