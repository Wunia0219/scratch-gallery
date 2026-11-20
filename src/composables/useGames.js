import { inject, ref } from 'vue'
export const catalogStateKey = Symbol('catalogState')
export async function catalogRequest(path) {
  const response = await fetch(path, { cache: 'no-cache' })
  let body
  try { body = await response.json() } catch { throw Object.assign(new Error('作品服務暫時無法取得，請稍後重試'), { status: response.status || 503 }) }
  if (!response.ok) throw Object.assign(new Error(body.error || '作品暫時無法載入'), { status: response.status })
  return body
}
export function useGames(role) {
  const initial = inject(catalogStateKey, null)
  const games = ref(initial?.items ?? []), classes = ref(initial?.classes ?? ['全部']), total = ref(initial?.total ?? null), cursor = ref(initial?.cursor ?? null), revision = ref(initial?.revision ?? 0)
  const loading = ref(false), error = ref('')
  let sequence = 0
  async function load(filters = {}, more = false) {
    const ticket = ++sequence
    loading.value = true; error.value = ''
    if (!more) games.value = []
    try {
      const params = new URLSearchParams({ role, ...filters, ...(more && cursor.value ? { cursor: cursor.value } : {}) })
      const result = await catalogRequest(`/api/works?${params}`)
      if (ticket !== sequence) return
      games.value = more ? [...games.value, ...result.items] : result.items
      classes.value = result.classes; total.value = result.total; cursor.value = result.cursor; revision.value = result.revision
    } catch (reason) {
      if (ticket !== sequence) return
      if (reason.status === 409 && more) { await load(filters); return }
      games.value = []; cursor.value = null; total.value = null; error.value = reason.message
    } finally { if (ticket === sequence) loading.value = false }
  }
  return { games, classes, total, cursor, revision, loading, error, load }
}
