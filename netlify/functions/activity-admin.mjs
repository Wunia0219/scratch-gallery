import { purgeCache } from '@netlify/functions'
import previews from '../../public/standalone-games.json' with { type: 'json' }
import { envValue, getFirebaseServices, requireOwner, firebaseEnvironment } from '../lib/firebase-runtime.mjs'
import { listAdminActivities, mutateActivity } from '../lib/activity-service.mjs'
import { activityResponse, activityFailure, readActivityBody } from '../lib/activity-http.mjs'
import { ActivityError } from '../../src/lib/activitySchema.js'
export default async request => {
  const path = new URL(request.url).pathname
  try {
    if (path === '/api/admin/config' && request.method === 'GET') {
      const configured = Boolean(envValue('FIREBASE_PROJECT_ID') && envValue('FIREBASE_WEB_API_KEY') && envValue('FIREBASE_WEB_APP_ID') && envValue('ACTIVITY_DATA_MODE') === 'firebase')
      if (!configured) return activityResponse({ configured: false })
      const projectId = firebaseEnvironment()
      const emulatorHost = !envValue('CONTEXT') ? envValue('FIREBASE_AUTH_EMULATOR_HOST') : null
      return activityResponse({ configured: true, firebase: { projectId, apiKey: envValue('FIREBASE_WEB_API_KEY'), appId: envValue('FIREBASE_WEB_APP_ID'), authDomain: `${projectId}.firebaseapp.com` }, authEmulator: emulatorHost ? `http://${emulatorHost}` : null })
    }
    if (envValue('ACTIVITY_DATA_MODE') !== 'firebase') throw new ActivityError('Firebase 尚未完成連接設定', 503)
    const services = await getFirebaseServices()
    const uid = await requireOwner(request, services)
    if (path === '/api/admin/activities' && request.method === 'GET') return activityResponse(await listAdminActivities(services.store))
    if (path === '/api/admin/activity-save' || path === '/api/admin/activity-publish') {
      if (request.method !== 'POST') return activityResponse({ error: '不支援此操作' }, 405)
      const origin = request.headers.get('origin')
      if (origin !== new URL(request.url).origin) throw new ActivityError('管理操作來源不正確', 403)
      const input = await readActivityBody(request)
      if ((path.endsWith('activity-save') && input.action !== 'save') || (path.endsWith('activity-publish') && !['publish', 'hide'].includes(input.action))) throw new ActivityError('操作與端點不一致')
      const result = await mutateActivity(services.store, uid, input, previews.map(item => item.id))
      let cacheStatus = 'unchanged'
      if (input.action !== 'save') {
        try { if (envValue('CONTEXT')) await purgeCache({ tags: ['activities'] }); cacheStatus = 'updated' } catch { cacheStatus = 'pending' }
      }
      return activityResponse({ ...result, cacheStatus })
    }
    return activityResponse({ error: '管理操作不存在' }, 404)
  } catch (error) { return activityFailure(error) }
}
export const config = { path: ['/api/admin/config', '/api/admin/activities', '/api/admin/activity-save', '/api/admin/activity-publish'] }
