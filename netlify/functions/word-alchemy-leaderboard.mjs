import { getStore } from '@netlify/blobs'
import { eligibleWork } from '../lib/public-catalog.mjs'
import { createLeaderboardHandler } from '../lib/leaderboards.mjs'

export default createLeaderboardHandler(getStore, [], undefined, id => eligibleWork(id, true))
