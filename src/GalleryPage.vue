<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import GameCard from './components/GameCard.vue'
import SiteHeader from './components/SiteHeader.vue'
import { useGames } from './composables/useGames.js'
import { usePlayCounts } from './composables/usePlayCounts.js'
import { useLanguage } from './i18n.js'

const props = defineProps({ creatorType: { type: String, required: true } })
const GamePlayerDialog = defineAsyncComponent(() => import('./components/GamePlayerDialog.vue'))
const { games, classes } = useGames()
const { t } = useLanguage()
const query = ref('')
const selectedClass = ref('全部')
const selectedDevice = ref('all')
const visibleLimit = ref(9)
const selectedGame = ref(null)
const { counts: playCounts, loaded: playCountsLoaded, load: loadPlayCounts, record: recordPlay } = usePlayCounts()

const isTeacher = computed(() => props.creatorType === 'teacher')
const collection = computed(() => games.value.filter(game => isTeacher.value ? game.creatorType === 'teacher' : game.creatorType !== 'teacher'))
const filteredGames = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase('zh-Hant')
  return collection.value.filter(game => {
    const classMatches = selectedClass.value === '全部' || game.className === selectedClass.value
    const deviceMatches = selectedDevice.value === 'all' || (game.devices || []).includes(selectedDevice.value)
    const searchable = [game.title, game.description, game.category, game.className, game.student, ...(game.tags || [])]
      .join(' ').toLocaleLowerCase('zh-Hant')
    return classMatches && deviceMatches && (!needle || searchable.includes(needle))
  })
})
const visibleGames = computed(() => filteredGames.value.slice(0, visibleLimit.value))
const remaining = computed(() => Math.max(0, filteredGames.value.length - visibleGames.value.length))
const deviceFilters = [
  { id: 'all', label: 'allDevices' },
  { id: 'desktop', label: 'desktop' },
  { id: 'mobile', label: 'mobile' },
]

watch([query, selectedClass, selectedDevice], () => { visibleLimit.value = 9 })
onMounted(loadPlayCounts)

function play(game) {
  selectedGame.value = game
  void recordPlay(game.id)
}
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要內容</a>
  <SiteHeader :active="isTeacher ? 'teachers' : 'students'" />

  <main id="main-content">
    <section class="gallery-hero">
      <p class="eyebrow">{{ isTeacher ? "TEACHER'S LAB" : 'STUDENT SHOWCASE' }}</p>
      <h1>{{ isTeacher ? t('teacherGalleryTitle') : t('studentGalleryTitle') }}</h1>
      <p class="hero-text">{{ isTeacher ? t('teacherGalleryText') : t('studentGalleryText') }}</p>
      <p class="result-count" aria-live="polite">{{ t('workCount', { count: filteredGames.length }) }}</p>
    </section>

    <section class="gallery-library" :aria-label="isTeacher ? t('teacherCollectionNav') : t('studentCollectionNav')">
      <div class="library-tools" role="search">
        <label class="search-field" for="gallery-search">
          <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></svg>
          <span class="sr-only">搜尋作品</span>
          <input id="gallery-search" v-model="query" type="search" :placeholder="t('search')" autocomplete="off" />
        </label>
        <div class="filter-groups">
          <div v-if="!isTeacher" class="filter-group" role="group" :aria-label="t('class')">
            <span class="filter-label">{{ t('class') }}</span>
            <div class="filters"><button v-for="item in classes" :key="item" class="filter-button" type="button" :aria-pressed="selectedClass === item" @click="selectedClass = item">{{ item === '全部' ? t('allClasses') : item }}</button></div>
          </div>
          <div class="filter-group" role="group" :aria-label="t('devices')">
            <span class="filter-label">{{ t('devices') }}</span>
            <div class="filters device-filters">
              <button v-for="device in deviceFilters" :key="device.id" class="filter-button device-filter-button" type="button" :aria-pressed="selectedDevice === device.id" @click="selectedDevice = device.id">
                <svg v-if="device.id === 'desktop'" aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                <svg v-else-if="device.id === 'mobile'" aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="4" width="11" height="16" rx="2" /><rect x="16" y="7" width="5" height="11" rx="1.5" /><path d="M7 17h3M18 15.5h1" /></svg>
                {{ t(device.label) }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="visibleGames.length" class="game-grid">
        <GameCard v-for="game in visibleGames" :key="game.id" :game="game" :play-count="playCountsLoaded ? (playCounts[game.id] ?? 0) : null" @play="play" />
      </div>
      <div v-else class="empty-state">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6.5h16v11H4z" /><path d="M8 10h8M8 14h5" /></svg>
        <h2>{{ collection.length ? t('noMatches') : t('collectionEmpty') }}</h2>
        <p>{{ collection.length ? t('tryAgain') : t('collectionEmptyText') }}</p>
      </div>
      <div v-if="remaining" class="load-more">
        <button class="button button-secondary" type="button" @click="visibleLimit += 9">
          {{ t('showMore', { count: Math.min(9, remaining) }) }}
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        <p>{{ t('showingCount', { shown: visibleGames.length, total: filteredGames.length }) }}</p>
      </div>
    </section>
  </main>

  <footer><p><strong>東勢長頸鹿美語</strong> · {{ t('footer') }}</p><p>Knowledge gives us power. Character guides how we use it.</p></footer>
  <GamePlayerDialog v-if="selectedGame" :game="selectedGame" @close="selectedGame = null" />
</template>
