<script setup>
import { computed, defineAsyncComponent, inject, onMounted, ref, watch } from 'vue'
import GameCard from './components/GameCard.vue'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import { catalogRequest, catalogStateKey } from './composables/useGames.js'
import { usePlayCounts } from './composables/usePlayCounts.js'
import { useSiteState } from './composables/useSiteState.js'
import { useLanguage } from './i18n.js'
import { halloweenShowcase } from './lib/halloweenShowcase.js'

const GamePlayerDialog = defineAsyncComponent(() => import('./components/GamePlayerDialog.vue'))
const initial = inject(catalogStateKey, null)
const works = ref(initial?.items ?? [])
const selectedClass = ref('')
const selectedGame = ref(null)
const shown = ref(9)
const loading = ref(!initial)
const error = ref(initial?.status === 503)
const { t } = useLanguage()
const { state } = useSiteState()
const { counts, loaded, load: loadCounts, record } = usePlayCounts()
const classes = computed(() => ['', ...new Set(works.value.map(work => work.className))].sort())
const matching = computed(() => works.value.filter(work => !selectedClass.value || work.className === selectedClass.value))
const remaining = computed(() => Math.min(9, matching.value.length - shown.value))
let pending = false

async function refresh() {
  if (pending) return
  pending = true
  loading.value = true
  try {
    works.value = (await catalogRequest(halloweenShowcase.api)).items
    if (!classes.value.includes(selectedClass.value)) selectedClass.value = ''
    if (selectedGame.value && !works.value.some(work => work.id === selectedGame.value.id)) selectedGame.value = null
    error.value = false
  } catch { error.value = true }
  finally { pending = false; loading.value = false }
}
function filter(value) {
  selectedClass.value = value
  shown.value = 9
}
function play(work) {
  selectedGame.value = work
  void record(work.id)
}
onMounted(() => {
  if (!initial || error.value) void refresh()
  void loadCounts()
})
watch(() => state.value.catalogRevision, (revision, previous) => {
  if (revision && revision !== previous) void refresh()
})
</script>

<template>
  <a class="skip-link" href="#main-content">{{ t('halloweenShowcaseSkip') }}</a>
  <SiteHeader active="events" />
  <main id="main-content">
    <section class="halloween-showcase-hero" aria-labelledby="halloween-showcase-title">
      <div class="halloween-showcase-copy">
        <a href="/#announcements" class="halloween-showcase-back">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6" /></svg>
          {{ t('announcementsNav') }}
        </a>
        <h1 id="halloween-showcase-title">{{ t('halloweenShowcaseTitle') }}</h1>
        <p>{{ t('halloweenShowcaseIntro') }}</p>
      </div>
      <svg class="halloween-showcase-scene" aria-hidden="true" viewBox="0 0 440 290">
        <circle cx="311" cy="100" r="66" fill="#ffdb82" opacity=".18" />
        <circle cx="311" cy="100" r="53" fill="#ffdb82" />
        <path d="M288 58c-23 20-26 58-3 80 13 12 36 16 54 6-17 20-47 18-64-1-20-22-15-64 13-85Z" fill="#f4b669" />
        <g fill="#ffdb82"><circle cx="89" cy="68" r="2" /><circle cx="170" cy="38" r="3" /><circle cx="226" cy="95" r="2" /><circle cx="406" cy="121" r="3" /><circle cx="366" cy="27" r="2" /><circle cx="136" cy="118" r="2" /></g>
        <g fill="#11172d">
          <path d="M194 77q12-12 26 2l4-7 5 8q11-10 25 0-14 1-19 12-10-1-15 5-6-11-26-20Z" />
          <path d="M338 151q10-9 19 2l3-5 4 5q8-6 19 1-11 0-14 9-6-1-12 3-5-9-19-15Z" />
          <path d="M25 259q92-56 184-22t231-19v72H25Z" />
        </g>
        <ellipse cx="251" cy="261" rx="105" ry="15" fill="#6d4c5b" opacity=".55" />
        <path d="M238 170c0-17 8-29 22-33-3 9-6 20-1 31" fill="#a9ad72" />
        <path d="M247 171c52-24 94 3 84 43-7 33-38 51-82 50-45 1-78-17-84-50-8-42 39-63 82-43Z" fill="#d95d2b" />
        <ellipse cx="247" cy="214" rx="54" ry="49" fill="#ed843e" />
        <ellipse cx="247" cy="215" rx="34" ry="48" fill="#f6a34d" />
        <path d="m205 207 24-16 4 24Zm59 8 7-24 22 16Zm-51 11q34 18 71 0l-9 19-11-6-11 10-12-8-12 5Z" fill="#70362f" />
        <path d="m208 204 19-12-2 8Zm60-3 4-9 15 11Z" fill="#ffda86" />
      </svg>
    </section>
    <section class="gallery-library halloween-showcase-library" :aria-label="t('halloweenShowcaseTitle')">
      <div v-if="works.length" class="halloween-showcase-tools">
        <div class="filters" role="group" :aria-label="t('class')">
          <button v-for="name in classes" :key="name" type="button" class="filter-button" :aria-pressed="selectedClass === name" @click="filter(name)">
            {{ name || t('allClasses') }}
          </button>
        </div>
        <p class="result-count" aria-live="polite">{{ t('workCount', { count: matching.length }) }}</p>
      </div>
      <div v-if="error" class="empty-state" role="alert">
        <h2>{{ t('halloweenShowcaseUnavailable') }}</h2>
        <button class="button button-secondary" type="button" :disabled="loading" @click="refresh">{{ t('halloweenShowcaseRetry') }}</button>
      </div>
      <p v-else-if="loading && !works.length" role="status">{{ t('halloweenShowcaseLoading') }}</p>
      <template v-else-if="matching.length">
        <div class="game-grid">
          <GameCard v-for="work in matching.slice(0, shown)" :key="work.id" :game="work" :play-count="loaded ? (counts[work.id] ?? 0) : null" @play="play" />
        </div>
        <div v-if="remaining > 0" class="load-more">
          <button class="button button-secondary" type="button" @click="shown += remaining">{{ t('showMore', { count: remaining }) }}</button>
        </div>
      </template>
      <div v-else class="empty-state">
        <h2>{{ t('collectionEmpty') }}</h2>
        <p>{{ t('collectionEmptyText') }}</p>
      </div>
    </section>
  </main>
  <SiteFooter />
  <GamePlayerDialog v-if="selectedGame" :game="selectedGame" @close="selectedGame = null" />
</template>
