export class ActivityError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}
export const ACTIVITY_ID = /^[a-z][a-z0-9-]{2,79}$/
export const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const editable = ['id', 'templateKey', 'title', 'titleEn', 'description', 'descriptionEn', 'remindFrom', 'startsAt', 'endsAt', 'submissionUrl', 'previewId', 'sortOrder']
function text(value, name, max, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new ActivityError(`${name}格式不正確`)
  return value.trim()
}
export function validateActivity(input, previewIds = ['halloween-activity-intro']) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !editable.includes(key))) throw new ActivityError('活動欄位不正確')
  if (!ACTIVITY_ID.test(input.id)) throw new ActivityError('活動代號需為 3–80 個英文小寫、數字或連字號')
  if (input.templateKey !== 'halloween') throw new ActivityError('請選擇已完成的活動介面')
  const result = {
    id: input.id, templateKey: input.templateKey,
    title: text(input.title, '活動名稱', 120), titleEn: text(input.titleEn ?? '', '英文名稱', 180, false),
    description: text(input.description, '活動說明', 2000), descriptionEn: text(input.descriptionEn ?? '', '英文說明', 3000, false),
    previewId: input.previewId, sortOrder: input.sortOrder ?? 0,
  }
  for (const field of ['remindFrom', 'startsAt', 'endsAt']) {
    const value = input[field]
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new ActivityError('請填寫完整活動日期與時區')
    result[field] = new Date(value).toISOString()
  }
  if (Date.parse(result.startsAt) >= Date.parse(result.endsAt)) throw new ActivityError('截止時間必須晚於開始時間')
  if (Date.parse(result.remindFrom) > Date.parse(result.endsAt)) throw new ActivityError('提醒時間不能晚於截止時間')
  if (!previewIds.includes(input.previewId)) throw new ActivityError('活動示範尚未部署')
  if (!Number.isInteger(result.sortOrder) || Math.abs(result.sortOrder) > 10000) throw new ActivityError('排序需為 -10000 至 10000 的整數')
  let url
  try { url = new URL(input.submissionUrl) } catch { throw new ActivityError('投稿網址格式不正確') }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.hostname !== 'forms.gle' && !(url.hostname === 'docs.google.com' && url.pathname.startsWith('/forms/')))) throw new ActivityError('投稿網址限 Google 表單的 HTTPS 連結')
  result.submissionUrl = url.href
  return result
}
export function editableActivity(activity) {
  return Object.fromEntries(editable.map(key => [key, activity[key]]))
}
export function publicActivity(activity) {
  if (!activity || activity.status !== 'published') return null
  return { ...validateActivity(editableActivity(activity)), isPublished: true, href: '/#announcements', revision: activity.revision ?? 0 }
}
