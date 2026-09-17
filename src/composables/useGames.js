import { computed, ref } from 'vue'
import gameData from '../../public/games.json'
import creatorData from '../../public/creators.json'
import { validateCatalog } from '../lib/catalog.js'

// Build-time and browser rendering share the same validated catalog.
export const catalog = validateCatalog(gameData, creatorData)
const galleryClasses = ['全部', 'Scratch-115', 'Scratch-114']

export function useGames() {
  const games = ref(catalog)
  const classes = computed(() => galleryClasses)
  return { games, classes, loading: ref(false), error: ref('') }
}
