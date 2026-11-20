import { purgeCache } from '@netlify/functions'
import { requireOwner, envValue } from '../lib/firebase-runtime.mjs'
import { catalogServices } from '../lib/catalog-runtime.mjs'
import { listAdminWorks, listWorkHistory, mutateWork } from '../lib/work-service.mjs'
import { catalogResponse, catalogFailure } from '../lib/catalog-http.mjs'
import { readActivityBody } from '../lib/activity-http.mjs'
import { ActivityError } from '../../src/lib/activitySchema.js'
export default async request => {
  try {
    const services = await catalogServices(), uid = await requireOwner(request, services), url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/api/admin/works') return catalogResponse(await listAdminWorks(services.store, services.manifest, services.environment))
    if (request.method === 'GET' && url.pathname === '/api/admin/work-history') return catalogResponse({ history: await listWorkHistory(services.store, url.searchParams.get('id') || '') })
    if (request.method !== 'POST') return catalogResponse({ error: '不支援此操作' }, 405)
    if (url.pathname !== '/api/admin/work-mutate') return catalogResponse({ error: '管理操作不存在' }, 404)
    if (request.headers.get('origin') !== url.origin) throw new ActivityError('管理操作來源不正確', 403)
    const input = await readActivityBody(request)
    const result = await mutateWork(services.store, uid, input, services.manifest, services.environment)
    let cacheStatus = 'unchanged'
    if (['publish', 'hide'].includes(input.action)) {
      try { if (envValue('CONTEXT')) await purgeCache({ tags: ['catalog', 'activities'] }); cacheStatus = 'updated' } catch { cacheStatus = 'pending' }
    }
    return catalogResponse({ ...result, cacheStatus })
  } catch (error) { return catalogFailure(error) }
}
export const config = { path: ['/api/admin/works', '/api/admin/work-history', '/api/admin/work-mutate'] }
