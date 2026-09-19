<script setup>
import { defineAsyncComponent, onMounted, ref } from 'vue'
import GameCard from './components/GameCard.vue'
import SiteHeader from './components/SiteHeader.vue'
import { catalog } from './composables/useGames.js'
import { usePlayCounts } from './composables/usePlayCounts.js'
const props = defineProps({ game: { type: Object, required: true } })
const GamePlayerDialog = defineAsyncComponent(() => import('./components/GamePlayerDialog.vue'))
const selectedGame = ref(null)
const related = catalog.filter(g => g.id !== props.game.id && g.category === props.game.category).slice(0, 3)
const { counts: playCounts, loaded: playCountsLoaded, load: loadPlayCounts, record: recordPlay } = usePlayCounts()
onMounted(loadPlayCounts)
function play(game) { selectedGame.value = game; void recordPlay(game.id) }
</script>
<template>
  <a class="skip-link" href="#main-content">跳到主要內容</a>
  <SiteHeader :active="game.creatorType === 'teacher' ? 'teachers' : 'students'" />
  <main id="main-content">
    <section class="work-intro">
      <p><a href="/">首頁</a> / <a :href="game.creatorType === 'teacher' ? '/teachers/' : '/students/'">{{ game.creatorType === 'teacher' ? '老師作品' : '學生作品' }}</a> / {{ game.title }}</p>
      <p class="eyebrow">SCRATCH · {{ game.category }}</p>
      <h1>{{ game.title }}</h1>
      <p class="hero-text">{{ game.description }}</p>
      <p>創作者：{{ game.student }} · {{ game.className }}</p>
      <p>適用裝置：{{ (game.devices || []).map(d => d === 'desktop' ? '電腦' : '行動裝置').join('、') || '請依作品實際操作體驗' }}</p>
      <div class="work-cover"><GameCard :game="game" :play-count="playCountsLoaded ? (playCounts[game.id] ?? 0) : null" @play="play" /></div>
      <noscript><p>作品介紹不需要 JavaScript；遊玩 Scratch 作品時，請開啟瀏覽器的 JavaScript。</p></noscript>
      <h2>如何開始遊玩</h2>
      <p>點選作品封面開啟播放器，再按播放按鈕或綠旗開始。可使用播放器的暫停、停止及全螢幕控制；關閉視窗即可結束。</p>
      <p v-if="game.controls">{{ game.controls }}</p>
      <p v-if="game.objective">遊戲目標：{{ game.objective }}</p>
    </section>
    <section v-if="related.length" class="work-related">
      <h2>更多{{ game.category }}作品</h2>
      <div class="game-grid"><GameCard v-for="item in related" :key="item.id" :game="item" :play-count="playCountsLoaded ? (playCounts[item.id] ?? 0) : null" @play="play" /></div>
    </section>
  </main>
  <footer><p>東勢長頸鹿美語 · Scratch 創作成果展</p><p>本網站並非 Scratch 官方網站。</p></footer>
  <GamePlayerDialog v-if="selectedGame" :game="selectedGame" @close="selectedGame = null" />
</template>
