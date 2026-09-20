import { onBeforeUnmount, onMounted, ref } from 'vue'

// One clock for all badges/reminders; no timer during static rendering.
const now = ref(Date.now())
let users = 0
let timer
const refresh = () => { now.value = Date.now() }
export function useNow() {
  onMounted(() => {
    if (users++ === 0) {
      refresh()
      timer = window.setInterval(refresh, 30000)
      document.addEventListener('visibilitychange', refresh)
    }
  })
  onBeforeUnmount(() => {
    if (--users === 0) {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  })
  return now
}
