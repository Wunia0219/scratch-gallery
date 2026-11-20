import { envValue, getFirebaseServices } from '../lib/firebase-runtime.mjs'
import { readPublicVoting } from '../lib/voting-service.mjs'
import { votingResponse, votingFailure } from '../lib/voting-http.mjs'
export function createPublicVotingHandler(services = getFirebaseServices) {
  return async request => {
    try {
      if (request.method !== 'GET') return votingResponse({ error: '不支援此操作' }, 405)
      if (envValue('ACTIVITY_DATA_MODE') !== 'firebase') return votingResponse({ voting: null }, 200, true)
      const id = new URL(request.url).pathname.match(/^\/api\/voting\/([a-z][a-z0-9-]{2,79})$/)?.[1]
      if (!id) return votingResponse({ error: '投票活動不存在' }, 404)
      return votingResponse(await readPublicVoting((await services()).store, id), 200, true)
    } catch (error) { return votingFailure(error) }
  }
}
export default createPublicVotingHandler()
export const config = { path: '/api/voting/*' }
