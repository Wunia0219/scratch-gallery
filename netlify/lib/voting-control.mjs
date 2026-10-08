import { ActivityError } from '../../src/lib/activitySchema.js'
import { googleScriptUrl } from '../../src/lib/votingSchema.js'
import { votingKey, signVoting, verifyVoting } from './voting-signature.mjs'
import { sourceConfiguration, ingestSummary, markSyncFailure } from './voting-service.mjs'
import { readVotingBody } from './voting-http.mjs'
export async function runSourceControl(store, activityId, revision, jobId, fetcher = fetch) {
  const [config, source] = await Promise.all([store.get(`votingConfigs/${activityId}`), store.get(`voteSources/${activityId}`)])
  if (config?.revision !== revision) throw new ActivityError('投票設定已變更，請重新同步', 409)
  try {
    const key = votingKey(activityId, 'control'), endpoint = googleScriptUrl(source.controlUrl), signal = AbortSignal.timeout(12000)
    let response = await fetcher(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(signVoting({ action: 'reconcile', activityId, jobId, configuration: sourceConfiguration(config, source) }, key, 'control')), redirect: 'manual', signal })
    if ([301, 302, 303].includes(response.status)) {
      const target = new URL(response.headers.get('location') || '', endpoint)
      if (target.protocol !== 'https:' || target.host !== 'script.googleusercontent.com' || target.username || target.password) throw new Error('Unexpected redirect')
      // ContentService returns JSON through a GET redirect; never forward the signed POST body.
      response = await fetcher(target.href, { method: 'GET', redirect: 'error', signal })
    }
    if (!response.ok) throw new Error('Source unavailable')
    const value = verifyVoting(await readVotingBody(response), key, 'control-reply')
    if (value.jobId !== jobId || value.activityId !== activityId) throw new Error('Source reply mismatch')
    await ingestSummary(store, value)
    return 'confirmed'
  } catch (error) {
    await markSyncFailure(store, activityId, revision, jobId)
    console.error('Voting control unavailable:', error?.name || 'unknown')
    return 'failed'
  }
}
