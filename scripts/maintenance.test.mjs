import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { buildEntry, preserveImages, commitImport } from './lib/import-transaction.cjs'
import { markGamePublished } from './lib/release-publication.cjs'
import { studentClasses, validateCatalog } from '../src/lib/catalog.js'
import { readStoredObject, writeStored } from '../src/lib/storage.js'
import { featuredActivity, getActivityReminder, getActivityPhase, getWorkUpdate, formatActivityDate } from '../src/contentUpdates.js'
import { createPlayCountHandler } from '../netlify/lib/play-count-handler.mjs'
import { createLeaderboardHandler, leaderboardKey, rankLeaderboard, scoreBounds, validateLeaderboardEvent } from '../netlify/lib/leaderboards.mjs'

const require = createRequire(import.meta.url)
const { createLeaderboardBridge } = require('./lib/leaderboard-bridge.cjs')

const id = '123e4567-e89b-42d3-a456-426614174000'
const author = { id, name: '作者', role: 'student', className: 'Scratch-116' }
const original = { id, creatorId: id, title: '原標題', description: '原說明', category: '創意', age: '8–12', tags: ['互動'], devices: ['mobile'], controls: '按一下', objective: '完成關卡', publishedAt: '2026-09-01T00:00:00Z', playUrl: `/games/${id}/index.html`, thumbnail: `/games/${id}/cover.webp`, thumbnailLayers: [{ src: `/games/${id}/overlay.webp` }] }

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gallery-import-test-'))
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }) })
  const gamesRoot = path.join(root, 'public', 'games')
  const gameDirectory = path.join(gamesRoot, id)
  const staging = path.join(root, 'staging')
  const manifestPath = path.join(root, 'public', 'games.json')
  await fs.mkdir(gameDirectory, { recursive: true })
  await fs.mkdir(staging)
  await fs.writeFile(path.join(gameDirectory, 'index.html'), 'old game')
  await fs.writeFile(path.join(gameDirectory, 'cover.webp'), 'old cover')
  await fs.writeFile(path.join(gameDirectory, 'overlay.webp'), 'old overlay')
  await fs.writeFile(path.join(staging, 'index.html'), 'new game')
  await fs.writeFile(manifestPath, JSON.stringify([original]))
  return { root, gamesRoot, gameDirectory, staging, manifestPath, backupRoot: root }
}

test('minimal replacement preserves metadata, publication date, cover and layers on disk', async t => {
  const f = await fixture(t)
  const entry = buildEntry({ existing: original, options: { title: '新標題' }, id, creatorId: id, baseName: 'v2' })
  assert.deepEqual(entry, { ...original, title: '新標題' })
  await preserveImages(original, id, path.join(f.root, 'public'), f.staging, false)
  await commitImport({ ...f, manifest: [entry] })
  assert.equal(await fs.readFile(path.join(f.gameDirectory, 'index.html'), 'utf8'), 'new game')
  assert.equal(await fs.readFile(path.join(f.gameDirectory, 'cover.webp'), 'utf8'), 'old cover')
  assert.equal(await fs.readFile(path.join(f.gameDirectory, 'overlay.webp'), 'utf8'), 'old overlay')
  assert.deepEqual(JSON.parse(await fs.readFile(f.manifestPath, 'utf8')), [entry])
  assert.equal((await fs.readdir(f.root)).some(name => name.startsWith('import-backup-')), false)
})

test('new and standalone entries retain distinct rules, explicit fields replace old values', () => {
  const entry = buildEntry({ options: { devices: 'desktop,mobile', controls: '空白鍵' }, id, creatorId: id, baseName: '新作', now: '2026-09-20T00:00:00Z' })
  assert.equal(entry.releasePending, true)
  assert.equal(entry.publishedAt, undefined)
  assert.deepEqual(entry.devices, ['desktop', 'mobile'])
  assert.equal(entry.controls, '空白鍵')
  const legacy = { ...original }; delete legacy.publishedAt
  assert.equal(buildEntry({ existing: legacy, options: {}, id, creatorId: id }).publishedAt, undefined)
  assert.equal(buildEntry({ options: {}, id: 'demo', standalone: true, baseName: '示範' }).creatorId, undefined)
  assert.deepEqual(buildEntry({ existing: original, options: { tags: '新標籤' }, id, creatorId: id }).tags, ['新標籤'])
  assert.deepEqual(buildEntry({ options: { leaderboard: true }, id, creatorId: id, baseName: '排行作品' }).leaderboard, { type: 'word-alchemy-v1' })
})

