<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useLanguage } from '../i18n'
import { useNow } from '../composables/useNow.js'
const props = defineProps({ activityId: { type: String, required: true } })
const { language } = useLanguage(), now = useNow(), voting = ref(null), error = ref(false), busy = ref(false), host = ref(null)
let timer, observer, controller, alive = true, inView = true, timeOffset = 0
const text = (zh, en) => language.value === 'en' ? en : zh
const canVote = computed(() => voting.value?.canVote && !error.value && now.value + timeOffset < Date.parse(voting.value.voteEndsAt))
const sorted = computed(() => [...(voting.value?.entries ?? [])].sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.code.localeCompare(b.code)))
const maxCount = computed(() => Math.max(1, ...sorted.value.map(item => item.count ?? 0)))
function date(value) { return new Intl.DateTimeFormat(language.value === 'en' ? 'en-GB' : 'zh-TW', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Taipei' }).format(new Date(value)) }
async function refresh(force = false) {
  if (busy.value || document.hidden || (!force && !inView)) return
  busy.value = true; controller = new AbortController()
  try {
    const response = await fetch(`/api/voting/${props.activityId}`, { cache: 'no-cache', signal: controller.signal })
    if (!response.ok) throw new Error('Unavailable')
    const value = await response.json(); if (!alive) return
    voting.value = value.voting; error.value = false
    if (value.voting) timeOffset = Date.parse(value.voting.serverTime) - Date.now()
  } catch (failure) { if (alive && failure.name !== 'AbortError') error.value = true } finally { if (alive) busy.value = false }
}
const visibility = () => { if (!document.hidden) void refresh() }
onMounted(() => {
  void refresh(true); timer = window.setInterval(refresh, 45000); document.addEventListener('visibilitychange', visibility)
  if ('IntersectionObserver' in window) { observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; if (inView) void refresh() }, { rootMargin: '150px' }); observer.observe(host.value) }
})
onBeforeUnmount(() => { alive = false; controller?.abort(); clearInterval(timer); observer?.disconnect(); document.removeEventListener('visibilitychange', visibility) })
</script>
<template>
  <div ref="host">
    <section v-if="voting" class="voting-results" :aria-labelledby="`voting-title-${activityId}`">
      <div class="section-heading"><div><p class="eyebrow">COMMUNITY VOTE</p><h3 :id="`voting-title-${activityId}`">{{ voting.title }}</h3></div><span class="voting-status">{{ voting.resultVersion ? text(`已結算 · 版本 ${voting.resultVersion}`, `Final · version ${voting.resultVersion}`) : now + timeOffset >= Date.parse(voting.voteEndsAt) ? text('投票已截止', 'Voting has ended') : voting.phase === 'upcoming' ? text('投票尚未開始', 'Voting opens soon') : canVote ? text('開放投票中', 'Voting is open') : text('投票入口暫未開放', 'Voting is not currently available') }}</span></div>
      <p>{{ text('每個 Google 帳號僅能提交一次；不收集姓名與電子郵件。', 'One response per Google account. No names or email addresses collected.') }} {{ text(voting.maxChoices === 1 ? '每票選一件作品。' : `每票最多選 ${voting.maxChoices} 件作品。`, `Choose up to ${voting.maxChoices} work(s).`) }}</p>
      <p>{{ text('投票期間（台灣時間）：', 'Voting period (Taiwan time): ') }}{{ date(voting.voteStartsAt) }} — {{ date(voting.voteEndsAt) }}</p>
      <a v-if="canVote" class="button button-primary" :href="voting.formUrl" target="_blank" rel="noreferrer">{{ text('前往 Google 表單投票', 'Vote in Google Forms') }}<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 17 17 7M8 7h9v9" /></svg></a>
      <p class="voting-update" role="status">{{ error || voting.syncStatus === 'stale' ? text('統計連線暫時延遲，目前保留上次票數。', 'Updates are delayed; showing the previous count.') : voting.lastSyncedAt ? text('統計時間：', 'Updated: ') + date(voting.lastSyncedAt) : text('等待第一批完整統計，空白不代表零票。', 'Waiting for the first count. Missing counts do not mean zero votes.') }}</p>
      <template v-if="voting.resultsVisible && voting.ballotCount !== null"><p class="voting-ballots">{{ text(`有效選票 ${voting.ballotCount} 張`, `${voting.ballotCount} valid ballots`) }}<template v-if="voting.maxChoices > 1"> · {{ text(`總選擇 ${voting.selectionCount} 次`, `${voting.selectionCount} selections`) }}</template></p><ol class="voting-ranking"><li v-for="entry in sorted" :key="entry.workId"><div><a :href="`/works/${entry.workId}/`">{{ entry.code }} · {{ entry.title }}</a><strong>{{ text(`${entry.count} 票`, `${entry.count} votes`) }}</strong></div><progress aria-hidden="true" :max="maxCount" :value="entry.count"></progress></li></ol></template>
      <p v-else-if="!voting.resultsVisible">{{ text('票數依活動安排公開。', 'Results will be published according to the event schedule.') }}</p>
      <button class="button button-secondary" type="button" :disabled="busy" @click="refresh(true)">{{ text(busy ? '更新中…' : '更新統計', busy ? 'Updating…' : 'Refresh results') }}</button>
    </section>
    <p v-else-if="error" class="voting-update" role="status">{{ text('投票資訊暫時無法載入，請稍後再試。', 'Voting information is temporarily unavailable.') }}</p>
  </div>
</template>
<style scoped>
.voting-results { margin-top: 32px; padding: clamp(20px, 4vw, 36px); border: 1px solid #c6d8ee; border-radius: 24px; background: #f3f8ff; color: #254469; }
.voting-results h3 { font-size: clamp(1.4rem, 3vw, 2rem); margin: 0; }
.voting-results p { line-height: 1.8; }
.voting-status { padding: 8px 14px; border-radius: 20px; background: #ffe29b; color: #604006; }
.voting-ranking { list-style: none; padding: 0; display: grid; gap: 18px; margin: 24px 0; }
.voting-ranking li > div { display: flex; gap: 20px; justify-content: space-between; align-items: start; }
.voting-ranking a { min-height: 44px; display: inline-flex; align-items: center; color: #16477f; overflow-wrap: anywhere; }
.voting-ranking strong { white-space: nowrap; padding-top: 10px; }
.voting-ranking progress { width: 100%; height: 10px; accent-color: #2d67ab; }
.voting-update { color: #526174; }
.voting-results button { min-height: 44px; }
.voting-results button:disabled { opacity: .6; }
.voting-results :focus-visible { outline: 3px solid #ed9f26; outline-offset: 3px; }
@media (max-width: 600px) { .voting-results .section-heading { flex-direction: column; align-items: start; gap: 16px; } }
</style>
