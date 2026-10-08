import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { envValue, getFirebaseServices } from '../lib/firebase-runtime.mjs'
import { initialSiteState, readPublicState } from '../lib/activity-service.mjs'
import { galleryCsp } from '../../scripts/site-policy.mjs'
let runtime
async function loadRuntime() {
  runtime ??= Promise.all([import(pathToFileURL(resolve('.netlify/server/home.mjs')).href), readFile(resolve('.netlify/server/template.json'), 'utf8').then(JSON.parse)])
  return runtime
}
export default async request => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } })
  const [{ renderHome }, template] = await loadRuntime()
  let state, status = 200
  try {
    const mode = envValue('ACTIVITY_DATA_MODE') || 'legacy'
    if (!['firebase', 'legacy'].includes(mode)) throw new Error('Invalid activity mode')
    state = mode === 'firebase' ? await readPublicState((await getFirebaseServices()).store) : initialSiteState()
  } catch {
    status = 503
    state = { featuredActivity: null, contentUpdates: { students: null, teachers: null, events: null }, mode: 'firebase', newWorkWindowDays: 15, revision: 0, availability: 'unavailable' }
  }
  let content = await renderHome(state)
  for (const asset of Object.values(template.assets)) if (asset.src) content = content.replaceAll(`/${asset.src}`, `/${asset.file}`)
  const bootstrap = `<script type="application/json" id="site-state">${JSON.stringify(state).replaceAll('<', '\\u003c')}</script>`
  const html = template.html.replace('__GALLERY_CONTENT__', () => content).replace('</body>', `${bootstrap}</body>`)
  return new Response(request.method === 'HEAD' ? null : html, { status, headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': status === 200 ? 'public, max-age=0, must-revalidate' : 'no-store',
    'Netlify-CDN-Cache-Control': status === 200 ? 'public, durable, max-age=15' : 'no-store', 'Netlify-Cache-Tag': 'activities',
    'Content-Security-Policy': galleryCsp, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()', 'Strict-Transport-Security': 'max-age=31536000',
    ...(!template.indexable ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
  } })
}
