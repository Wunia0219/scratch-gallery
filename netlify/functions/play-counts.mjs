import { getStore } from '@netlify/blobs'
import games from '../../public/games.json' with { type: 'json' }
import { createPlayCountHandler } from '../lib/play-count-handler.mjs'

export default createPlayCountHandler(getStore, games.map(game => game.id))
