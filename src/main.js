import { createApp } from 'vue'
import App from './App.vue'
import WorkPage from './WorkPage.vue'
import { catalog } from './composables/useGames.js'
import '../styles.css'

const game = catalog.find(item => item.detailUrl === window.location.pathname.replace(/index\.html$/, ''))
createApp(game ? WorkPage : App, game ? { game } : {}).mount('#app')
