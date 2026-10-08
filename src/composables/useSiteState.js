import { computed, inject, ref } from 'vue'
import { featuredActivity, contentUpdates, newWorkWindowDays } from '../contentUpdates.js'

export const siteStateKey = Symbol('siteState')
export const legacySiteState = () => ({ featuredActivity, contentUpdates, newWorkWindowDays, mode: 'legacy', revision: 1 })
export const emptySiteState = (availability = 'loading') => ({ featuredActivity: null, contentUpdates: { students: contentUpdates.students, teachers: contentUpdates.teachers, events: null }, newWorkWindowDays, mode: 'firebase', revision: 0, availability })
export function createSiteState(initial = legacySiteState()) {
  const state = ref(initial)
  let timer, pending = false
  async function refresh() {
    if (pending || document.hidden) return
    pending = true
    try {
      const response = await fetch('/api/site-config', { cache: 'no-cache' })
      if (!response.ok) throw new Error('活動設定暫時無法取得')
      state.value = await response.json()
    } catch {
      if (state.value.mode === 'firebase') state.value = emptySiteState('unavailable')
    } finally { pending = false }
  }
  function start() {
    void refresh()
    timer = window.setInterval(refresh, 30000)
    document.addEventListener('visibilitychange', refresh)
  }
  function stop() {
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', refresh)
  }
  return { state, start, stop, refresh }
}
export function useSiteState() {
  const service = inject(siteStateKey, null)
  const state = service?.state ?? ref(legacySiteState())
  return { state, activity: computed(() => state.value.featuredActivity), updates: computed(() => state.value.contentUpdates) }
}
