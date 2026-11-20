import { envValue, getFirebaseServices } from '../lib/firebase-runtime.mjs'
import { initialSiteState, readPublicState, listPublicActivities } from '../lib/activity-service.mjs'
import { activityResponse, activityFailure } from '../lib/activity-http.mjs'
export default async request => {
  if (request.method !== 'GET') return activityResponse({ error: '不支援此操作' }, 405)
  try {
    const mode = envValue('ACTIVITY_DATA_MODE') || 'legacy'
    if (!['firebase', 'legacy'].includes(mode)) throw new Error('Invalid activity mode')
    if (new URL(request.url).pathname === '/api/activities') return activityResponse({ activities: mode === 'firebase' ? await listPublicActivities((await getFirebaseServices()).store) : [initialSiteState().featuredActivity].filter(Boolean) }, 200, true)
    const state = mode === 'firebase' ? await readPublicState((await getFirebaseServices()).store) : initialSiteState()
    return activityResponse(state, 200, true)
  } catch (error) { return activityFailure(error) }
}
export const config = { path: ['/api/site-config', '/api/activities'] }
