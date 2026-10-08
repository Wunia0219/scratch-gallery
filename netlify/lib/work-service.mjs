import { createHash } from 'node:crypto'
import { ActivityError, OPERATION_ID } from '../../src/lib/activitySchema.js'
import { WORK_ID, editableWork, validateWork, publicWork } from '../../src/lib/workSchema.js'
const publicPath = id => `publicWorks/${id}`
export const assetFor = (manifest, id) => manifest.works.find(asset => asset.id === id)
export function assetsReady(record, asset, environment) { return Boolean(asset && record?.assetVersion === asset.assetVersion && record?.environment === environment && record?.verifiedAt) }
export async function listAdminWorks(store, manifest, environment) {
  const [works, drafts, creators, deployments] = await Promise.all([store.list('works'), store.list('workDrafts'), store.list('creators'), store.list('workAssets')])
  return { works: works.map(work => ({ ...work, draft: drafts.find(draft => draft.id === work.id) ?? null, assetsReady: assetsReady(deployments.find(asset => asset.id === work.id), assetFor(manifest, work.id), !work.hasPublished && environment === 'local' ? 'production' : environment), asset: assetFor(manifest, work.id) ? (({ resources, ...asset }) => asset)(assetFor(manifest, work.id)) : null })), creators }
}
export async function mutateWork(store, actorUid, input, manifest, environment, now = () => new Date().toISOString()) {
  if (!input || Object.keys(input).some(key => !['id', 'action', 'operationId', 'expectedRevision', 'expectedDraftRevision', 'work', 'historyRevision'].includes(key)) || !WORK_ID.test(input.id) || !OPERATION_ID.test(input.operationId) || !['save', 'publish', 'hide', 'restore'].includes(input.action) || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0 || !Number.isInteger(input.expectedDraftRevision) || input.expectedDraftRevision < 0) throw new ActivityError('作品操作格式不正確')
  if (input.action === 'restore' && (!Number.isInteger(input.historyRevision) || input.historyRevision < 1)) throw new ActivityError('還原版本不正確')
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex')
  const operationPath = `auditLogs/work-${actorUid}-${input.operationId}`
  return store.transaction(async tx => {
    const [receipt, current, draft, deployment, settings, stats, history] = await Promise.all([
      tx.get(operationPath), tx.get(`works/${input.id}`), tx.get(`workDrafts/${input.id}`), tx.get(`workAssets/${input.id}`), tx.get('siteSettings/public'), tx.get('siteSettings/catalog'),
      input.action === 'restore' ? tx.get(`workRevisions/${input.id}/entries/${String(input.historyRevision).padStart(8, '0')}`) : null,
    ])
    if (receipt) { if (receipt.fingerprint !== fingerprint) throw new ActivityError('重試識別碼已用於其他操作', 409); return receipt.result }
    if (!current || !settings || !stats) throw new ActivityError('作品尚未匯入，請先完成資源登錄', 404)
    if (current.revision !== input.expectedRevision || (draft?.revision ?? 0) !== input.expectedDraftRevision) throw new ActivityError('其他分頁已修改此作品，請重新載入', 409)
    const asset = assetFor(manifest, input.id)
    const candidateInput = input.action === 'restore' ? history?.content : input.action === 'hide' ? editableWork(current) : input.work
    const creator = candidateInput?.creatorId ? await tx.get(`creators/${candidateInput.creatorId}`) : null
    const previousCreator = current.creatorId === candidateInput?.creatorId ? creator : await tx.get(`creators/${current.creatorId}`)
    const candidate = input.action === 'hide' ? null : validateWork(candidateInput, asset, creator)
    const timestamp = now(), revision = current.revision
    let result
    if (['save', 'restore'].includes(input.action)) {
      const next = { ...candidate, baseRevision: revision, revision: (draft?.revision ?? 0) + 1, updatedAt: timestamp, updatedBy: actorUid }
      tx.set(`workDrafts/${input.id}`, next)
      result = { revision, draftRevision: next.revision, action: input.action }
    } else {
      const requiredEnvironment = !current.hasPublished && environment === 'local' ? 'production' : environment
      if (input.action === 'publish' && (!assetsReady(deployment, asset, requiredEnvironment) || !draft || draft.baseRevision !== revision || JSON.stringify(validateWork(editableWork(draft), asset, creator)) !== JSON.stringify(candidate))) throw new ActivityError('請先確認正式檔案已部署，並儲存目前草稿', 409)
      const next = { ...current, ...(candidate ?? {}), status: input.action === 'hide' ? 'unlisted' : 'published', revision: revision + 1, publishedAt: current.hasPublished || input.action === 'hide' ? current.publishedAt ?? null : timestamp, hasPublished: current.hasPublished || input.action === 'publish', updatedAt: timestamp, updatedBy: actorUid }
      tx.set(`workRevisions/${input.id}/entries/${String(revision).padStart(8, '0')}`, { revision, content: editableWork(current), status: current.status, publishedAt: current.publishedAt ?? null, createdAt: timestamp, actorUid })
      tx.set(`works/${input.id}`, next); tx.delete(`workDrafts/${input.id}`)
      if (next.status === 'published') tx.set(publicPath(input.id), publicWork(next, asset, creator)); else tx.delete(publicPath(input.id))
      const counts = { ...stats.counts }, classCounts = { ...stats.classCounts }
      if (current.status === 'published') { counts[previousCreator.role]--; if (previousCreator.role === 'student') classCounts[previousCreator.className] = Math.max(0, (classCounts[previousCreator.className] || 0) - 1) }
      if (next.status === 'published') { counts[creator.role]++; if (creator.role === 'student') classCounts[creator.className] = (classCounts[creator.className] || 0) + 1 }
      tx.set('siteSettings/catalog', { ...stats, counts, classCounts, revision: stats.revision + 1, updatedAt: timestamp })
      tx.set('siteSettings/public', { ...settings, revision: (settings.revision ?? 0) + 1, catalogRevision: stats.revision + 1, contentVersions: { ...settings.contentVersions, ...(input.action === 'publish' && !current.hasPublished ? { [creator.role === 'teacher' ? 'teachers' : 'students']: timestamp } : {}) }, updatedAt: timestamp })
      result = { revision: next.revision, draftRevision: 0, action: input.action, publishedAt: next.publishedAt }
    }
    tx.set(operationPath, { fingerprint, result, actorUid, action: `work-${input.action}`, targetId: input.id, createdAt: timestamp })
    return result
  })
}
export async function listWorkHistory(store, id) {
  if (!WORK_ID.test(id)) throw new ActivityError('作品代號不正確')
  return store.query(`workRevisions/${id}/entries`, { orderBy: 'revision', direction: 'desc', limit: 10 })
}
export async function readPublishedWork(store, manifest, environment, id) {
  if (!WORK_ID.test(id)) throw new ActivityError('作品不存在', 404)
  const [work, deployment] = await Promise.all([store.get(publicPath(id)), store.get(`workAssets/${id}`)])
  if (!work || !assetsReady(deployment, assetFor(manifest, id), environment) || work.assetVersion !== assetFor(manifest, id)?.assetVersion) throw new ActivityError('作品不存在或已下架', 404)
  return work
}
export async function listPublishedWorks(store, manifest, environment, filters = {}) {
  const { role = 'student', q = '', className = '', device = 'all', cursor = '' } = filters
  if (!['student', 'teacher'].includes(role) || typeof q !== 'string' || q.length > 120 || typeof className !== 'string' || className.length > 100 || !['all', 'desktop', 'mobile'].includes(device) || cursor.length > 2000) throw new ActivityError('搜尋條件不正確')
  const stats = await store.get('siteSettings/catalog')
  if (!stats) throw new ActivityError('作品資料尚未初始化', 503)
  const signature = createHash('sha256').update(JSON.stringify([role, q, className, device])).digest('hex').slice(0, 16)
  let after
  if (cursor) {
    let parsed
    try { parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()) } catch { throw new ActivityError('分頁識別碼不正確') }
    if (parsed.signature !== signature || typeof parsed.after !== 'string' || !parsed.after.startsWith(`${role}:`) || parsed.after.length > 160) throw new ActivityError('分頁識別碼不正確')
    if (parsed.revision !== stats.revision) throw new ActivityError('作品已更新，請重新載入列表', 409)
    after = parsed.after
  }
  const needle = q.trim().toLocaleLowerCase('zh-Hant'), items = []
  let scanned = 0, hasMore = true
  // Firestore has no substring search. Bound scans to 120 documents per request;
  // an empty page may still have a cursor, so clients can continue explicitly.
  while (items.length < 9 && scanned < 120 && hasMore) {
    const batch = await store.query('publicWorks', { orderBy: 'sortKey', startAt: `${role}:`, endBefore: `${role};`, after, limit: Math.min(12, 120 - scanned) })
    if (!batch.length) { hasMore = false; break }
    for (const work of batch) {
      after = work.sortKey; scanned++
      if ((!className || className === work.className) && (device === 'all' || work.devices.includes(device)) && (!needle || [work.title, work.description, work.category, work.student, work.className, ...work.tags].join(' ').toLocaleLowerCase('zh-Hant').includes(needle))) {
        const asset = assetFor(manifest, work.id)
        if (work.assetVersion !== asset?.assetVersion || !assetsReady(await store.get(`workAssets/${work.id}`), asset, environment)) throw new ActivityError('作品資源正在確認，請稍後重試', 503)
        items.push(work)
      }
      if (items.length === 9) break
    }
    if (batch.length < 12 && items.length < 9) hasMore = false
  }
  return { items, cursor: hasMore ? Buffer.from(JSON.stringify({ after, signature, revision: stats.revision })).toString('base64url') : null, revision: stats.revision, total: !needle && !className && device === 'all' ? stats.counts[role] : null, classes: ['全部', ...Object.keys(stats.classCounts).filter(key => stats.classCounts[key] > 0).sort()], mode: 'firebase' }
}
