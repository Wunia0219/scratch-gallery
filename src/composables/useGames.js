import { shallowReadonly, shallowRef } from 'vue'
import gameData from '../../public/games.json'
import creatorData from '../../public/creators.json'
import { studentClasses, validateCatalog } from '../lib/catalog.js'

// Build-time and browser rendering share the same validated catalog.
export const catalog = validateCatalog(gameData, creatorData)
const games = shallowReadonly(shallowRef(catalog))
const classes = shallowReadonly(shallowRef(studentClasses(creatorData)))

export function useGames() {
  return { games, classes }
}
