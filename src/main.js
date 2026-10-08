import { createApp } from 'vue'
import '../styles.css'
import { createSiteState, siteStateKey } from './composables/useSiteState.js'
import { catalogStateKey } from './composables/useGames.js'

const path = window.location.pathname.replace(/index\.html$/, '')
let component
let props = {}

if (path === '/admin/') {
  component = (await import('./AdminPage.vue')).default
} else if (path === '/students/') {
  component = (await import('./GalleryPage.vue')).default
  props = { creatorType: 'student' }
} else if (path === '/teachers/') {
  component = (await import('./GalleryPage.vue')).default
  props = { creatorType: 'teacher' }
} else if (path.startsWith('/works/')) {
  component = (await import('./WorkRoute.vue')).default
  props = { id: path.split('/')[2] }
} else {
  component = (await import('./App.vue')).default
}

const bootstrap = document.getElementById('site-state')
const siteState = createSiteState(bootstrap ? JSON.parse(bootstrap.textContent) : undefined)
const catalogBootstrap = document.getElementById('catalog-state')
createApp(component, props).provide(siteStateKey, siteState).provide(catalogStateKey, catalogBootstrap ? JSON.parse(catalogBootstrap.textContent) : null).mount('#app')
if (path !== '/admin/') siteState.start()
window.addEventListener('pagehide', () => siteState.stop())
