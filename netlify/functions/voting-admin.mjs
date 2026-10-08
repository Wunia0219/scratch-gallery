import { purgeCache } from '@netlify/functions'
import { envValue, getFirebaseServices, requireOwner } from '../lib/firebase-runtime.mjs'
import { ActivityError } from '../../src/lib/activitySchema.js'
import { listAdminVoting, mutateVoting, exportVoting } from '../lib/voting-service.mjs'
import { runSourceControl } from '../lib/voting-control.mjs'
import { readVotingBody, votingResponse, votingFailure } from '../lib/voting-http.mjs'
import { connectionReady, privateConnection, votingTemplate } from '../lib/voting-setup.mjs'
export function createVotingAdminHandler({ services = getFirebaseServices, owner = requireOwner, control = runSourceControl, purge = async () => { if (envValue('CONTEXT')) await purgeCache({ tags: ['voting'] }) } } = {}) {
  return async request => {
    try {
      if (envValue('ACTIVITY_DATA_MODE') !== 'firebase') throw new ActivityError('投票後台等待 Firebase 連接設定', 503)
      const runtime = await services(), uid = await owner(request, runtime), url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/admin/voting') return votingResponse({ ...await listAdminVoting(runtime.store), connectionReady: connectionReady() })
      if (request.method === 'GET' && url.pathname === '/api/admin/vote-template') return await votingTemplate(url.searchParams.get('file'))
      if (request.method === 'GET' && url.pathname === '/api/admin/vote-export') {
        const csv = await exportVoting(runtime.store, url.searchParams.get('id'), Number(url.searchParams.get('version')))
        return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' } })
      }
      if (request.method !== 'POST') return votingResponse({ error: '不支援此操作' }, 405)
      if (!['/api/admin/vote-mutate', '/api/admin/vote-connection'].includes(url.pathname)) return votingResponse({ error: '投票管理操作不存在' }, 404)
      if (request.headers.get('origin') !== url.origin) throw new ActivityError('管理操作來源不正確', 403)
      const input = await readVotingBody(request)
      if (url.pathname === '/api/admin/vote-connection') return votingResponse(await privateConnection(runtime.store, input, request.url))
      const result = await mutateVoting(runtime.store, uid, input)
      const controlStatus = result.controlRequired ? await control(runtime.store, input.id, result.revision, input.operationId) : 'unchanged'
      let cacheStatus = 'updated'; try { await purge() } catch { cacheStatus = 'pending' }
      return votingResponse({ ...result, controlStatus, cacheStatus })
    } catch (error) { return votingFailure(error) }
  }
}
export default createVotingAdminHandler()
export const config = { path: ['/api/admin/voting', '/api/admin/vote-mutate', '/api/admin/vote-export', '/api/admin/vote-template', '/api/admin/vote-connection'] }
