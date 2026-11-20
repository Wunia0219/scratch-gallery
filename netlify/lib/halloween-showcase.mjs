import { catalogMode, catalogServices, legacyCatalog } from './catalog-runtime.mjs'
import { readPublishedWork } from './work-service.mjs'
import { halloweenTeaserIds, halloweenWorkIds } from '../../src/lib/halloweenShowcase.js'
import { compareWorksByDate } from '../../src/lib/workSchema.js'

export function halloweenShowcaseData(works) {
  const items = works.filter(work => halloweenWorkIds.includes(work.id) && work.creatorType === 'student' && !work.releasePending)
  return { items: items.sort(compareWorksByDate) }
}

export function halloweenTeaserData(works) {
  const byId = new Map(halloweenShowcaseData(works).items.map(work => [work.id, work]))
  return { covers: halloweenTeaserIds.flatMap(id => {
    const work = byId.get(id)
    return work?.thumbnail ? [{ id, title: work.title, thumbnail: work.thumbnail }] : []
  }) }
}

export async function readHalloweenWorks(ids, services) {
  const { store, manifest, environment } = services
  const works = await Promise.all(ids.map(async id => {
    try { return await readPublishedWork(store, manifest, environment, id) }
    catch (error) { if (error.status === 404) return null; throw error }
  }))
  return works.filter(Boolean)
}

export async function readHalloweenShowcase(teaser = false) {
  const works = catalogMode() === 'legacy' ? legacyCatalog()
    : await readHalloweenWorks(teaser ? halloweenTeaserIds : halloweenWorkIds, await catalogServices())
  return teaser ? halloweenTeaserData(works) : halloweenShowcaseData(works)
}
