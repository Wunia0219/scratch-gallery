import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

function publicGameCors(server) {
  server.middlewares.use((req, res, next) => {
    // Opaque-origin sandboxed games may read only their public static assets.
    if (req.url?.startsWith('/games/')) res.setHeader('Access-Control-Allow-Origin', '*')
    next()
  })
}

export default defineConfig({
  plugins: [vue(), { name: 'sandbox-game-assets', configureServer: publicGameCors, configurePreviewServer: publicGameCors }],
  build: {
    manifest: true,
    assetsInlineLimit: 2048,
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
  },
})
