import { createHmac, timingSafeEqual } from 'node:crypto'
import { ActivityError, ACTIVITY_ID } from '../../src/lib/activitySchema.js'
import { exactKeys } from '../../src/lib/votingSchema.js'
import { envValue } from './firebase-runtime.mjs'
export function votingKey(activityId, purpose) {
  if (typeof activityId !== 'string' || !ACTIVITY_ID.test(activityId) || !['sync', 'control'].includes(purpose)) throw new ActivityError('投票簽章用途不正確')
  const root = envValue(purpose === 'sync' ? 'VOTING_SYNC_SECRET' : 'VOTING_CONTROL_SECRET')
  if (!/^[0-9a-f]{64}$/.test(root || '')) throw new ActivityError('投票簽章金鑰尚未設定', 503)
  return createHmac('sha256', root).update(`gallery-voting-key-v1\n${activityId}\n${purpose}`).digest('hex')
}
export function signVoting(payload, key, purpose, now = Date.now()) {
  const timestamp = now, body = JSON.stringify(payload)
  return { timestamp, payload: body, signature: createHmac('sha256', key).update(`gallery-vote-${purpose}-v1\n${timestamp}\n${body}`).digest('hex') }
}
export function verifyVoting(envelope, key, purpose, now = Date.now()) {
  exactKeys(envelope, ['timestamp', 'payload', 'signature'], '同步簽章')
  if (!Number.isSafeInteger(envelope.timestamp) || Math.abs(now - envelope.timestamp) > 300000 || typeof envelope.payload !== 'string' || Buffer.byteLength(envelope.payload) > 60000 || !/^[0-9a-f]{64}$/.test(envelope.signature || '')) throw new ActivityError('投票簽章無效或已過期', 401)
  const expected = createHmac('sha256', key).update(`gallery-vote-${purpose}-v1\n${envelope.timestamp}\n${envelope.payload}`).digest()
  if (!timingSafeEqual(expected, Buffer.from(envelope.signature, 'hex'))) throw new ActivityError('投票簽章不正確', 401)
  try { return JSON.parse(envelope.payload) } catch { throw new ActivityError('同步資料格式不正確') }
}
