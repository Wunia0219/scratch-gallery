import { getStore } from '@netlify/blobs'
import { publishedIds, eligibleWork } from '../lib/public-catalog.mjs'
import { createPlayCountHandler } from '../lib/play-count-handler.mjs'

export default createPlayCountHandler(getStore, publishedIds, eligibleWork)
