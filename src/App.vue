<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import GameCard from './components/GameCard.vue'
import { useGames } from './composables/useGames'
import { showcaseVideoUrl } from './media'
import packageInfo from '../package.json'

const GamePlayerDialog = defineAsyncComponent(() => import('./components/GamePlayerDialog.vue'))
const HeroVideo = defineAsyncComponent(() => import('./components/HeroVideo.vue'))
const { games, classes, loading, error } = useGames()
const query = ref('')
const selectedClass = ref('全部')
const selectedDevice = ref('all')
const selectedGame = ref(null)
const videoOpen = ref(false)
const heroVideo = ref(null)
const heroVideoPaused = ref(false)
const heroVideoInView = ref(true)
const siteVersion = packageInfo.version
const siteVersionLabel = siteVersion.endsWith('-beta')
  ? `Beta ${siteVersion.slice(0, -'-beta'.length)}`
  : siteVersion
let heroVideoObserver

function syncHeroVideo() {
  if (!heroVideo.value) return
  const shouldPlay = heroVideoInView.value && !heroVideoPaused.value && !document.hidden
  if (shouldPlay) heroVideo.value.play().catch(() => {})
  else heroVideo.value.pause()
}

onMounted(() => {
  if ('IntersectionObserver' in window && heroVideo.value) {
    heroVideoObserver = new IntersectionObserver(([entry]) => {
      heroVideoInView.value = entry.isIntersecting
      syncHeroVideo()
    }, { threshold: 0.15 })
    heroVideoObserver.observe(heroVideo.value)
  }
  document.addEventListener('visibilitychange', syncHeroVideo)
})

onBeforeUnmount(() => {
  heroVideoObserver?.disconnect()
  document.removeEventListener('visibilitychange', syncHeroVideo)
})

function toggleHeroVideo(event) {
  event.stopPropagation()
  if (!heroVideo.value) return
  if (heroVideo.value.paused) {
    heroVideoPaused.value = false
    syncHeroVideo()
  } else {
    heroVideo.value.pause()
    heroVideoPaused.value = true
  }
}

const studentGames = computed(() => games.value.filter((game) => game.creatorType !== 'teacher'))
const anitaGames = computed(() => games.value.filter((game) => game.creatorType === 'teacher'))
const deviceFilters = [
  { id: 'all', label: '所有裝置' },
  { id: 'desktop', label: '電腦' },
  { id: 'mobile', label: '行動裝置' },
]

