export function siteConfig(env = process.env) {
  const raw = env.SITE_URL || (env.NETLIFY ? env.URL : '')
  const url = new URL(raw || 'http://127.0.0.1:4173')
  if (raw && (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password)) {
    throw new Error('SITE_URL 必須是 HTTPS 根網址，不可包含路徑、帳密或查詢參數')
  }
  const indexable = Boolean(raw) && (!env.CONTEXT || env.CONTEXT === 'production')
  if (env.CONTEXT === 'production' && !raw) throw new Error('正式建置缺少 SITE_URL 或 Netlify URL')
  return { origin: url.origin, indexable }
}

export const galleryCsp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
export function runtimeSources(origin, env = process.env) {
  return [...new Set([origin, env.DEPLOY_URL, env.DEPLOY_PRIME_URL].filter(Boolean).map(value => {
    const url = new URL(value)
    if (url.origin !== origin && (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)) throw new Error('部署網址無效')
    return url.origin
  }))].join(' ')
}
export function gameCsp(origin) {
  // Sandbox gives games opaque origins; explicit asset hosts and public CORS are required.
  return `default-src 'none'; script-src ${origin} 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; img-src ${origin} data: blob:; media-src ${origin} data: blob:; font-src ${origin} data:; connect-src ${origin}; worker-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts allow-pointer-lock`
}
export function buildHeaders(origin, indexable, paths, sources = origin) {
  const common = ['/*', '  X-Content-Type-Options: nosniff', '  Referrer-Policy: no-referrer', '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()', '  Strict-Transport-Security: max-age=31536000']
  if (!indexable) common.push('  X-Robots-Tag: noindex, nofollow')
  const pages = [...new Set(['/', '/index.html', '/404.html', ...paths.flatMap(p => [p, `${p}index.html`])])]
  return common.join('\n') + '\n\n' + pages.map(p => `${p}\n  Content-Security-Policy: ${galleryCsp}\n  X-Frame-Options: DENY\n  Cache-Control: public, max-age=0, must-revalidate`).join('\n\n')
    + `\n\n/games/*\n  Access-Control-Allow-Origin: *\n  X-Robots-Tag: noindex\n  Content-Security-Policy: ${gameCsp(sources)}\n\n/games.json\n  X-Robots-Tag: noindex\n\n/standalone-games.json\n  X-Robots-Tag: noindex\n\n/creators.json\n  X-Robots-Tag: noindex\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`
}
