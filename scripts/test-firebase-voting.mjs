// Explicit manual cloud transaction check; all writes stay in one private UUID scope.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { loadEnv } from 'vite'
import { getFirebaseServices } from '../netlify/lib/firebase-runtime.mjs'
import { mutateVoting, ingestSummary, readPublicVoting, exportVoting } from '../netlify/lib/voting-service.mjs'
Object.assign(process.env, loadEnv('development', process.cwd(), ''))
if (!process.argv.includes('--run') || !process.argv.includes(`--project=${process.env.FIREBASE_PROJECT_ID}`) || process.env.CONTEXT) throw new Error('請明確使用 --run --project=<Firebase project ID>，僅供本機驗證')
const { store, db } = await getFirebaseServices(), base = `voteValidationRuns/${randomUUID()}`
assert.match(base, /^voteValidationRuns\/[a-f0-9-]{36}$/)
const scoped = { get: path => store.get(`${base}/${path}`), list: path => store.list(`${base}/${path}`), transaction: callback => store.transaction(tx => callback({ get: path => tx.get(`${base}/${path}`), set: (path, value) => tx.set(`${base}/${path}`, value), delete: path => tx.delete(`${base}/${path}`) })) }
const id = 'isolated-voting', first = randomUUID(), second = randomUUID(), clock = new Date().toISOString()
const voting = { activityId: id, title: '隔離測試', voteStartsAt: new Date(Date.now() - 3600000).toISOString(), voteEndsAt: new Date(Date.now() + 3600000).toISOString(), maxChoices: 1, resultsVisibility: 'live', entries: [{ code: 'W001', workId: first, title: '作品甲' }, { code: 'W002', workId: second, title: '作品乙' }], formId: 'isolated12345678901234567890', questionItemId: '12345', formUrl: 'https://docs.google.com/forms/d/e/isolated12345678901234567890/viewform', controlUrl: 'https://script.google.com/macros/s/isolated12345678901234567890/exec' }
const command = (action, revision, draftRevision = 0, extra = {}) => ({ id, action, expectedRevision: revision, expectedDraftRevision: draftRevision, operationId: randomUUID(), ...(['save', 'activate'].includes(action) ? { voting } : {}), ...extra })
const summary = async revision => { const config = await scoped.get(`votingConfigs/${id}`); return { action: 'summary', activityId: id, jobId: randomUUID(), sourceRevision: revision, configRevision: config.revision, mappingVersion: config.mappingVersion, sourceGeneratedAt: new Date().toISOString(), countsByWorkId: { [first]: 1, [second]: 0 }, ballotCount: 1, selectionCount: 1, invalidCount: 0, excludedCount: 0, formId: voting.formId, formUrl: voting.formUrl, questionItemId: voting.questionItemId, acceptingResponses: Boolean(config.acceptanceDesired), schemaVerified: true } }
try {
  await db.doc(base).set({ createdAt: clock })
  await scoped.transaction(async tx => { tx.set(`activities/${id}`, { id, title: '隔離測試活動', status: 'published' }); tx.set(`publicWorks/${first}`, voting.entries[0]); tx.set(`publicWorks/${second}`, voting.entries[1]) })
  const save = command('save', 0); await mutateVoting(scoped, 'isolated-check', save); await mutateVoting(scoped, 'isolated-check', save)
  assert.deepEqual(await readPublicVoting(scoped, id), { voting: null })
  await mutateVoting(scoped, 'isolated-check', command('activate', 0, 1)); await ingestSummary(scoped, await summary(1))
  await mutateVoting(scoped, 'isolated-check', command('open', 1)); const vote = await summary(2); await ingestSummary(scoped, vote)
  assert.deepEqual(await ingestSummary(scoped, vote), { accepted: false, duplicate: true })
  assert.equal((await readPublicVoting(scoped, id)).voting.canVote, true)
  const updates = await Promise.allSettled([mutateVoting(scoped, 'isolated-check', command('visibility', 2, 0, { resultsVisibility: 'live' })), mutateVoting(scoped, 'isolated-check', command('visibility', 2, 0, { resultsVisibility: 'final' }))])
  assert.equal(updates.filter(item => item.status === 'fulfilled').length, 1)
  await mutateVoting(scoped, 'isolated-check', command('close', 3)); await ingestSummary(scoped, await summary(3))
  await mutateVoting(scoped, 'isolated-check', command('finalize', 4, 0, { expectedSourceRevision: 3, expectedFinalVersion: 0, reason: '隔離資料已確認，此次僅測試固定結算版本。' }))
  assert.equal((await scoped.get(`voteResults/${id}/versions/1`)).ballotCount, 1)
  assert.match(await exportVoting(scoped, id, 1), /"1","1"/)
  assert.match((await scoped.get(`votingConfigs/${id}`)).voteStartsAt, /Z$/)
  console.log('PASS real Firestore timestamps, draft privacy, activation, monotonic/idempotent summary, owner revisions, close, immutable result and CSV.')
} finally {
  await db.recursiveDelete(db.doc(base)); assert.equal((await db.doc(base).get()).exists, false); await db.terminate()
  console.log('Isolated voting check cleaned; public activity/work/voting data unchanged.')
}
