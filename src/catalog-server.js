import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import GalleryPage from './GalleryPage.vue'
import WorkRoute from './WorkRoute.vue'
import { catalogStateKey } from './composables/useGames.js'
import { createSiteState, siteStateKey, emptySiteState } from './composables/useSiteState.js'
export async function renderCatalog(kind, props, data) {
  return renderToString(createSSRApp(kind === 'gallery' ? GalleryPage : WorkRoute, props).provide(catalogStateKey, data).provide(siteStateKey, createSiteState(emptySiteState())))
}
