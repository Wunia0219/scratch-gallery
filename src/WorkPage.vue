<script setup>
import { defineAsyncComponent, onMounted, ref } from 'vue'
import GameCard from './components/GameCard.vue'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import { usePlayCounts } from './composables/usePlayCounts.js'
import { useLanguage } from './i18n.js'
defineProps({ game: { type: Object, required: true }, related: { type: Array, default: () => [] } })
const { t, categoryLabel } = useLanguage()
const GamePlayerDialog = defineAsyncComponent(() => import('./components/GamePlayerDialog.vue'))
const selectedGame = ref(null)
const { counts: playCounts, loaded: playCountsLoaded, load: loadPlayCounts, record: recordPlay } = usePlayCounts()
onMounted(loadPlayCounts)
function play(game) { selectedGame.value = game; void recordPlay(game.id) }
</script>
<template>
  <a class="skip-link" href="#main-content">{{ t('skipToMain') }}</a>
  <SiteHeader :active="game.creatorType === 'teacher' ? 'teachers' : 'students'" />
  <main id="main-content">
    <section class="work-intro">
      <p><a href="/">{{ t('home') }}</a> / <a :href="game.creatorType === 'teacher' ? '/teachers/' : '/students/'">{{ t(game.creatorType === 'teacher' ? 'teacherCollectionNav' : 'studentCollectionNav') }}</a> / {{ game.title }}</p>
      <p class="eyebrow">Scratch · {{ categoryLabel(game.category) }}</p>
      <h1>{{ game.title }}</h1>
      <p class="hero-text">{{ game.description }}</p>
      <p>{{ t('workCredit', { name: game.student }) }} · {{ game.creatorType === 'teacher' ? t('teacherWorkLabel') : game.className }}</p>
      <p>{{ t('workDevices') }} · {{ (game.devices || []).map(device => t(device)).join(' · ') || t('workDevicesFallback') }}</p>
      <div class="work-cover"><GameCard :game="game" :play-count="playCountsLoaded ? (playCounts[game.id] ?? 0) : null" @play="play" /></div>
      <noscript><p>{{ t('workNoScript') }}</p></noscript>
      <h2>{{ t('startPlaying') }}</h2>
      <p>{{ t('playingGuide') }}</p>
      <p v-if="game.controls">{{ game.controls }}</p>
      <p v-if="game.objective">{{ t('workGoal', { goal: game.objective }) }}</p>
    </section>
    <section v-if="related.length" class="work-related">
      <h2>{{ t('relatedWorks', { category: categoryLabel(game.category) }) }}</h2>
      <div class="game-grid"><GameCard v-for="item in related" :key="item.id" :game="item" :play-count="playCountsLoaded ? (playCounts[item.id] ?? 0) : null" @play="play" /></div>
    </section>
  </main>
  <SiteFooter work-page />
  <GamePlayerDialog v-if="selectedGame" :game="selectedGame" @close="selectedGame = null" />
</template>
