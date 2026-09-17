import { computed, ref } from 'vue'
import gameData from '../../public/games.json'
import creatorData from '../../public/creators.json'
import { validateCatalog } from '../lib/catalog.js'

// Build-time and browser rendering share the same validated catalog.
export const catalog = validateCatalog(gameData, creatorData)
export function useGames() {
  const games = ref(catalog)
  const classes = computed(() => ['全部', ...new Set(catalog.filter(g => g.creatorType !== 'teacher').map(g => g.className))])
  return { games, classes, loading: ref(false), error: ref('') }
}
