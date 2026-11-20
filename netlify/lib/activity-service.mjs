import { createHash } from 'node:crypto'
import { ActivityError, ACTIVITY_ID, OPERATION_ID, validateActivity, publicActivity, editableActivity } from '../../src/lib/activitySchema.js'
import { featuredActivity, contentUpdates } from '../../src/contentUpdates.js'

export function initialActivity() {
  return {
    id: featuredActivity.id, templateKey: 'halloween', title: '萬聖節魔法 Scratch 創作挑戰',
    titleEn: 'Halloween Magic Scratch Challenge', description: '南瓜燈正在等待大家的創意！用 Scratch 做出遊戲、動畫、互動故事或藝術作品，一起點亮萬聖節魔法派對。',
    descriptionEn: 'The pumpkin lights need your ideas! Create a Scratch game, animation, interactive story, or artwork and help light up our Halloween party.',
    remindFrom: featuredActivity.remindFrom, startsAt: featuredActivity.startsAt, endsAt: featuredActivity.endsAt,
    submissionUrl: featuredActivity.submissionUrl, previewId: featuredActivity.previewId, sortOrder: 0,
    status: featuredActivity.isPublished ? 'published' : 'draft', revision: 1, schemaVersion: 1,
  }
}
export function initialSiteState() {
  return { featuredActivity: publicActivity(initialActivity()), contentUpdates: { ...contentUpdates }, newWorkWindowDays: 15, revision: 1, mode: 'legacy', serverTime: new Date().toISOString() }
}
export async function readPublicState(store) {
  const settings = await store.get('siteSettings/public')
  if (!settings) throw new ActivityError('活動資料尚未初始化', 503)
  const activity = settings.featuredActivityId ? await store.get(`activities/${settings.featuredActivityId}`) : null
  return {
    featuredActivity: publicActivity(activity), contentUpdates: { students: settings.contentVersions?.students ?? null, teachers: settings.contentVersions?.teachers ?? null, events: activity?.status === 'published' ? settings.contentVersions?.events ?? null : null },
    newWorkWindowDays: 15, revision: settings.revision ?? 1, catalogRevision: settings.catalogRevision ?? 0, mode: 'firebase', serverTime: new Date().toISOString(),
  }
}
export async function listPublicActivities(store) {
  return (await store.list('activities')).filter(activity => activity.status === 'published').map(publicActivity).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
}
export async function listAdminActivities(store) {
  const [activities, drafts, settings] = await Promise.all([store.list('activities'), store.list('activityDrafts'), store.get('siteSettings/public')])
  const ids = new Set([...activities, ...drafts].map(item => item.id))
  return { activities: [...ids].map(id => ({ id, published: activities.find(item => item.id === id) ?? null, draft: drafts.find(item => item.id === id) ?? null })), featuredActivityId: settings?.featuredActivityId ?? null }
}
export async function mutateActivity(store, actorUid, input, previewIds, now = () => new Date().toISOString()) {
  if (!input || !OPERATION_ID.test(input.operationId) || !ACTIVITY_ID.test(input.id) || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0 || !['save', 'publish', 'hide'].includes(input.action)) throw new ActivityError('管理操作格式不正確')
  if (Object.keys(input).some(key => !['operationId', 'id', 'expectedRevision', 'expectedDraftRevision', 'action', 'activity', 'makeFeatured'].includes(key))) throw new ActivityError('管理操作包含未知欄位')
  if (!Number.isInteger(input.expectedDraftRevision) || input.expectedDraftRevision < 0 || (input.makeFeatured !== undefined && typeof input.makeFeatured !== 'boolean')) throw new ActivityError('草稿版本或首頁設定不正確')
  if (input.action !== 'hide' && (!input.activity || input.activity.id !== input.id)) throw new ActivityError('活動代號不一致')
  const candidate = input.action === 'hide' ? null : validateActivity(input.activity, previewIds)
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex')
  const operationPath = `auditLogs/${actorUid}-${input.operationId}`
  return store.transaction(async tx => {
    const [previous, current, draft, settings] = await Promise.all([tx.get(operationPath), tx.get(`activities/${input.id}`), tx.get(`activityDrafts/${input.id}`), tx.get('siteSettings/public')])
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new ActivityError('重試識別碼已用於其他操作', 409)
      return previous.result
    }
    if (!settings) throw new ActivityError('請先完成活動資料初始化', 503)
    const revision = current?.revision ?? 0
    if (revision !== input.expectedRevision || (draft?.revision ?? 0) !== (input.expectedDraftRevision ?? 0)) throw new ActivityError('其他分頁已修改此活動，請重新載入後再編輯', 409)
    const timestamp = now()
    let result
    if (input.action === 'save') {
      const next = { ...candidate, baseRevision: revision, revision: (draft?.revision ?? 0) + 1, updatedBy: actorUid, updatedAt: timestamp, schemaVersion: 1 }
      tx.set(`activityDrafts/${input.id}`, next)
      result = { revision, draftRevision: next.revision, action: 'save' }
    } else {
      if (input.action === 'publish' && (!draft || draft.baseRevision !== revision || JSON.stringify(validateActivity(editableActivity(draft), previewIds)) !== JSON.stringify(candidate))) throw new ActivityError('請先儲存目前草稿，再確認發布', 409)
      if (input.action === 'hide' && !current) throw new ActivityError('活動不存在', 404)
      const next = { ...(candidate ?? current), status: input.action === 'hide' ? 'archived' : 'published', revision: revision + 1, createdAt: current?.createdAt ?? timestamp, updatedBy: actorUid, updatedAt: timestamp, schemaVersion: 1 }
      tx.set(`activities/${input.id}`, next)
      tx.delete(`activityDrafts/${input.id}`)
      const featured = input.action === 'publish' && (input.makeFeatured === true || !settings.featuredActivityId) ? input.id : settings.featuredActivityId
      tx.set('siteSettings/public', { ...settings, featuredActivityId: featured, revision: (settings.revision ?? 0) + 1, contentVersions: { ...settings.contentVersions, ...(featured === input.id ? { events: `${input.id}:${revision + 1}` } : {}) }, updatedAt: timestamp })
      result = { revision: next.revision, draftRevision: 0, action: input.action }
    }
    tx.set(operationPath, { actorUid, action: `activity-${input.action}`, targetType: 'activity', targetId: input.id, beforeRevision: revision, afterRevision: result.revision, changedFields: candidate ? Object.keys(candidate).filter(key => candidate[key] !== (draft ?? current)?.[key]) : ['status'], createdAt: timestamp, fingerprint, result })
    return result
  })
}
