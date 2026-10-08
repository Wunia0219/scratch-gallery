import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { localActivityApi } from './scripts/local-activity-api.mjs'

function publicGameCors(server) {
  server.middlewares.use((req, res, next) => {
    // Opaque-origin sandboxed games may read only their public static assets.
    if (req.url?.startsWith('/games/')) res.setHeader('Access-Control-Allow-Origin', '*')
    next()
  })
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return {
  plugins: [vue(), { name: 'sandbox-game-assets', configureServer(server) { publicGameCors(server); server.middlewares.use(localActivityApi) }, configurePreviewServer(server) { publicGameCors(server); server.middlewares.use(localActivityApi) } }],
  build: {
    manifest: true,
    assetsInlineLimit: 2048,
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
  },
  }
})
