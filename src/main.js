import { createApp } from 'vue'
import '../styles.css'

const path = window.location.pathname.replace(/index\.html$/, '')
let component
let props = {}

if (path === '/students/') {
  component = (await import('./GalleryPage.vue')).default
  props = { creatorType: 'student' }
} else if (path === '/teachers/') {
  component = (await import('./GalleryPage.vue')).default
  props = { creatorType: 'teacher' }
} else if (path.startsWith('/works/')) {
  const [{ default: WorkPage }, { catalog }] = await Promise.all([
    import('./WorkPage.vue'),
    import('./composables/useGames.js'),
  ])
  const game = catalog.find(item => item.detailUrl === path)
  component = game ? WorkPage : (await import('./App.vue')).default
  if (game) props = { game }
} else {
  component = (await import('./App.vue')).default
}

createApp(component, props).mount('#app')