const visibleGames = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase('zh-Hant')
  return studentGames.value.filter((game) => {
    const classMatches = selectedClass.value === '全部' || game.className === selectedClass.value
    const deviceMatches = selectedDevice.value === 'all' || (game.devices || []).includes(selectedDevice.value)
    const searchable = [game.title, game.description, game.category, game.className, game.student, ...(game.tags || [])]
      .join(' ')
      .toLocaleLowerCase('zh-Hant')
    return classMatches && deviceMatches && (!needle || searchable.includes(needle))
  })
})
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要內容</a>

  <header class="site-header">
    <div class="brand-group">
      <a class="brand" href="#top" aria-label="Scratch 學習館首頁">
        <img class="brand-logo" src="/brand/dongshi-giraffe-logo.webp" alt="" width="48" height="48" />
        <span class="brand-name"><strong>東勢長頸鹿美語</strong><small>Scratch 創作館</small></span>
      </a>
      <span class="version-badge" :aria-label="`網站版本 ${siteVersionLabel}`">{{ siteVersionLabel }}</span>
    </div>
    <nav aria-label="主要導覽">
      <a href="#games">探索作品</a>
      <a href="#anita-games">老師作品集</a>
      <a href="#learning">學習理念</a>
    </nav>
  </header>

  <main id="main-content">
    <section id="top" class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="partner-pill"><span aria-hidden="true"></span>東勢長頸鹿 × 鹿多多素養程式</p>
        <p class="eyebrow">CODE · CREATE · SHARE</p>
        <h1 id="hero-title">孩子寫的程式，<br /><em>讓全世界看見。</em></h1>
        <p class="hero-text">這裡是東勢長頸鹿美語的 Scratch 創作成果展。從一個想法出發，孩子練習邏輯、表達與解決問題，親手做出可以玩的作品。</p>
        <div class="hero-actions">
          <a class="button button-primary" href="#games">
            探索學生作品
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
          </a>
          <a class="button button-secondary" href="#learning">學習理念</a>
        </div>
        <ul class="hero-highlights" aria-label="課程特色">
          <li><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>做中學</li>
          <li><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>跨域創作</li>
          <li><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>自信分享</li>
        </ul>
      </div>
      <div class="hero-art">
        <div class="video-frame-shadow" aria-hidden="true"></div>
        <div class="art-card art-card-main hero-video-frame">
          <video ref="heroVideo" autoplay muted loop playsinline preload="metadata" tabindex="-1" aria-hidden="true">
            <source :src="showcaseVideoUrl" type="video/mp4" />
          </video>
          <div class="hero-video-actions">
            <button class="hero-video-control" type="button" :title="heroVideoPaused ? '播放影片' : '暫停影片'" :aria-label="heroVideoPaused ? '播放預覽影片' : '暫停預覽影片'" @click="toggleHeroVideo">
              <svg v-if="heroVideoPaused" aria-hidden="true" viewBox="0 0 24 24"><path d="m9 7 8 5-8 5V7Z" /></svg>
              <svg v-else aria-hidden="true" viewBox="0 0 24 24"><path d="M9 7v10M15 7v10" /></svg>
            </button>
            <button class="hero-video-control" type="button" title="全螢幕播放" aria-label="全螢幕播放並開啟聲音" @click="videoOpen = true">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /></svg>
            </button>
          </div>
        </div>
        <span class="video-frame-accent video-frame-accent-top" aria-hidden="true"></span>
        <span class="video-frame-accent video-frame-accent-bottom" aria-hidden="true"></span>
        <div class="hero-brand-stamp">
          <img src="/brand/dongshi-giraffe-logo.webp" alt="東勢長頸鹿美語台中東勢分校" width="104" height="104" />
          <span><strong>東勢長頸鹿美語</strong><br />鹿多多 Scratch 創作課</span>
        </div>
      </div>
    </section>

    <section id="learning" class="learning-story" aria-labelledby="learning-title">
      <div class="learning-intro">
        <p class="eyebrow">ENGLISH × CODING</p>
        <h2 id="learning-title">不只學會操作，<br />更學會把想法做出來</h2>
        <p>長頸鹿美語從語言學習出發，鹿多多素養程式延伸孩子的運算思維。作品展記錄的不只是完成品，更是孩子反覆嘗試、修正與分享的過程。</p>
      </div>
      <div class="learning-grid">
        <article><span>01</span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 18h6M10 22h4M8.5 14.5A6 6 0 1 1 16 14c-1 .8-1.5 1.6-1.5 2.5h-5c0-.8-.4-1.4-1-2Z" /></svg><h3>創造 Create</h3><p>從故事、角色到遊戲規則，把腦中的點子化成作品。</p></article>
        <article><span>02</span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8M8 12h5" /></svg><h3>溝通 Communicate</h3><p>說明玩法與設計選擇，練習讓別人理解自己的想法。</p></article>
        <article><span>03</span><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><path d="M3 20c0-3 2-5 5-5s5 2 5 5M11 20c0-3 2-5 5-5s5 2 5 5" /></svg><h3>合作 Collaborate</h3><p>觀摩同學、交換回饋，在彼此作品裡找到新方法。</p></article>
        <article><span>04</span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M7 4v6M17 4v6M6 13h5v5H6zM14 13h4M14 17h4" /></svg><h3>思考 Think</h3><p>拆解問題、測試條件，從錯誤中找出更好的解法。</p></article>
      </div>
    </section>

    <section id="games" class="library" aria-labelledby="games-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">STUDENT SHOWCASE</p>
          <h2 id="games-title">今天，換孩子當創作者</h2>
        </div>
        <p class="result-count" aria-live="polite">
          {{ loading ? '讀取中…' : `共 ${visibleGames.length} 件作品` }}
        </p>
      </div>

      <div class="library-tools" role="search">
        <label class="search-field" for="game-search">
          <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></svg>
          <span class="sr-only">搜尋作品</span>
          <input id="game-search" v-model="query" type="search" placeholder="搜尋作品、學生或主題" autocomplete="off" />
        </label>
        <div class="filter-groups">
          <div class="filter-group" role="group" aria-label="依班級篩選">
            <span class="filter-label">班級</span>
            <div class="filters">
              <button
                v-for="item in classes"
                :key="item"
                class="filter-button"
                type="button"
                :aria-pressed="selectedClass === item"
                @click="selectedClass = item"
              >
                {{ item }}
              </button>
            </div>
          </div>
          <div class="filter-group" role="group" aria-label="依可遊玩裝置篩選">
            <span class="filter-label">可遊玩裝置</span>
            <div class="filters device-filters">
              <button
                v-for="device in deviceFilters"
                :key="device.id"
                class="filter-button device-filter-button"
                type="button"
                :aria-pressed="selectedDevice === device.id"
                @click="selectedDevice = device.id"
              >
                <svg v-if="device.id === 'desktop'" aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
                <svg v-else-if="device.id === 'mobile'" aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="4" width="11" height="16" rx="2" /><rect x="16" y="7" width="5" height="11" rx="1.5" /><path d="M7 17h3M18 15.5h1" /></svg>
                {{ device.label }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <p v-if="error" class="data-error" role="alert">{{ error }}</p>
      <div v-else class="game-grid" :aria-busy="loading">
        <GameCard v-for="game in visibleGames" :key="game.id" :game="game" @play="selectedGame = $event" />
      </div>
      <div v-if="!loading && !error && visibleGames.length === 0" class="empty-state">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6.5h16v11H4z" /><path d="M8 10h8M8 14h5" /></svg>
        <h3>還沒有符合的作品</h3>
        <p>換個關鍵字或篩選條件，繼續探索孩子們的創意作品吧！</p>
      </div>
    </section>

    <section id="anita-games" class="anita-library" aria-labelledby="anita-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">TEACHER'S LAB</p>
          <h2 id="anita-title">Anita 老師的創作實驗室</h2>
        </div>
      </div>
      <div v-if="anitaGames.length" class="game-grid anita-grid">
        <GameCard v-for="game in anitaGames" :key="game.id" :game="game" @play="selectedGame = $event" />
      </div>
      <div v-else class="empty-state anita-empty">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 7 8 5-8 5V7Z" /><rect x="3" y="3" width="18" height="18" rx="4" /></svg>
        <h3>Anita 的創作專區已經準備好</h3>
        <p>下次匯入你的 SB3 時加上 <code>--teacher</code>，作品就會顯示在這裡。</p>
      </div>
    </section>

    <section class="about" aria-labelledby="about-title">
      <div><p class="eyebrow">THE MAKING OF</p><h2 id="about-title">一份作品，<br />三段成長</h2></div>
      <div class="about-points">
        <article><span>01</span><h3>發想 Idea</h3><p>從生活觀察與故事想像出發，定義角色、目標與玩法。</p></article>
        <article><span>02</span><h3>實作 Build</h3><p>用積木程式逐步測試，讓角色、互動與規則真的運作。</p></article>
        <article><span>03</span><h3>發表 Share</h3><p>以創作者署名公開展示，邀請家長與朋友親自遊玩。</p></article>
      </div>
    </section>
  </main>

  <footer><p><strong>東勢長頸鹿美語</strong> · Scratch 創作成果展 <span class="footer-version">{{ siteVersionLabel }}</span></p><p>Knowledge is power. Character is more.</p></footer>

  <GamePlayerDialog v-if="selectedGame" :game="selectedGame" @close="selectedGame = null" />
  <HeroVideo v-if="videoOpen" @close="videoOpen = false" />
</template>
