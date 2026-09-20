import { getStore } from '@netlify/blobs'
import games from '../../public/games.json' with { type: 'json' }
import { createLeaderboardHandler, LEADERBOARD_TYPE } from '../lib/leaderboards.mjs'

const enabledGames = games.filter(game => game.leaderboard?.type === LEADERBOARD_TYPE).map(game => game.id)

export default createLeaderboardHandler(getStore, enabledGames)
