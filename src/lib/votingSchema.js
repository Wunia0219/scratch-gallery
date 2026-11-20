import { ActivityError, ACTIVITY_ID } from './activitySchema.js'
import { WORK_ID } from './workSchema.js'

const fields = ['activityId', 'title', 'voteStartsAt', 'voteEndsAt', 'maxChoices', 'resultsVisibility', 'entries', 'formId', 'formUrl', 'questionItemId', 'controlUrl']
export const OPTION_CODE = /^W\d{3}$/
export function exactKeys(value, allowed, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new ActivityError(`${name}欄位不正確`)
}
export function votingDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new ActivityError('請填寫完整投票日期與時區')
  return new Date(value).toISOString()
}
export function googleScriptUrl(value, allowEmpty = false) {
  if (allowEmpty && value === '') return ''
  let url
  try { url = new URL(value) } catch { throw new ActivityError('Apps Script 網址格式不正確') }
  if (url.protocol !== 'https:' || url.host !== 'script.google.com' || !/^\/macros\/s\/[\w-]{20,250}\/exec$/.test(url.pathname) || url.search || url.hash || url.username || url.password) throw new ActivityError('請使用 Apps Script 的正式 /exec 網址')
  return url.href
}
export function validateVoting(input, allowUnbound = false) {
  exactKeys(input, fields, '投票設定')
  if (typeof input.activityId !== 'string' || !ACTIVITY_ID.test(input.activityId)) throw new ActivityError('活動代號不正確')
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120 || /[\u0000-\u001f]/.test(input.title)) throw new ActivityError('投票名稱格式不正確')
  const voteStartsAt = votingDate(input.voteStartsAt), voteEndsAt = votingDate(input.voteEndsAt)
  if (voteStartsAt >= voteEndsAt) throw new ActivityError('投票截止必須晚於開始時間')
  if (!Number.isInteger(input.maxChoices) || input.maxChoices < 1 || input.maxChoices > 5) throw new ActivityError('每票可選 1 至 5 件作品')
  if (!['live', 'final', 'hidden'].includes(input.resultsVisibility)) throw new ActivityError('票數顯示方式不正確')
  if (!Array.isArray(input.entries) || input.entries.length < 2 || input.entries.length > 100 || input.entries.length < input.maxChoices) throw new ActivityError('請選擇 2 至 100 件參賽作品')
  const codes = new Set(), ids = new Set()
  const entries = input.entries.map(entry => {
    exactKeys(entry, ['code', 'workId', 'title'], '投票選項')
    if (!OPTION_CODE.test(entry.code) || codes.has(entry.code) || !WORK_ID.test(entry.workId) || ids.has(entry.workId)) throw new ActivityError('選項代號與作品不得重複')
    if (typeof entry.title !== 'string' || !entry.title.trim() || entry.title.length > 120 || /[\u0000-\u001f｜]/.test(entry.title)) throw new ActivityError('選項名稱格式不正確')
    codes.add(entry.code); ids.add(entry.workId)
    return { code: entry.code, workId: entry.workId, title: entry.title.trim() }
  })
  if (typeof input.formId !== 'string' || (!(allowUnbound && input.formId === '') && !/^[\w-]{20,200}$/.test(input.formId)) || typeof input.questionItemId !== 'string' || (!(allowUnbound && input.questionItemId === '') && !/^\d{1,16}$/.test(input.questionItemId))) throw new ActivityError('請填寫表單編輯 ID 與投票題目 ID')
  let url
  if (!(allowUnbound && input.formUrl === '')) {
    try { url = new URL(input.formUrl) } catch { throw new ActivityError('投票表單網址格式不正確') }
    if (url.protocol !== 'https:' || url.host !== 'docs.google.com' || !/^\/forms\/d\/(?:e\/)?[\w-]{20,200}\/viewform$/.test(url.pathname) || url.search || url.hash || url.username || url.password) throw new ActivityError('請使用 Google 表單完整的 /viewform 填答網址')
  }
  return { activityId: input.activityId, title: input.title.trim(), voteStartsAt, voteEndsAt, maxChoices: input.maxChoices, resultsVisibility: input.resultsVisibility, entries, formId: input.formId, formUrl: url?.href ?? '', questionItemId: input.questionItemId, controlUrl: googleScriptUrl(input.controlUrl, true) }
}
export function editableVoting(value) { return Object.fromEntries(fields.map(key => [key, value[key]])) }
export function votingPhase(config, now = Date.now()) {
  return now < Date.parse(config.voteStartsAt) ? 'upcoming' : now >= Date.parse(config.voteEndsAt) ? 'closed' : 'open'
}
export function safeCsv(rows) {
  return '\ufeff' + rows.map(row => row.map(value => {
    const text = String(value ?? '')
    return `"${(/^[\s]*[=+@-]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`
  }).join(',')).join('\r\n') + '\r\n'
}
