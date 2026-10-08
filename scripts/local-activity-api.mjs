export async function localActivityApi(req, res, next) {
  if (!req.url?.startsWith('/api/admin/') && !['/api/site-config', '/api/activities'].includes(req.url?.split('?')[0])) return next()
  try {
    const name = req.url.startsWith('/api/admin/') ? 'activity-admin' : 'site-config'
    const chunks = []
    let length = 0
    for await (const chunk of req) { length += chunk.length; if (length > 16000) { res.statusCode = 413; return res.end('Request too large') } chunks.push(chunk) }
    const origin = `http://${req.headers.host}`
    const request = new Request(new URL(req.url, origin), { method: req.method, headers: req.headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}) })
    // Vite bundles its config in a temporary folder; resolve server modules from the workspace.
    const handler = (await import(pathToFileURL(resolve('netlify/functions', `${name}.mjs`)).href)).default
    const response = await handler(request)
    res.statusCode = response.status
    response.headers.forEach((value, key) => res.setHeader(key, value))
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch { res.statusCode = 503; res.end(JSON.stringify({ error: '本機後台服務暫時無法取得' })) }
}
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
