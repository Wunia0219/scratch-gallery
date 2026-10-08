import { purgeCache } from '@netlify/functions'
import { ActivityError, ACTIVITY_ID } from '../../src/lib/activitySchema.js'
import { exactKeys } from '../../src/lib/votingSchema.js'
import { envValue, getFirebaseServices } from '../lib/firebase-runtime.mjs'
import { votingKey, signVoting, verifyVoting } from '../lib/voting-signature.mjs'
import { sourceConfiguration, ingestSummary, ingestFailure } from '../lib/voting-service.mjs'
import { readVotingBody, votingResponse, votingFailure } from '../lib/voting-http.mjs'
export function createVoteSyncHandler({ services = getFirebaseServices, keyFor = votingKey, purge = async () => { if (envValue('CONTEXT')) await purgeCache({ tags: ['voting'] }) } } = {}) {
  return async request => {
    try {
      if (request.method !== 'POST') return votingResponse({ error: '不支援此操作' }, 405)
      const envelope = await readVotingBody(request)
      let activityId
      try { activityId = JSON.parse(envelope.payload).activityId } catch { throw new ActivityError('同步資料格式不正確') }
      if (typeof activityId !== 'string' || !ACTIVITY_ID.test(activityId)) throw new ActivityError('同步活動代號不正確')
      const key = keyFor(activityId, 'sync'), payload = verifyVoting(envelope, key, 'sync')
      if (!['configuration', 'summary', 'failure'].includes(payload.action)) throw new ActivityError('同步操作不正確')
      const { store } = await services()
      if (payload.action === 'configuration') {
        exactKeys(payload, ['action', 'activityId'], '來源設定請求')
        const [config, source] = await Promise.all([store.get(`votingConfigs/${activityId}`), store.get(`voteSources/${activityId}`)])
        if (!config || !source) throw new ActivityError('投票尚未啟用', 409)
        return votingResponse(signVoting({ configuration: sourceConfiguration(config, source) }, key, 'sync-reply'))
      }
      const result = payload.action === 'failure' ? await ingestFailure(store, payload) : await ingestSummary(store, payload)
      if (result.accepted || result.reported) { try { await purge() } catch { /* The public cache expires after 15 seconds. */ } }
      return votingResponse(signVoting(result, key, 'sync-reply'))
    } catch (error) { return votingFailure(error) }
  }
}
export default createVoteSyncHandler()
export const config = { path: '/api/vote-sync' }
