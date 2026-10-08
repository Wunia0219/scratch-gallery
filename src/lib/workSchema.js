import { ActivityError } from './activitySchema.js'
export const WORK_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const fields = ['id', 'creatorId', 'title', 'description', 'category', 'tags', 'devices', 'controls', 'objective', 'thumbnail', 'sortOrder']
export function editableWork(value) { return Object.fromEntries(fields.map(key => [key, value?.[key] ?? ({ tags: [], devices: ['desktop'], sortOrder: 0 }[key] ?? '')])) }
export function validateWork(value, asset, creator) {
  if (!value || Object.keys(value).some(key => !fields.includes(key)) || !WORK_ID.test(value.id) || value.id !== asset?.id || !WORK_ID.test(value.creatorId) || creator?.id !== value.creatorId || !['student', 'teacher'].includes(creator.role)) throw new ActivityError('作品或作者設定不正確')
  const text = (key, max, required = false) => {
    if (typeof value[key] !== 'string' || value[key].length > max || (required && !value[key].trim())) throw new ActivityError(`${key} 內容不正確或過長`)
    return value[key].trim()
  }
  if (!Array.isArray(value.tags) || value.tags.length > 12 || value.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 40)) throw new ActivityError('標籤最多 12 個，每個最多 40 字')
  if (!Array.isArray(value.devices) || !value.devices.length || value.devices.some(device => !['desktop', 'mobile'].includes(device))) throw new ActivityError('請選擇適用裝置')
  if (!asset.thumbnails.includes(value.thumbnail)) throw new ActivityError('封面必須選擇此作品已打包的圖片')
  if (!Number.isInteger(value.sortOrder) || value.sortOrder < -9999 || value.sortOrder > 9999) throw new ActivityError('排序必須介於 -9999 與 9999')
  return { id: value.id, creatorId: value.creatorId, title: text('title', 120, true), description: text('description', 2000, true), category: text('category', 80, true), tags: [...new Set(value.tags.map(tag => tag.trim()))], devices: [...new Set(value.devices)], controls: text('controls', 1000), objective: text('objective', 1000), thumbnail: value.thumbnail, sortOrder: value.sortOrder }
}
export function workSortKey(work, creator) {
  return `${creator.role}:${String(work.sortOrder + 9999).padStart(5, '0')}:${String(9999999999999 - (Date.parse(work.publishedAt) || 0)).padStart(13, '0')}:${String(work.sourceOrder ?? 999999).padStart(6, '0')}:${work.id}`
}
export function publicWork(work, asset, creator) {
  const result = { ...editableWork(work), student: creator.name, className: creator.className, creatorType: creator.role, playUrl: asset.playUrl, detailUrl: `/works/${work.id}/`, publishedAt: work.publishedAt ?? null, assetVersion: asset.assetVersion, revision: work.revision, sortKey: workSortKey(work, creator) }
  if (asset.thumbnailLayers?.length && work.thumbnail === asset.thumbnail) result.thumbnailLayers = asset.thumbnailLayers
  if (asset.leaderboard) result.leaderboard = asset.leaderboard
  return result
}
