import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { createHmac, randomUUID } from 'node:crypto'
import { memoryStore } from './lib/test-memory-store.mjs'
import { validateVoting, safeCsv } from '../src/lib/votingSchema.js'
import { mutateVoting, readPublicVoting, ingestSummary, markSyncFailure, ingestFailure, exportVoting, listAdminVoting, sourceConfiguration } from '../netlify/lib/voting-service.mjs'
import { connectionReady, privateConnection } from '../netlify/lib/voting-setup.mjs'
import { signVoting, verifyVoting } from '../netlify/lib/voting-signature.mjs'
import { createVoteSyncHandler } from '../netlify/functions/vote-sync.mjs'
import { createVotingAdminHandler } from '../netlify/functions/voting-admin.mjs'
import { runSourceControl } from '../netlify/lib/voting-control.mjs'
import { votingKey } from '../netlify/lib/voting-signature.mjs'
const id = 'voting-test', first = '123e4567-e89b-42d3-a456-426614174000', second = '123e4567-e89b-42d3-a456-426614174001'
const time = '2026-10-08T03:00:00.000Z', now = () => time, entries = [{ code: 'W001', workId: first, title: '作品甲' }, { code: 'W002', workId: second, title: '作品乙' }]
const voting = { activityId: id, title: '測試投票', voteStartsAt: '2026-10-08T00:00:00.000Z', voteEndsAt: '2026-10-09T00:00:00.000Z', maxChoices: 1, resultsVisibility: 'live', entries, formId: 'form12345678901234567890', formUrl: 'https://docs.google.com/forms/d/e/public12345678901234567890/viewform', questionItemId: '12345678', controlUrl: 'https://script.google.com/macros/s/script12345678901234567890/exec' }
const command = (action, revision = 0, draftRevision = 0, extra = {}) => ({ id, action, expectedRevision: revision, expectedDraftRevision: draftRevision, operationId: randomUUID(), ...(['save', 'activate'].includes(action) ? { voting } : {}), ...extra })
function fixture() { return memoryStore({ [`activities/${id}`]: { id, status: 'published', title: '測試活動', submissionUrl: 'https://forms.gle/differentForm' }, [`publicWorks/${first}`]: entries[0], [`publicWorks/${second}`]: entries[1] }) }
async function active(store = fixture()) { await mutateVoting(store, 'owner', command('save'), now); await mutateVoting(store, 'owner', command('activate', 0, 1), now); return store }
async function summary(store, revision, extra = {}) {
  const config = await store.get(`votingConfigs/${id}`)
  return { action: 'summary', activityId: id, jobId: randomUUID(), sourceRevision: revision, configRevision: config.revision, mappingVersion: config.mappingVersion, sourceGeneratedAt: time, countsByWorkId: { [first]: 2, [second]: 1 }, ballotCount: 3, selectionCount: 3, invalidCount: 0, excludedCount: 0, formId: voting.formId, questionItemId: voting.questionItemId, formUrl: voting.formUrl, acceptingResponses: Boolean(config.acceptanceDesired), schemaVerified: true, ...extra }
}
test('draft privacy, exact saved activation, frozen mapping and optimistic/idempotent owner mutations', async () => {
  const store = fixture(), save = command('save')
  await mutateVoting(store, 'owner', save, now); assert.deepEqual(await readPublicVoting(store, id), { voting: null })
  assert.deepEqual(await mutateVoting(store, 'owner', save, now), { revision: 0, draftRevision: 1 })
  await assert.rejects(mutateVoting(store, 'owner', { ...save, voting: { ...voting, title: '其他' } }, now), /重試/)
  await assert.rejects(mutateVoting(store, 'owner', command('activate', 0, 1, { voting: { ...voting, title: '未儲存' } }), now), /先儲存/)
  await mutateVoting(store, 'owner', command('activate', 0, 1), now)
  await assert.rejects(mutateVoting(store, 'owner', command('save', 1), now), /已固定/)
  const outcomes = await Promise.allSettled([mutateVoting(store, 'owner', command('visibility', 1, 0, { resultsVisibility: 'final' }), now), mutateVoting(store, 'owner', command('visibility', 1, 0, { resultsVisibility: 'hidden' }), now)])
  assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1)
})
test('full snapshots reject invalid counts, unknown fields, wrong source and preserve newest version', async () => {
  const store = await active(), initial = await summary(store, 1)
  await ingestSummary(store, initial, now)
  assert.deepEqual(await ingestSummary(store, initial, now), { accepted: false, duplicate: true })
  for (const extra of [{ ballotCount: -1 }, { countsByWorkId: { [first]: 1 } }, { selectionCount: 2 }, { ballotCount: 1 }, { formId: 'other' }, { email: 'private' }, { mappingVersion: 'wrong' }, { configRevision: 0 }, { schemaVerified: false }, { sourceGeneratedAt: '2026-10-08T01:00:00Z' }]) await assert.rejects(ingestSummary(store, await summary(store, 2, extra), now))
  const newer = await summary(store, 3); await ingestSummary(store, newer, now)
  assert.deepEqual(await ingestSummary(store, await summary(store, 2), now), { accepted: false, stale: true })
  await assert.rejects(ingestSummary(store, await summary(store, 3, { ballotCount: 4, selectionCount: 4, countsByWorkId: { [first]: 3, [second]: 1 } }), now), /不同統計/)
  assert.equal((await store.get(`voteSummaries/${id}`)).sourceRevision, 3)
})
test('public results use explicit fields; visibility, hidden activity, deadlines, source failure are truthful', async () => {
  const store = await active(); await ingestSummary(store, await summary(store, 1), now)
  await mutateVoting(store, 'owner', command('open', 1), now)
  assert.equal((await readPublicVoting(store, id, Date.parse(time))).voting.canVote, false)
  await ingestSummary(store, await summary(store, 2), now)
  let result = (await readPublicVoting(store, id, Date.parse(time))).voting
  assert.equal(result.canVote, true); assert.equal(result.ballotCount, 3)
  assert.doesNotMatch(JSON.stringify(result), /formId|questionItemId|owner|invalidCount|mappingVersion|controlUrl|sourceRevision/)
  assert.equal((await readPublicVoting(store, id, Date.parse(voting.voteEndsAt))).voting.canVote, false)
  await markSyncFailure(store, id, 2, randomUUID(), now)
  result = (await readPublicVoting(store, id, Date.parse(time))).voting
  assert.equal(result.canVote, false); assert.equal(result.ballotCount, 3); assert.equal(result.syncStatus, 'stale')
  await mutateVoting(store, 'owner', command('visibility', 2, 0, { resultsVisibility: 'hidden' }), now)
  result = (await readPublicVoting(store, id, Date.parse(time))).voting
  assert.equal(result.ballotCount, null); assert.equal('count' in result.entries[0], false)
  store.data.get(`activities/${id}`).status = 'archived'; assert.deepEqual(await readPublicVoting(store, id), { voting: null })
})
test('closed and fresh recount required for immutable finals; later sync cannot overwrite, correction adds version', async () => {
  const store = await active(); await ingestSummary(store, await summary(store, 1), now)
  await assert.rejects(mutateVoting(store, 'owner', command('finalize', 1, 0, { expectedSourceRevision: 1, expectedFinalVersion: 0, reason: '已核對全部選票，同票依活動規則處理。' }), now), /關閉收票/)
  await mutateVoting(store, 'owner', command('close', 1), now); await ingestSummary(store, await summary(store, 2), now)
  const finalize = command('finalize', 2, 0, { expectedSourceRevision: 2, expectedFinalVersion: 0, reason: '已核對全部選票，同票依活動規則處理。' })
  await mutateVoting(store, 'owner', finalize, now); await mutateVoting(store, 'owner', finalize, now)
  const original = await store.get(`voteResults/${id}/versions/1`)
  await ingestSummary(store, await summary(store, 3, { countsByWorkId: { [first]: 4, [second]: 1 }, ballotCount: 5, selectionCount: 5 }), now)
  assert.equal((await readPublicVoting(store, id, Date.parse(time))).voting.ballotCount, 3)
  await mutateVoting(store, 'owner', command('correct', 3, 0, { expectedSourceRevision: 3, expectedFinalVersion: 1, reason: '重新核對來源後補齊同步遺漏，保留原版本。' }), now)
  assert.deepEqual(await store.get(`voteResults/${id}/versions/1`), original)
  assert.equal((await readPublicVoting(store, id, Date.parse(time))).voting.resultVersion, 2)
  const csv1 = await exportVoting(store, id, 1), csv2 = await exportVoting(store, id, 2)
  assert.match(csv1, /"3","3"/); assert.match(csv2, /"5","5"/)
  assert.doesNotMatch(csv1, /owner|confirmedBy/)
})
test('HMAC authenticates exact body, timestamp and purpose; Apps Script interoperates with Node', async () => {
  const key = 'a'.repeat(64), payload = { activityId: id, test: '繁體中文' }, envelope = signVoting(payload, key, 'sync')
  assert.deepEqual(verifyVoting(envelope, key, 'sync'), payload)
  for (const [value, secret, purpose] of [[{ ...envelope, payload: envelope.payload + ' ' }, key, 'sync'], [envelope, 'b'.repeat(64), 'sync'], [envelope, key, 'control'], [{ ...envelope, timestamp: 0 }, key, 'sync']]) assert.throws(() => verifyVoting(value, secret, purpose))
  const context = vm.createContext({ Utilities: { Charset: { UTF_8: 'utf8' }, computeHmacSha256Signature: (body, secret) => [...createHmac('sha256', secret).update(body).digest()] } })
  vm.runInContext(await readFile('integrations/google-voting/Code.gs', 'utf8'), context)
  assert.deepEqual(JSON.parse(JSON.stringify(context.verify_(envelope, key, 'sync'))), payload)
  assert.deepEqual(verifyVoting(context.sign_(payload, key, 'sync-reply'), key, 'sync-reply'), payload)
})
test('Apps Script recount handles single/multiple choices, duplicate IDs, exact labels and response-time deadline', async () => {
  const context = vm.createContext({}); vm.runInContext(await readFile('integrations/google-voting/Code.gs', 'utf8'), context)
  const ballot = (responseId, answer, timestamp = time) => ({ id: responseId, answer, timestamp })
  let value = context.recount_([ballot('a', 'W001｜作品甲'), ballot('b', 'W002｜作品乙'), ballot('a', 'W001｜作品甲'), ballot('c', 'W001｜改過名稱'), ballot('d', ['W001｜作品甲', 'W002｜作品乙']), ballot('e', 'W001｜作品甲', voting.voteEndsAt)], voting)
  assert.equal(value.ballotCount, 2); assert.equal(value.invalidCount, 3); assert.equal(value.excludedCount, 1)
  value = context.recount_([ballot('a', ['W001｜作品甲', 'W002｜作品乙']), ballot('b', ['W001｜作品甲', 'W001｜作品甲'])], { ...voting, maxChoices: 2 })
  assert.equal(value.ballotCount, 1); assert.equal(value.selectionCount, 2); assert.equal(value.invalidCount, 1)
  assert.equal(JSON.stringify(value).includes('timestamp'), false)
})
test('sync API rejects forged input before accessing Firebase; returns signed private config and accepts only summary', async () => {
  const store = await active(), key = 'a'.repeat(64); let reads = 0
  const handler = createVoteSyncHandler({ services: async () => { reads++; return { store } }, keyFor: () => key, purge: async () => {} })
  const request = value => new Request('https://gallery.example/api/vote-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
  const forged = signVoting({ action: 'configuration', activityId: id }, 'b'.repeat(64), 'sync')
  assert.equal((await handler(request(forged))).status, 401); assert.equal(reads, 0)
  const response = await handler(request(signVoting({ action: 'configuration', activityId: id }, key, 'sync')))
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const value = verifyVoting(await response.json(), key, 'sync-reply'); assert.equal(value.configuration.formId, voting.formId)
  const invalid = await handler(request(signVoting({ activityId: id, action: 'unknown' }, key, 'sync'))); assert.equal(invalid.status, 400)
})
test('admin API requires owner, same origin, correct endpoint and bounded input', async () => {
  const previous = process.env.ACTIVITY_DATA_MODE; process.env.ACTIVITY_DATA_MODE = 'firebase'
  try {
    const store = fixture(), denied = createVotingAdminHandler({ services: async () => ({ store }) })
    assert.equal((await denied(new Request('https://gallery.example/api/admin/voting'))).status, 401)
    const handler = createVotingAdminHandler({ services: async () => ({ store }), owner: async () => 'owner', purge: async () => {} })
    const post = (body, origin = 'https://gallery.example') => new Request('https://gallery.example/api/admin/vote-mutate', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    assert.equal((await handler(post(command('save'), 'https://evil.example'))).status, 403)
    assert.equal((await handler(post({ text: 'x'.repeat(65000) }))).status, 413)
    assert.equal((await handler(post(command('save')))).status, 200)
    assert.equal((await listAdminVoting(store)).activities[0].draft.title, voting.title)
  } finally { previous === undefined ? delete process.env.ACTIVITY_DATA_MODE : process.env.ACTIVITY_DATA_MODE = previous }
})
test('control follows only the Google content GET redirect, signed replies and closes entry on failure', async () => {
  const previous = process.env.VOTING_CONTROL_SECRET; process.env.VOTING_CONTROL_SECRET = 'a'.repeat(64)
  try {
    const store = await active(), current = store.data.get(`votingConfigs/${id}`), jobId = randomUUID(), calls = []
    const config = { ...current, voteStartsAt: new Date(Date.now() - 3600000).toISOString(), voteEndsAt: new Date(Date.now() + 3600000).toISOString() }; store.data.set(`votingConfigs/${id}`, config)
    const key = votingKey(id, 'control'), value = await summary(store, 1, { jobId, sourceGeneratedAt: new Date().toISOString() })
    const fetcher = async (url, options) => { calls.push({ url, ...options }); return calls.length === 1 ? new Response(null, { status: 302, headers: { Location: 'https://script.googleusercontent.com/macros/echo?user_content_key=opaque' } }) : Response.json(signVoting(value, key, 'control-reply')) }
    assert.equal(await runSourceControl(store, id, 1, jobId, fetcher), 'confirmed')
    assert.equal(calls[1].method, 'GET'); assert.equal(calls[1].body, undefined)
    assert.equal(await runSourceControl(store, id, 1, randomUUID(), async () => new Response(null, { status: 302, headers: { Location: 'https://evil.example/' } })), 'failed')
    assert.equal((await store.get(`voteSummaries/${id}`)).ballotCount, 3)
  } finally { previous === undefined ? delete process.env.VOTING_CONTROL_SECRET : process.env.VOTING_CONTROL_SECRET = previous }
})
test('schema rejects unknown/time/URL/count/duplicate mutations; CSV escapes spreadsheet formulas', () => {
  assert.equal(validateVoting(voting).entries.length, 2)
  for (const extra of [{ maxChoices: 6 }, { owner: 'fake' }, { controlUrl: 'https://evil.example/' }, { formUrl: 'javascript:alert(1)' }, { voteEndsAt: voting.voteStartsAt }, { entries: [entries[0], entries[0]] }]) assert.throws(() => validateVoting({ ...voting, ...extra }))
  assert.match(safeCsv([['=HYPERLINK("bad")', '+1', '@x', '-1']]), /"'=HYPERLINK/)
})
test('unbound list drafts can be saved before Google exists; activation still requires a real binding', async () => {
  const store = fixture(), unbound = { ...voting, formId: '', formUrl: '', questionItemId: '', controlUrl: '' }
  await mutateVoting(store, 'owner', command('save', 0, 0, { voting: unbound }), now)
  assert.equal((await store.get(`votingDrafts/${id}`)).entries.length, 2)
  assert.deepEqual(await readPublicVoting(store, id), { voting: null })
  await assert.rejects(mutateVoting(store, 'owner', command('activate', 0, 1, { voting: unbound }), now), /表單編輯 ID/)
})
test('private connection is purpose/activity-scoped, never automatic HTML data, and same-origin owner protected', async () => {
  const previousSync = process.env.VOTING_SYNC_SECRET, previousControl = process.env.VOTING_CONTROL_SECRET, previousMode = process.env.ACTIVITY_DATA_MODE
  process.env.VOTING_SYNC_SECRET = 'a'.repeat(64); process.env.VOTING_CONTROL_SECRET = 'b'.repeat(64); process.env.ACTIVITY_DATA_MODE = 'firebase'
  try {
    const store = fixture(), value = await privateConnection(store, { id }, 'http://127.0.0.1:3000/api/admin/vote-connection')
    assert.equal(connectionReady(), true); assert.equal(value.SYNC_URL, ''); assert.notEqual(value.SYNC_KEY, value.CONTROL_KEY)
    assert.notEqual(value.SYNC_KEY, process.env.VOTING_SYNC_SECRET)
    const handler = createVotingAdminHandler({ services: async () => ({ store }), owner: async () => 'owner' })
    const list = await (await handler(new Request('https://gallery.example/api/admin/voting'))).text()
    assert.doesNotMatch(list, new RegExp(value.SYNC_KEY)); assert.doesNotMatch(list, /VOTING_SYNC_SECRET|SYNC_KEY/)
    const post = origin => new Request('https://gallery.example/api/admin/vote-connection', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    assert.equal((await handler(post('https://evil.example'))).status, 403)
    const response = await handler(post('https://gallery.example')); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal((await response.json()).SYNC_KEY, value.SYNC_KEY)
    const template = await handler(new Request('https://gallery.example/api/admin/vote-template?file=script')); assert.match(await template.text(), /function syncVoting\(/)
    assert.equal((await handler(new Request('https://gallery.example/api/admin/vote-template?file=../secret'))).status, 404)
    assert.equal((await createVotingAdminHandler({ services: async () => ({ store }) })(post('https://gallery.example'))).status, 401)
    await assert.rejects(privateConnection(store, { id: undefined }, 'https://gallery.example'), /代號/)
  } finally {
    for (const [name, value] of [['VOTING_SYNC_SECRET', previousSync], ['VOTING_CONTROL_SECRET', previousControl], ['ACTIVITY_DATA_MODE', previousMode]]) value === undefined ? delete process.env[name] : process.env[name] = value
  }
})
test('signed source failure preserves counts and repair control URL preserves frozen mapping and results', async () => {
  const store = await active(); await ingestSummary(store, await summary(store, 1), now)
  const config = await store.get(`votingConfigs/${id}`)
  await ingestFailure(store, { action: 'failure', activityId: id, jobId: randomUUID(), configRevision: 1, mappingVersion: config.mappingVersion, sourceRevision: 3, sourceGeneratedAt: time }, now)
  assert.equal((await store.get(`voteSummaries/${id}`)).ballotCount, 3)
  assert.deepEqual(await ingestSummary(store, await summary(store, 2), now), { accepted: false, stale: true })
  await ingestSummary(store, await summary(store, 4), now)
  await ingestFailure(store, { action: 'failure', activityId: id, jobId: randomUUID(), configRevision: 1, mappingVersion: config.mappingVersion, sourceRevision: 3, sourceGeneratedAt: time }, now)
  assert.equal((await store.get(`voteSummaries/${id}`)).syncStatus, 'ok')
  await mutateVoting(store, 'owner', command('connection', 1, 0, { controlUrl: 'https://script.google.com/macros/s/repaired12345678901234567890/exec' }), now)
  assert.equal((await store.get(`votingConfigs/${id}`)).mappingVersion, config.mappingVersion)
  assert.equal((await store.get(`voteSources/${id}`)).schemaVerified, false)
  assert.equal((await store.get(`voteSources/${id}`)).confirmedRevision, 0)
  await assert.rejects(ingestFailure(store, { action: 'failure', activityId: id, jobId: randomUUID(), configRevision: 1, mappingVersion: config.mappingVersion, sourceRevision: 5, sourceGeneratedAt: time }, now), /過期/)
})
test('Script control retries reuse snapshots; stale commands rejected and unsafe forms still stop accepting', async () => {
  const store = await active(), config = sourceConfiguration(await store.get(`votingConfigs/${id}`), await store.get(`voteSources/${id}`)), values = new Map([['ACTIVITY_ID', id], ['FORM_ID', voting.formId], ['CONTROL_KEY', 'a'.repeat(64)]]), state = { accepting: true, unsafe: false }, key = 'a'.repeat(64)
  const question = { getId: () => Number(voting.questionItemId), getType: () => 'single', asMultipleChoiceItem() { return this }, isRequired: () => true, hasOtherOption: () => false, getChoices: () => entries.map(entry => ({ getValue: () => `${entry.code}｜${entry.title}` })) }
  const form = { hasLimitOneResponsePerUser: () => true, collectsEmail: () => state.unsafe, canEditResponse: () => false, isPublishingSummary: () => false, isQuiz: () => false, getPublishedUrl: () => voting.formUrl, getItems: () => [question], setAcceptingResponses: accepting => { state.accepting = accepting }, isAcceptingResponses: () => state.accepting, supportsAdvancedResponderPermissions: () => true, getResponses: () => [] }
  const context = vm.createContext({ console: { error() {} }, PropertiesService: { getScriptProperties: () => ({ getProperty: name => values.get(name) ?? null, setProperty: (name, value) => values.set(name, value), setProperties: object => { for (const [name, value] of Object.entries(object)) values.set(name, value) } }) }, Utilities: { Charset: { UTF_8: 'utf8' }, computeHmacSha256Signature: (body, secret) => [...createHmac('sha256', secret).update(body).digest()] }, LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) }, FormApp: { openById: () => form, ItemType: { MULTIPLE_CHOICE: 'single' } }, ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => text }) } })
  vm.runInContext(await readFile('integrations/google-voting/Code.gs', 'utf8'), context)
  const jobId = randomUUID(), body = { action: 'reconcile', activityId: id, jobId, configuration: config }, event = value => ({ postData: { contents: JSON.stringify(signVoting(value, key, 'control')) } })
  const firstReply = verifyVoting(JSON.parse(context.doPost(event(body))), key, 'control-reply')
  assert.equal(firstReply.acceptingResponses, false)
  assert.equal(verifyVoting(JSON.parse(context.doPost(event(body))), key, 'control-reply').sourceRevision, firstReply.sourceRevision)
  assert.equal(values.get('SOURCE_REVISION'), '1')
  state.unsafe = true; state.accepting = true
  const unsafe = JSON.parse(context.doPost(event({ ...body, jobId: randomUUID(), configuration: { ...config, revision: 2 } })))
  assert.equal(unsafe.error, 'Voting source unavailable'); assert.equal(state.accepting, false)
  assert.equal(JSON.parse(context.doPost(event(body))).error, 'Voting source unavailable')
})
