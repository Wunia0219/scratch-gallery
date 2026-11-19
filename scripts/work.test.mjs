import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { editableWork, validateWork, publicWork } from '../src/lib/workSchema.js'
import { mutateWork, listPublishedWorks, readPublishedWork, listWorkHistory, listAdminWorks } from '../netlify/lib/work-service.mjs'
import { halloweenTeaserIds, halloweenWorkIds } from '../src/lib/halloweenShowcase.js'
import { halloweenShowcaseData, halloweenTeaserData, readHalloweenWorks } from '../netlify/lib/halloween-showcase.mjs'
import games from '../public/games.json' with { type: 'json' }
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
      const fields = options.thenBy ? [options.orderBy, options.thenBy] : [options.orderBy]
      const compare = (a, b) => a.reduce((result, value, index) => {
        if (result || value === b[index]) return result
        const direction = index === 0 && options.direction === 'desc' ? -1 : 1
        return direction * (b[index] !== null && (value === null || value < b[index]) ? -1 : 1)
      }, 0)
      const values = item => fields.map(field => item[field])
      const after = options.thenBy ? options.after : [options.after]
      return (await store.list(path))
        .filter(item => (!options.where || item[options.where.field] === options.where.value) && fields.every(field => Object.hasOwn(item, field)))
        .filter(item => options.after === undefined || compare(values(item), after) > 0)
        .sort((a, b) => compare(values(a), values(b))).slice(0, options.limit)
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
    const nextAsset = { ...asset, id: nextId }
    const publishedAt = i < 10 ? new Date(Date.UTC(2026, 10, i + 1)).toISOString() : null
    const work = { ...content, id: nextId, title: i === 22 ? '找到目標' : '作品', sourceOrder: i, revision: 1, publishedAt, sortOrder: i < 10 ? i - 10 : 0 }
    assets.push(nextAsset)
    store.data.set(`publicWorks/${nextId}`, publicWork(work, nextAsset, creator))
    store.data.set(`workAssets/${nextId}`, { assetVersion: nextAsset.assetVersion, environment: 'test', verifiedAt: '2026-10-08T00:00:00.000Z' })
  }
  const m = { works: assets }, first = await listPublishedWorks(store, m, 'test', { role: 'student' }), second = await listPublishedWorks(store, m, 'test', { role: 'student', cursor: first.cursor })
  assert.equal(first.items.length, 9); assert.equal(second.items.length, 9)
  assert.equal(new Set([...first.items, ...second.items].map(work => work.id)).size, 18)
  assert.deepEqual(first.items.map(work => work.id), assets.slice(1, 10).reverse().map(asset => asset.id))
  assert.deepEqual(second.items.map(work => work.id), [assets[0], ...assets.slice(10, 18)].map(asset => asset.id))
  const last = await listPublishedWorks(store, m, 'test', { cursor: second.cursor })
  assert.deepEqual(last.items.map(work => work.id), assets.slice(18).map(asset => asset.id))
  assert.equal((await listPublishedWorks(store, m, 'test', { role: 'student', q: '找到' })).items[0].title, '找到目標')
  assert.equal((await listPublishedWorks(store, m, 'test', { role: 'teacher' })).items.length, 0)
  const previousCursor = JSON.parse(Buffer.from(first.cursor, 'base64url').toString())
  previousCursor.after = previousCursor.after[1]
  await assert.rejects(listPublishedWorks(store, m, 'test', { cursor: Buffer.from(JSON.stringify(previousCursor)).toString('base64url') }), error => error.status === 409)
  store.data.get('siteSettings/catalog').revision++
  await assert.rejects(listPublishedWorks(store, m, 'test', { cursor: first.cursor }), error => error.status === 409)
  await assert.rejects(listPublishedWorks(store, m, 'test', { cursor: first.cursor, device: 'mobile' }), error => error.status === 400)
})

test('admin sorts existing releases by first publication and drafts by registration', async () => {
  const store = memoryStore({
    'works/unknown': { status: 'published', publishedAt: null, createdAt: '2026-11-19T00:00:00.000Z' },
    'works/old': { status: 'unlisted', publishedAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-11-19T00:00:00.000Z' },
    'works/draft': { status: 'draft', publishedAt: null, createdAt: '2026-11-01T00:00:00.000Z' },
    'works/new': { status: 'published', publishedAt: '2026-10-15T00:00:00.000Z' },
  })
  const result = await listAdminWorks(store, manifest, 'test')
  assert.deepEqual(result.works.map(work => work.id), ['draft', 'new', 'old', 'unknown'])
})

test('Halloween showcase uses only its fixed works, keeps drafts private and sorts by first publication', async () => {
  assert.equal(new Set(halloweenWorkIds).size, 13)
  assert.ok(halloweenWorkIds.every(workId => games.some(game => game.id === workId)))
  const cactusRunId = 'e6a3907c-2a71-4ac4-b692-e262713015ed'
  assert.ok(games.some(game => game.id === cactusRunId))
  const entries = [
    { id: halloweenTeaserIds[0], publishedAt: '2026-11-14T12:00:00.000Z' },
    { id: halloweenTeaserIds[1], publishedAt: '2026-11-16T12:00:00.000Z' },
    { id: halloweenTeaserIds[2], releasePending: true },
    { id: cactusRunId, tags: ['萬聖節'], publishedAt: '2026-11-17T12:00:00.000Z' },
  ].map(work => ({ title: '作品', thumbnail: asset.thumbnail, creatorType: 'student', assetVersion: 'version1', ...work }))
  const visible = halloweenShowcaseData(entries).items
  assert.deepEqual(visible.map(work => work.id), [halloweenTeaserIds[1], halloweenTeaserIds[0]])
  assert.deepEqual(halloweenTeaserData(entries).covers.map(work => Object.keys(work)), [['id', 'title', 'thumbnail'], ['id', 'title', 'thumbnail']])
  const store = memoryStore({
    [`publicWorks/${entries[0].id}`]: entries[0], [`publicWorks/${entries[1].id}`]: entries[1],
    [`workAssets/${entries[0].id}`]: { assetVersion: 'version1', environment: 'test', verifiedAt: '2026-11-19T12:00:00.000Z' },
  })
  const available = await readHalloweenWorks(halloweenTeaserIds, { store, environment: 'test', manifest: { works: entries.map(work => ({ ...asset, id: work.id })) } })
  assert.deepEqual(available, [entries[0]])
})
