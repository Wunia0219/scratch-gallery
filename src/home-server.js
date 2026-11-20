import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import App from './App.vue'
import { createSiteState, siteStateKey } from './composables/useSiteState.js'
export async function renderHome(state) {
  return renderToString(createSSRApp(App).provide(siteStateKey, createSiteState(state)))
}