test('new work starts its 15-day window only when explicitly marked for release', () => {
  const games = [{ id, title: '待發布作品', releasePending: true }]
  const released = markGamePublished(games, id, '2026-09-21T00:00:00Z')
  assert.equal(released.releasePending, undefined)
  assert.equal(released.publishedAt, '2026-09-21T00:00:00Z')
  assert.equal(getWorkUpdate(released, Date.parse('2026-10-05T23:59:59Z'))?.kind, 'new')
  assert.equal(getWorkUpdate(released, Date.parse('2026-10-06T00:00:00Z')), null)
  assert.throws(() => markGamePublished(games, id, '2026-09-22T00:00:00Z'), /不是待發布/)
})

test('leaderboard ranks floor before score and keeps one best result per normalized player', () => {
  const ranked = rankLeaderboard([
    { player: '低樓高分', floor: 6, score: 4960, achievedAt: '2026-09-20T00:00:00Z' },
    { player: '高樓低分', floor: 7, score: 4440, achievedAt: '2026-09-20T00:00:01Z' },
    { player: '重複玩家', floor: 5, score: 3000, achievedAt: '2026-09-20T00:00:02Z' },
    { player: '重複玩家', floor: 5, score: 3200, achievedAt: '2026-09-20T00:00:03Z' },
  ])
  assert.deepEqual(ranked.map(entry => entry.player), ['高樓低分', '低樓高分', '重複玩家'])
  assert.equal(ranked[2].score, 3200)
  assert.deepEqual(scoreBounds(7), { minimum: 4440, maximum: 6780 })
})

