import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ActivityError, ACTIVITY_ID } from '../../src/lib/activitySchema.js'
import { exactKeys } from '../../src/lib/votingSchema.js'
import { envValue } from './firebase-runtime.mjs'
import { votingKey } from './voting-signature.mjs'
export const connectionReady = () => ['VOTING_SYNC_SECRET', 'VOTING_CONTROL_SECRET'].every(key => /^[0-9a-f]{64}$/.test(envValue(key) || ''))
export async function votingTemplate(file) {
  if (!['script', 'manifest'].includes(file)) throw new ActivityError('串接範本不存在', 404)
  return new Response(await readFile(resolve('integrations/google-voting', file === 'script' ? 'Code.gs' : 'appsscript.json'), 'utf8'), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' } })
}
export async function privateConnection(store, input, requestUrl) {
  exactKeys(input, ['id'], '私密串接設定')
  if (typeof input.id !== 'string' || !ACTIVITY_ID.test(input.id)) throw new ActivityError('活動代號不正確')
  const [activity, draft, source, votingDraft] = await Promise.all([store.get(`activities/${input.id}`), store.get(`activityDrafts/${input.id}`), store.get(`voteSources/${input.id}`), store.get(`votingDrafts/${input.id}`)])
  if (!activity && !draft) throw new ActivityError('活動不存在', 404)
  const url = new URL(requestUrl)
  return { ACTIVITY_ID: input.id, FORM_ID: source?.formId ?? votingDraft?.formId ?? '', SYNC_URL: url.protocol === 'https:' ? `${url.origin}/api/vote-sync` : '', SYNC_KEY: votingKey(input.id, 'sync'), CONTROL_KEY: votingKey(input.id, 'control') }
}
