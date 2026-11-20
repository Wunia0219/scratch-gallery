import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { loadEnv } from 'vite'
import games from '../public/games.json' with { type: 'json' }
import creators from '../public/creators.json' with { type: 'json' }
import { getFirebaseServices } from '../netlify/lib/firebase-runtime.mjs'
import { buildAssetManifest } from './lib/game-assets.mjs'
import { readPublishedWork, listPublishedWorks, mutateWork, listWorkHistory } from '../netlify/lib/work-service.mjs'
import { editableWork } from '../src/lib/workSchema.js'
Object.assign(process.env, loadEnv('development', process.cwd(), ''))
if (!process.argv.includes('--run') || !process.argv.includes(`--project=${process.env.FIREBASE_PROJECT_ID}`)) throw new Error('雲端驗證需明確使用 --run --project=<Firebase project ID>')
const { store, db } = await getFirebaseServices(), manifest = await buildAssetManifest()
const oldWorks = await store.list('works')
assert.equal(oldWorks.length, games.length)
for (const game of games) {
  const work = await readPublishedWork(store, manifest, 'local', game.id), creator = creators.find(creator => creator.id === game.creatorId)
  for (const key of ['title', 'description', 'creatorId', 'category', 'playUrl', 'thumbnail']) assert.equal(work[key], game[key], key)
  assert.equal(work.student, creator.name); assert.equal(work.creatorType, creator.role)
  assert.equal(work.publishedAt, game.publishedAt ?? null)
}
const firstPage = await listPublishedWorks(store, manifest, 'local', { role: 'student' })
assert.equal(firstPage.items.length, 9)
const base = `catalogValidationRuns/${randomUUID()}`
assert.match(base, /^catalogValidationRuns\/[a-f0-9-]{36}$/)
const scoped = {
  get: path => store.get(`${base}/${path}`), list: path => store.list(`${base}/${path}`), query: (path, options) => store.query(`${base}/${path}`, options),
  transaction: callback => store.transaction(tx => callback({ get: path => tx.get(`${base}/${path}`), set: (path, value) => tx.set(`${base}/${path}`, value), delete: path => tx.delete(`${base}/${path}`) })),
}
const game = games[0], creator = creators.find(creator => creator.id === game.creatorId), content = editableWork({ ...game, sortOrder: 0 })
const command = (action, revision, draftRevision, extra = {}) => ({ id: game.id, action, expectedRevision: revision, expectedDraftRevision: draftRevision, operationId: randomUUID(), ...(['save', 'publish'].includes(action) ? { work: content } : {}), ...extra })
try {
  await scoped.transaction(async tx => {
    tx.set('siteSettings/public', { revision: 1, contentVersions: {} }); tx.set('siteSettings/catalog', { revision: 1, counts: { student: 0, teacher: 0 }, classCounts: {} })
    tx.set(`creators/${creator.id}`, creator); tx.set(`works/${game.id}`, { ...content, revision: 1, status: 'draft', hasPublished: false, publishedAt: null })
    tx.set(`workAssets/${game.id}`, { id: game.id, assetVersion: manifest.works[0].assetVersion, environment: 'test', verifiedAt: new Date().toISOString() })
  })
  await mutateWork(scoped, 'isolated-validation', command('save', 1, 0), manifest, 'test')
  await assert.rejects(readPublishedWork(scoped, manifest, 'test', game.id), error => error.status === 404)
  const publish = command('publish', 1, 1)
  const result = await mutateWork(scoped, 'isolated-validation', publish, manifest, 'test')
  assert.deepEqual(await mutateWork(scoped, 'isolated-validation', publish, manifest, 'test'), result)
  assert.equal((await listPublishedWorks(scoped, manifest, 'test', { role: 'student' })).items.length, 1)
  const pending = await Promise.allSettled([mutateWork(scoped, 'isolated-validation', command('save', 2, 0), manifest, 'test'), mutateWork(scoped, 'isolated-validation', command('save', 2, 0), manifest, 'test')])
  assert.equal(pending.filter(item => item.status === 'fulfilled').length, 1)
  await mutateWork(scoped, 'isolated-validation', command('hide', 2, 1), manifest, 'test')
  await assert.rejects(readPublishedWork(scoped, manifest, 'test', game.id), error => error.status === 404)
  await mutateWork(scoped, 'isolated-validation', command('restore', 3, 0, { historyRevision: 2 }), manifest, 'test')
  await mutateWork(scoped, 'isolated-validation', command('publish', 3, 1), manifest, 'test')
  assert.equal((await scoped.get(`works/${game.id}`)).publishedAt, result.publishedAt)
  assert.equal((await listWorkHistory(scoped, game.id)).length, 3)
  console.log('PASS all 15 migrated works, real Firestore cursor, Timestamp, publish retry, concurrent revisions, hide and restore.')
} finally { await db.recursiveDelete(db.doc(base)); assert.equal((await scoped.list('works')).length, 0); console.log('Isolated cloud validation data cleaned; real work content unchanged.') }