test('leaderboard API validates scores, persists idempotently and returns shared top five', async () => {
  const values = new Map()
  const store = {
    async set(key, value) { values.set(key, value) },
    async get(key, options) { assert.equal(options.type, 'json'); return values.has(key) ? JSON.parse(values.get(key)) : null },
    async *list(options) {
      const blobs = [...values.keys()].filter(key => key.startsWith(options.prefix)).map(key => ({ key }))
      yield { blobs }
    },
  }
  const handler = createLeaderboardHandler(() => store, [id], () => '2026-09-20T00:00:00Z')
  const url = 'https://giraffegallery.com/.netlify/functions/word-alchemy-leaderboard'
  const post = body => handler(new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://giraffegallery.com' }, body: JSON.stringify(body) }))
  const event = { gameId: id, eventId: id, player: 'PlayerA', floor: 7, score: 4440 }
  assert.equal(validateLeaderboardEvent(event, new Set([id])).score, 4440)
  assert.equal(validateLeaderboardEvent({ ...event, score: 999999 }, new Set([id])), null)
  assert.equal((await post(event)).status, 201)
  assert.equal((await post(event)).status, 201)
  assert.equal(values.size, 1)
  const response = await handler(new Request(`${url}?gameId=${id}`))
  assert.deepEqual(await response.json(), { leaderboard: [{ player: 'PlayerA', floor: 7, score: 4440 }] })
  assert.doesNotMatch(leaderboardKey(id, 'PlayerA'), /PlayerA/i)
  assert.equal((await post({ ...event, player: 'https://example.com' })).status, 400)
  assert.equal((await handler(new Request(`${url}?gameId=unknown`))).status, 404)
})

test('packaged game bridge loads and submits through parent without direct network access', () => {
  const values = { '排行榜更新請求': 0, '排行榜送出請求': 0, 玩家: 'Player1', 樓層: 7, 分數: 4440 }
  const lists = {}
  const messages = []
  let tick
  const parent = { postMessage(message) { messages.push(message) } }
  let messageHandler
  const context = {
    crypto: { randomUUID: () => id },
    parent,
    scaffolding: {
      getVariable: name => values[name],
      setList(name, value) { lists[name] = value },
    },
    setInterval(callback, delay) { assert.equal(delay, 100); tick = callback },
    addEventListener(type, callback) { assert.equal(type, 'message'); messageHandler = callback },
  }
  vm.runInNewContext(createLeaderboardBridge(id), context)
  tick()
  assert.equal(messages.length, 0)
  values['排行榜更新請求'] = 1
  tick()
  assert.equal(messages[0].action, 'load')
  values['排行榜送出請求'] = 1
  tick()
  assert.deepEqual({ ...messages[1] }, { channel: 'scratch-gallery-leaderboard-v1', action: 'submit', gameId: id, eventId: id, player: 'Player1', floor: 7, score: 4440 })
  messageHandler({ source: parent, data: { channel: 'scratch-gallery-leaderboard-v1', action: 'result', gameId: id, leaderboard: [{ player: '甲', floor: 7, score: 4440 }] } })
  assert.deepEqual([...lists['排行玩家']], ['甲'])
  assert.deepEqual([...lists['排行樓層']], [7])
  assert.deepEqual([...lists['排行分數']], [4440])
  assert.doesNotMatch(createLeaderboardBridge(id), /\bfetch\s*\(/)
})

for (const failure of ['copy', 'manifest']) {
  test(`replacement rolls back old game and manifest after ${failure} failure`, async t => {
    const f = await fixture(t)
    let failed = false
    const io = { ...fs,
      async cp(from, to, options) {
        if (failure === 'copy' && from === f.staging && !failed) {
          failed = true
          await fs.mkdir(to)
          await fs.writeFile(path.join(to, 'partial.txt'), 'partial')
          throw new Error('injected copy failure')
        }
        return fs.cp(from, to, options)
      },
      async rename(from, to) {
        if (failure === 'manifest' && to === f.manifestPath) throw new Error('injected manifest failure')
        return fs.rename(from, to)
      },
    }
    await assert.rejects(commitImport({ ...f, manifest: [], io }), /injected/)
    assert.equal(await fs.readFile(path.join(f.gameDirectory, 'index.html'), 'utf8'), 'old game')
    assert.equal(await fs.readFile(path.join(f.gameDirectory, 'cover.webp'), 'utf8'), 'old cover')
    assert.equal(await fs.readFile(f.manifestPath, 'utf8'), JSON.stringify([original]))
    assert.equal((await fs.readdir(f.gameDirectory)).includes('partial.txt'), false)
  })
}

test('failed recovery retains a usable backup outside public', async t => {
  const f = await fixture(t)
  const io = { ...fs, async cp(from, to, options) {
    if (from === f.staging || from.includes('import-backup-')) throw new Error('injected')
    return fs.cp(from, to, options)
  } }
  await assert.rejects(commitImport({ ...f, manifest: [], io }), /請保留並還原/)
  const backup = (await fs.readdir(f.root)).find(name => name.startsWith('import-backup-'))
  assert.ok(backup)
  assert.equal(await fs.readFile(path.join(f.root, backup, 'game', 'index.html'), 'utf8'), 'old game')
  assert.equal(await fs.readFile(f.manifestPath, 'utf8'), JSON.stringify([original]))
})

test('catalog rejects inconsistent authors/devices and derives new student classes', () => {
  assert.deepEqual(studentClasses([author, { ...author, className: 'Scratch-117' }, { ...author, role: 'teacher', className: '老師' }]), ['全部', 'Scratch-116', 'Scratch-117'])
  assert.throws(() => validateCatalog([original], [author, author]), /UUID/)
  assert.throws(() => validateCatalog([original], [{ ...author, role: 'unknown' }]), /身分/)
  assert.throws(() => validateCatalog([{ ...original, devices: ['tv'] }], [author]), /裝置/)
})

test('storage helpers survive denial and malformed data', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('denied') } })
    assert.deepEqual(readStoredObject('x'), {})
    assert.equal(writeStored('x', '1'), false)
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => '[]' } })
    assert.deepEqual(readStoredObject('x'), {})
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else delete globalThis.localStorage
  }
})

