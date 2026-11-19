<script setup>
import { computed, defineAsyncComponent, inject, onMounted, ref, watch } from 'vue'
import GameCard from './components/GameCard.vue'
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
const loading = ref(!initial)
const error = ref(initial?.status === 503)
const { language, setLanguage, t } = useLanguage()
const { state } = useSiteState()
const { counts, loaded, load: loadCounts, record } = usePlayCounts()
const classes = computed(() => ['', ...new Set(works.value.map(work => work.className))].sort())
const matching = computed(() => works.value.filter(work => !selectedClass.value || work.className === selectedClass.value))
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
  <div class="halloween-exhibition">
    <a class="skip-link" href="#main-content">{{ t('skipToMain') }}</a>
    <header class="exhibition-header">
      <div class="exhibition-width exhibition-header-inner">
        <a class="exhibition-brand" href="/" :aria-label="t('homeLabel')">
          <img src="/brand/dongshi-giraffe-logo.webp" alt="" width="38" height="38" />
          <span>{{ t('halloweenExhibitionBrand') }}</span>
        </a>
        <nav class="exhibition-nav" :aria-label="t('primaryNavigation')">
          <a href="/#announcements" class="exhibition-back">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 12H4m7-7-7 7 7 7" /></svg>
            {{ t('announcementsNav') }}
          </a>
          <div class="language-switch" role="group" :aria-label="t('languageLabel')">
            <button type="button" lang="zh-Hant" :aria-pressed="language === 'zh-Hant'" @click="setLanguage('zh-Hant')">中文</button>
            <button type="button" lang="en" :aria-pressed="language === 'en'" @click="setLanguage('en')">English</button>
          </div>
        </nav>
      </div>
    </header>
    <main id="main-content">
      <div class="exhibition-sides" aria-hidden="true">
        <svg class="exhibition-side-definitions" width="0" height="0" focusable="false">
          <defs>
            <symbol id="exhibition-pumpkin" viewBox="0 0 96 96">
              <path d="M49 27c-1-10 3-15 10-19m-12 20c-3-8-8-11-14-12M47 28c-9-7-18-5-23 1C6 29 2 49 12 66c7 12 21 17 36 16 16 1 29-4 36-16 10-17 6-37-12-37-6-6-15-8-25-1Z" />
              <path d="M29 39c-8 13-5 28 4 34m34-34c8 13 5 28-4 34m-33-20 8-9 4 10Zm24 1 4-10 8 9ZM35 63l8 4 5-3 6 3 8-4" />
            </symbol>
            <symbol id="exhibition-ghost" viewBox="0 0 96 96">
              <path d="M20 58V39a28 28 0 0 1 56 0v19c0 9 4 16 10 21-10 4-19 2-25-5-6 10-17 12-25 3-7 7-18 7-26 2 6-5 10-12 10-21Z" />
              <path d="M39 40v3m18-3v3m-12 9c2 3 4 3 6 0" />
            </symbol>
          </defs>
        </svg>
        <svg class="exhibition-side exhibition-side-left exhibition-side-night" viewBox="0 0 96 96" focusable="false"><use href="#exhibition-pumpkin" /></svg>
        <svg class="exhibition-side exhibition-side-right exhibition-side-night" viewBox="0 0 96 96" focusable="false"><use href="#exhibition-ghost" /></svg>
        <svg class="exhibition-side exhibition-side-left exhibition-side-paper" viewBox="0 0 96 96" focusable="false"><use href="#exhibition-ghost" /></svg>
        <svg class="exhibition-side exhibition-side-right exhibition-side-paper" viewBox="0 0 96 96" focusable="false"><use href="#exhibition-pumpkin" /></svg>
      </div>
      <section class="exhibition-opening" aria-labelledby="halloween-showcase-title">
        <div class="exhibition-width exhibition-poster">
          <div class="exhibition-copy">
            <p class="exhibition-classes">Scratch-114 <span aria-hidden="true">/</span><span class="sr-only"> &amp; </span> Scratch-115</p>
            <h1 id="halloween-showcase-title" :aria-label="t('halloweenShowcaseTitle')">
              {{ t('halloweenExhibitionTitleMain') }}
              <span>{{ t('halloweenExhibitionTitleSub') }}</span>
            </h1>
            <p class="exhibition-intro">{{ t('halloweenShowcaseIntro') }}</p>
            <a class="exhibition-enter" href="#exhibition-projects">
              {{ t('halloweenExhibitionEnter') }}
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 4v16m-6-6 6 6 6-6" /></svg>
            </a>
          </div>
          <figure class="exhibition-illustration">
            <img src="/brand/halloween-exhibition-workshop-1280.webp"
              srcset="/brand/halloween-exhibition-workshop-640.webp 640w, /brand/halloween-exhibition-workshop-1280.webp 1280w"
              sizes="(max-width: 760px) 91vw, (max-width: 1300px) 48vw, 610px"
              width="1280" height="960" :alt="t('halloweenExhibitionScene')" fetchpriority="high" decoding="async" />
          </figure>
        </div>
      </section>
      <section id="exhibition-projects" class="exhibition-width exhibition-library" aria-labelledby="exhibition-projects-title" tabindex="-1">
        <div class="exhibition-library-heading">
          <h2 id="exhibition-projects-title">{{ t('halloweenExhibitionProjects') }}</h2>
          <p>{{ t('halloweenExhibitionGuide') }}</p>
        </div>
        <div v-if="works.length" class="exhibition-tools">
          <div class="filters" role="group" :aria-label="t('class')">
            <button v-for="name in classes" :key="name" type="button" class="filter-button" :aria-pressed="selectedClass === name" @click="selectedClass = name">
              {{ name || t('allClasses') }}
            </button>
          </div>
          <p class="result-count" aria-live="polite">{{ t('workCount', { count: matching.length }) }}</p>
        </div>
        <div v-if="error" class="empty-state" role="alert">
          <h3>{{ t('projectsUnavailable') }}</h3>
          <button class="button button-secondary" type="button" :disabled="loading" @click="refresh">{{ t('reload') }}</button>
        </div>
        <p v-else-if="loading && !works.length" role="status">{{ t('projectsLoading') }}</p>
        <div v-else-if="matching.length" class="game-grid">
          <GameCard v-for="work in matching" :key="work.id" :game="work" :play-count="loaded ? (counts[work.id] ?? 0) : null" @play="play" />
        </div>
        <div v-else class="empty-state">
          <h3>{{ t('collectionEmpty') }}</h3>
          <p>{{ t('collectionEmptyText') }}</p>
        </div>
      </section>
    </main>
    <SiteFooter class="exhibition-width exhibition-footer" />
    <GamePlayerDialog v-if="selectedGame" :game="selectedGame" @close="selectedGame = null" />
  </div>
</template>
