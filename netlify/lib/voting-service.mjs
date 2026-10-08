import { createHash } from 'node:crypto'
import { ActivityError, ACTIVITY_ID, OPERATION_ID } from '../../src/lib/activitySchema.js'
import { editableVoting, exactKeys, validateVoting, votingDate, votingPhase, safeCsv, googleScriptUrl } from '../../src/lib/votingSchema.js'

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const privateFields = ['formId', 'questionItemId', 'controlUrl']
const sourceOf = candidate => Object.fromEntries(privateFields.map(key => [key, candidate[key]]))
const configOf = candidate => Object.fromEntries(Object.entries(candidate).filter(([key]) => !privateFields.includes(key)))
const mappingOf = candidate => hash({ ...candidate, resultsVisibility: undefined, controlUrl: undefined })
const idCheck = id => { if (typeof id !== 'string' || !ACTIVITY_ID.test(id)) throw new ActivityError('投票活動代號不正確') }
export function sourceConfiguration(config, source) {
  return { ...editableVoting({ ...config, ...source }), revision: config.revision, mappingVersion: config.mappingVersion, acceptanceDesired: Boolean(config.acceptanceDesired && !config.finalVersion), finalVersion: config.finalVersion || 0 }
}
export async function listAdminVoting(store) {
  const [activities, activityDrafts, configs, drafts, sources, summaries, works] = await Promise.all(['activities', 'activityDrafts', 'votingConfigs', 'votingDrafts', 'voteSources', 'voteSummaries', 'publicWorks'].map(path => store.list(path)))
  const ids = [...new Set([...activities, ...activityDrafts, ...configs, ...drafts].map(item => item.id))]
  return { activities: await Promise.all(ids.map(async id => {
    const config = configs.find(item => item.id === id), source = sources.find(item => item.id === id)
    return { id, title: (activities.find(item => item.id === id) ?? activityDrafts.find(item => item.id === id))?.title ?? config?.title ?? id,
      activityPublished: activities.find(item => item.id === id)?.status === 'published', config: config ? { ...config, ...source } : null,
      draft: drafts.find(item => item.id === id) ?? null, summary: summaries.find(item => item.id === id) ?? null,
      final: config?.finalVersion ? await store.get(`voteResults/${id}/versions/${config.finalVersion}`) : null }
  })), works: works.map(item => ({ id: item.id, title: item.title })), serverTime: new Date().toISOString() }
}
export async function mutateVoting(store, uid, input, now = () => new Date().toISOString()) {
  exactKeys(input, ['id', 'action', 'operationId', 'expectedRevision', 'expectedDraftRevision', 'voting', 'resultsVisibility', 'expectedSourceRevision', 'expectedFinalVersion', 'reason', 'controlUrl'], '投票管理')
  idCheck(input.id)
  const actions = ['save', 'activate', 'open', 'close', 'hide-entry', 'show-entry', 'sync', 'visibility', 'finalize', 'correct', 'connection']
  if (!actions.includes(input.action) || !OPERATION_ID.test(input.operationId) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || !Number.isSafeInteger(input.expectedDraftRevision) || input.expectedDraftRevision < 0) throw new ActivityError('投票管理操作格式不正確')
  if (input.resultsVisibility !== undefined && (!['live', 'final', 'hidden'].includes(input.resultsVisibility) || input.action !== 'visibility')) throw new ActivityError('統計顯示設定不正確')
  if (input.voting !== undefined && !['save', 'activate'].includes(input.action)) throw new ActivityError('此操作不能改寫投票規則')
  if (input.controlUrl !== undefined && input.action !== 'connection') throw new ActivityError('此操作不能變更控制網址')
  const candidate = ['save', 'activate'].includes(input.action) ? validateVoting(input.voting, input.action === 'save') : null
  if (candidate && candidate.activityId !== input.id) throw new ActivityError('活動代號不一致')
  const fingerprint = hash(input), receiptPath = `auditLogs/${uid}-${input.operationId}`
  return store.transaction(async tx => {
    const [receipt, current, draft, source, summary, activity] = await Promise.all([tx.get(receiptPath), tx.get(`votingConfigs/${input.id}`), tx.get(`votingDrafts/${input.id}`), tx.get(`voteSources/${input.id}`), tx.get(`voteSummaries/${input.id}`), tx.get(`activities/${input.id}`)])
    if (receipt) { if (receipt.fingerprint !== fingerprint) throw new ActivityError('重試識別碼已用於其他操作', 409); return receipt.result }
    const revision = current?.revision ?? 0, draftRevision = draft?.revision ?? 0, timestamp = now()
    if (revision !== input.expectedRevision || draftRevision !== input.expectedDraftRevision) throw new ActivityError('投票資料已變更，請重新載入', 409)
    if (!activity && !await tx.get(`activityDrafts/${input.id}`)) throw new ActivityError('請先新增活動', 404)
    if (candidate) {
      if (current) throw new ActivityError('已啟用的名單、表單與規則已固定；新一輪投票請建立新活動', 409)
      const published = await Promise.all(candidate.entries.map(entry => tx.get(`publicWorks/${entry.workId}`)))
      if (published.some(item => !item)) throw new ActivityError('參賽作品必須已上架', 409)
      if ((candidate.formUrl && activity?.submissionUrl === candidate.formUrl) || (candidate.formId && activity?.submissionUrl?.includes(candidate.formId))) throw new ActivityError('投票與作品投稿需使用不同表單')
    } else if (!current || !source) throw new ActivityError('請先儲存並啟用投票設定', 409)
    let result, next
    if (input.action === 'save') {
      const value = { ...candidate, revision: draftRevision + 1, updatedBy: uid, updatedAt: timestamp }
      tx.set(`votingDrafts/${input.id}`, value); result = { revision, draftRevision: value.revision }
    } else if (input.action === 'activate') {
      if (!draft || JSON.stringify(validateVoting(editableVoting(draft))) !== JSON.stringify(candidate)) throw new ActivityError('請先儲存目前草稿', 409)
      if (!candidate.controlUrl) throw new ActivityError('請先部署 Apps Script 並填入控制網址')
      next = { ...configOf(candidate), revision: 1, mappingVersion: mappingOf(candidate), entryEnabled: false, acceptanceDesired: false, finalVersion: 0, createdAt: timestamp, updatedAt: timestamp }
      tx.set(`voteSources/${input.id}`, { ...sourceOf(candidate), controlStatus: 'unverified', acceptanceConfirmed: null, confirmedRevision: 0 })
      tx.delete(`votingDrafts/${input.id}`)
    } else {
      next = { ...current, revision: revision + 1, updatedAt: timestamp }
      if (input.action === 'open') {
        if (current.finalVersion || votingPhase(current, Date.parse(timestamp)) !== 'open') throw new ActivityError('僅能在設定的投票期間開放收票', 409)
        if (!source.schemaVerified) throw new ActivityError('請先完整同步，確認表單限制、題目與名單正確', 409)
        next.entryEnabled = true; next.acceptanceDesired = true
      } else if (input.action === 'close') {
        next.entryEnabled = false; next.acceptanceDesired = false; next.closeRequestedAt = timestamp
      } else if (['show-entry', 'hide-entry'].includes(input.action)) {
        if (input.action === 'show-entry' && (!current.acceptanceDesired || current.finalVersion)) throw new ActivityError('請先開放表單收票', 409)
        next.entryEnabled = input.action === 'show-entry'
      } else if (input.action === 'visibility') {
        if (!['live', 'final', 'hidden'].includes(input.resultsVisibility)) throw new ActivityError('請選擇票數顯示方式')
        next.resultsVisibility = input.resultsVisibility
      } else if (['finalize', 'correct'].includes(input.action)) {
        if (input.expectedFinalVersion !== (current.finalVersion || 0) || (input.action === 'finalize' ? Boolean(current.finalVersion) : !current.finalVersion)) throw new ActivityError('結算版本已變更，請重新載入', 409)
        if (typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 1000) throw new ActivityError('請填寫至少 10 字的結算說明，包含異常票與同票的處理方式')
        if (current.acceptanceDesired || current.entryEnabled || source.acceptanceConfirmed !== false || source.confirmedRevision !== revision || source.controlStatus !== 'confirmed' || !current.closeRequestedAt || !summary || summary.sourceGeneratedAt < current.closeRequestedAt || Date.parse(timestamp) - Date.parse(summary.lastSyncedAt) > 300000 || summary.syncStatus !== 'ok' || summary.sourceRevision !== input.expectedSourceRevision) throw new ActivityError('請先關閉收票並完成最新完整同步，再確認結算', 409)
        const resultVersion = (current.finalVersion || 0) + 1
        tx.set(`voteResults/${input.id}/versions/${resultVersion}`, { activityId: input.id, resultVersion, entries: current.entries, countsByWorkId: summary.countsByWorkId, ballotCount: summary.ballotCount, selectionCount: summary.selectionCount, invalidCount: summary.invalidCount, excludedCount: summary.excludedCount, sourceRevision: summary.sourceRevision, sourceGeneratedAt: summary.sourceGeneratedAt, mappingVersion: current.mappingVersion, confirmedAt: timestamp, confirmedBy: uid, reason: input.reason.trim() })
        next.finalVersion = resultVersion
      }
      if (['open', 'close', 'sync'].includes(input.action)) {
        tx.set(`voteSources/${input.id}`, { ...source, controlStatus: 'pending' })
        tx.set(`voteSyncJobs/${input.operationId}`, { activityId: input.id, configRevision: next.revision, status: 'pending', createdAt: timestamp, actorUid: uid })
      }
      // Non-control changes retain the already confirmed source state.
      else if (input.action === 'connection') tx.set(`voteSources/${input.id}`, { ...source, controlUrl: googleScriptUrl(input.controlUrl), schemaVerified: false, controlStatus: 'unverified', confirmedRevision: 0 })
      else tx.set(`voteSources/${input.id}`, { ...source, confirmedRevision: source.confirmedRevision === revision ? next.revision : source.confirmedRevision })
    }
    if (next) { tx.set(`votingConfigs/${input.id}`, next); result = { revision: next.revision, draftRevision: 0, controlRequired: ['open', 'close', 'sync'].includes(input.action) } }
    tx.set(receiptPath, { actorUid: uid, action: `voting-${input.action}`, targetId: input.id, beforeRevision: revision, afterRevision: result.revision, createdAt: timestamp, fingerprint, result })
    return result
  })
}
export function validateSummary(input, config, source, now = Date.now(), committedRetry = false) {
  exactKeys(input, ['action', 'activityId', 'jobId', 'sourceRevision', 'configRevision', 'mappingVersion', 'sourceGeneratedAt', 'countsByWorkId', 'ballotCount', 'selectionCount', 'invalidCount', 'excludedCount', 'formId', 'questionItemId', 'formUrl', 'acceptingResponses', 'schemaVerified'], '同步統計')
  if (input.action !== 'summary' || input.activityId !== config.activityId || !OPERATION_ID.test(input.jobId) || input.mappingVersion !== config.mappingVersion || input.configRevision !== config.revision || input.formId !== source.formId || input.questionItemId !== source.questionItemId || input.formUrl !== config.formUrl || input.schemaVerified !== true || typeof input.acceptingResponses !== 'boolean') throw new ActivityError('同步來源、規則或設定版本不一致', 409)
  if (!Number.isSafeInteger(input.sourceRevision) || input.sourceRevision < 1) throw new ActivityError('來源版本不正確')
  const sourceGeneratedAt = votingDate(input.sourceGeneratedAt)
  if (Date.parse(sourceGeneratedAt) > now + 300000 || (!committedRetry && now - Date.parse(sourceGeneratedAt) > 300000)) throw new ActivityError('請重新完整統計後再同步', 409)
  const expectedAccepting = config.acceptanceDesired && !config.finalVersion && votingPhase(config, now) === 'open'
  if (input.acceptingResponses !== Boolean(expectedAccepting)) throw new ActivityError('表單收票狀態與設定不一致', 409)
  exactKeys(input.countsByWorkId, config.entries.map(item => item.workId), '作品票數')
  const integer = value => Number.isSafeInteger(value) && value >= 0 && value <= 10000000
  if ([input.ballotCount, input.selectionCount, input.invalidCount, input.excludedCount, ...Object.values(input.countsByWorkId)].some(value => !integer(value)) || Object.keys(input.countsByWorkId).length !== config.entries.length) throw new ActivityError('票數需為完整且非負的整數')
  const total = Object.values(input.countsByWorkId).reduce((sum, value) => sum + value, 0)
  if (total !== input.selectionCount || input.selectionCount < input.ballotCount || input.selectionCount > input.ballotCount * config.maxChoices || Object.values(input.countsByWorkId).some(count => count > input.ballotCount)) throw new ActivityError('選票總數與各作品票數不一致')
  return { ...input, sourceGeneratedAt }
}
export async function ingestSummary(store, input, now = () => new Date().toISOString()) {
  idCheck(input?.activityId)
  return store.transaction(async tx => {
    const [config, source, previous, job] = await Promise.all([tx.get(`votingConfigs/${input.activityId}`), tx.get(`voteSources/${input.activityId}`), tx.get(`voteSummaries/${input.activityId}`), OPERATION_ID.test(input.jobId) ? tx.get(`voteSyncJobs/${input.jobId}`) : null])
    if (!config || !source) throw new ActivityError('投票尚未啟用', 409)
    const timestamp = now(), value = validateSummary(input, config, source, Date.parse(timestamp), Boolean(job?.fingerprint)), fingerprint = hash(value)
    if (job?.fingerprint) { if (job.fingerprint !== fingerprint || job.activityId !== input.activityId) throw new ActivityError('同步作業識別碼重複', 409); return { accepted: false, duplicate: true } }
    if (job && (job.activityId !== input.activityId || job.configRevision !== input.configRevision)) throw new ActivityError('同步作業不一致', 409)
    if (value.sourceRevision <= (source.failureRevision || 0)) return { accepted: false, stale: true }
    if (previous && value.sourceRevision <= previous.sourceRevision) {
      if (value.sourceRevision === previous.sourceRevision && previous.fingerprint !== fingerprint) throw new ActivityError('同一來源版本包含不同統計', 409)
      return { accepted: false, stale: true }
    }
    if (previous && value.sourceGeneratedAt < previous.sourceGeneratedAt) throw new ActivityError('來源統計時間倒退', 409)
    tx.set(`voteSummaries/${input.activityId}`, { countsByWorkId: value.countsByWorkId, ballotCount: value.ballotCount, selectionCount: value.selectionCount, invalidCount: value.invalidCount, excludedCount: value.excludedCount, sourceRevision: value.sourceRevision, sourceGeneratedAt: value.sourceGeneratedAt, mappingVersion: value.mappingVersion, lastSyncedAt: timestamp, syncStatus: 'ok', fingerprint })
    tx.set(`voteSources/${input.activityId}`, { ...source, schemaVerified: true, acceptanceConfirmed: value.acceptingResponses, confirmedRevision: value.configRevision, confirmedAt: timestamp, controlStatus: 'confirmed', lastErrorCode: null })
    tx.set(`voteSyncJobs/${input.jobId}`, { ...(job ?? {}), activityId: input.activityId, configRevision: value.configRevision, sourceRevision: value.sourceRevision, status: 'completed', createdAt: job?.createdAt ?? timestamp, completedAt: timestamp, fingerprint })
    return { accepted: true, sourceRevision: value.sourceRevision }
  })
}
export async function markSyncFailure(store, activityId, revision, jobId, now = () => new Date().toISOString(), failure = null) {
  return store.transaction(async tx => {
    const [config, source, job, summary] = await Promise.all([tx.get(`votingConfigs/${activityId}`), tx.get(`voteSources/${activityId}`), tx.get(`voteSyncJobs/${jobId}`), tx.get(`voteSummaries/${activityId}`)])
    if (!config || !source || config.revision !== revision || job?.status === 'completed') return
    if (failure && failure.sourceRevision <= Math.max(summary?.sourceRevision || 0, source.failureRevision || 0)) return
    tx.set(`voteSources/${activityId}`, { ...source, ...(failure ? { failureRevision: failure.sourceRevision } : {}), controlStatus: 'failed', lastErrorCode: 'source-unavailable' })
    tx.set(`voteSyncJobs/${jobId}`, { ...(job ?? {}), activityId, configRevision: revision, ...(failure ? { sourceRevision: failure.sourceRevision, sourceGeneratedAt: failure.sourceGeneratedAt } : {}), status: 'failed', errorCode: 'source-unavailable', completedAt: now() })
    if (summary) tx.set(`voteSummaries/${activityId}`, { ...summary, syncStatus: 'error' })
  })
}
export async function ingestFailure(store, input, now = () => new Date().toISOString()) {
  exactKeys(input, ['action', 'activityId', 'jobId', 'configRevision', 'mappingVersion', 'sourceRevision', 'sourceGeneratedAt'], '同步失敗回報')
  idCheck(input.activityId)
  if (input.action !== 'failure' || !OPERATION_ID.test(input.jobId) || !Number.isSafeInteger(input.configRevision) || !Number.isSafeInteger(input.sourceRevision) || input.sourceRevision < 1 || Math.abs(Date.parse(votingDate(input.sourceGeneratedAt)) - Date.parse(now())) > 300000) throw new ActivityError('同步失敗回報格式不正確')
  const config = await store.get(`votingConfigs/${input.activityId}`)
  if (!config || config.revision !== input.configRevision || config.mappingVersion !== input.mappingVersion) throw new ActivityError('同步失敗回報版本已過期', 409)
  await markSyncFailure(store, input.activityId, input.configRevision, input.jobId, now, input)
  return { reported: true }
}
export async function readPublicVoting(store, activityId, now = Date.now()) {
  idCheck(activityId)
  const [config, source, activity] = await Promise.all([store.get(`votingConfigs/${activityId}`), store.get(`voteSources/${activityId}`), store.get(`activities/${activityId}`)])
  if (!config || activity?.status !== 'published') return { voting: null }
  const phase = votingPhase(config, now), final = config.finalVersion ? await store.get(`voteResults/${activityId}/versions/${config.finalVersion}`) : null
  const showCounts = config.resultsVisibility === 'live' || (config.resultsVisibility === 'final' && Boolean(final))
  const summary = showCounts ? final ?? await store.get(`voteSummaries/${activityId}`) : null
  const fresh = source?.confirmedAt && now - Date.parse(source.confirmedAt) <= 1800000
  const canVote = !final && phase === 'open' && config.entryEnabled && config.acceptanceDesired && source?.acceptanceConfirmed === true && source.confirmedRevision === config.revision && source.controlStatus === 'confirmed' && fresh
  // Explicit projection: no source IDs, owner identity, invalid ballots or draft data.
  return { voting: { activityId, title: config.title, voteStartsAt: config.voteStartsAt, voteEndsAt: config.voteEndsAt, maxChoices: config.maxChoices, phase: final ? 'final' : phase, canVote: Boolean(canVote), formUrl: canVote ? config.formUrl : null, resultsVisible: showCounts,
    entries: config.entries.map(item => ({ workId: item.workId, code: item.code, title: item.title, ...(summary ? { count: summary.countsByWorkId[item.workId] } : {}) })),
    ballotCount: summary?.ballotCount ?? null, selectionCount: summary?.selectionCount ?? null, resultVersion: final?.resultVersion ?? null,
    lastSyncedAt: final?.confirmedAt ?? summary?.lastSyncedAt ?? null, syncStatus: final ? 'final' : !summary ? 'pending' : summary.syncStatus !== 'ok' || now - Date.parse(summary.lastSyncedAt) > 1800000 ? 'stale' : 'ok', serverTime: new Date(now).toISOString() } }
}
export async function exportVoting(store, activityId, version) {
  idCheck(activityId)
  if (!Number.isSafeInteger(version) || version < 1) throw new ActivityError('請指定已確認的結算版本')
  const value = await store.get(`voteResults/${activityId}/versions/${version}`)
  if (!value) throw new ActivityError('此結算版本不存在', 404)
  return safeCsv([['活動', '結算版本', '來源版本', '結算時間', '選票數', '總選擇數', '選項', '作品代號', '作品名稱', '票數'], ...value.entries.map(entry => [activityId, value.resultVersion, value.sourceRevision, value.confirmedAt, value.ballotCount, value.selectionCount, entry.code, entry.workId, entry.title, value.countsByWorkId[entry.workId]])])
}