test('activity and NEW boundaries use configured dates, independent of publication flag', () => {
  const activity = { ...featuredActivity, isPublished: true }
  const start = Date.parse(activity.startsAt), end = Date.parse(activity.endsAt)
  assert.equal(getActivityPhase(start - 1, activity), 'upcoming')
  assert.equal(getActivityPhase(start, activity), 'open')
  assert.equal(getActivityReminder(end - 86400000, activity).phase, 'closing')
  assert.equal(getActivityPhase(end + 1, activity), 'closed')
  assert.equal(getActivityReminder(end + 1, activity), null)
  assert.equal(getActivityReminder(start, { ...activity, isPublished: false }), null)
  assert.equal(getWorkUpdate({ publishedAt: new Date(start).toISOString() }, start + 15 * 86400000), null)
  assert.equal(formatActivityDate('2026-09-27T16:00:00Z'), '9/28')
})

test('count API streams pages, caches only public GET, preserves idempotent concurrent writes', async () => {
  const events = new Map()
  const listCalls = []
  const store = {
    async set(key, value) { events.set(key, value) },
    async *list(options) {
      listCalls.push(options)
      assert.equal(options.paginate, true)
      for (const key of events.keys()) if (!options.prefix || key.startsWith(options.prefix)) yield { blobs: [{ key }] }
    },
  }
  const handler = createPlayCountHandler(() => store, [id])
  const url = 'https://giraffegallery.com/.netlify/functions/play-counts'
  const post = eventId => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://giraffegallery.com' }, body: JSON.stringify({ gameId: id, eventId }) })
  const results = await Promise.all([handler(post(id)), handler(post('123e4567-e89b-42d3-a456-426614174001'))])
  for (const response of results) { assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store') }
  assert.equal((await (await handler(post(id))).json()).count, 2)
  const response = await handler(new Request(url))
  assert.deepEqual(await response.json(), { counts: { [id]: 2 } })
  assert.equal(response.headers.get('netlify-cdn-cache-control'), 'public, durable, max-age=60')
  const oversized = await handler(new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ' '.repeat(513) }))
  assert.equal(oversized.status, 413)
  assert.equal(oversized.headers.get('netlify-cdn-cache-control'), null)
  const rejected = await handler(new Request('https://preview.netlify.app/.netlify/functions/play-counts', { method: 'POST' }))
  assert.equal(rejected.status, 403)
  assert.equal(events.size, 2)
  assert.ok(listCalls.some(options => options.prefix === `${id}/`))
})

test('late cached GET cannot overwrite a successful play and blocked storage preserves cooldown', async () => {
  const keys = ['window', 'localStorage', 'fetch']
  const descriptors = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: 'giraffegallery.com' } } })
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('denied') } })
    let resolveGet, writes = 0
    const delayed = new Promise(resolve => { resolveGet = resolve })
    globalThis.fetch = async (_url, options) => {
      if (options.method === 'POST') { writes++; return Response.json({ count: 7 }) }
      return delayed
    }
    const { usePlayCounts } = await import('../src/composables/usePlayCounts.js?regression')
    const counts = usePlayCounts()
    const loading = counts.load()
    assert.equal(await counts.record(id), true)
    resolveGet(Response.json({ counts: { [id]: 6 } }))
    await loading
    assert.equal(counts.counts.value[id], 7)
    assert.equal(await counts.record(id), false)
    assert.equal(writes, 1)
  } finally {
    keys.forEach((key, index) => {
      if (descriptors[index]) Object.defineProperty(globalThis, key, descriptors[index])
      else delete globalThis[key]
    })
  }
})
