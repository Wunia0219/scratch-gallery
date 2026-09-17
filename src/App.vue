<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import GameCard from './components/GameCard.vue'
import { useGames } from './composables/useGames'
import { showcaseVideoUrl } from './media'
import packageInfo from '../package.json'
import { useLanguage } from './i18n'

const GamePlayerDialog = defineAsyncComponent(() => import('./components/GamePlayerDialog.vue'))
const HeroVideo = defineAsyncComponent(() => import('./components/HeroVideo.vue'))
const { games, classes, loading, error } = useGames()
const { language, t, setLanguage } = useLanguage()
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

const deviceFilters = [
  { id: 'all', label: 'allDevices' },
  { id: 'desktop', label: 'desktop' },
  { id: 'mobile', label: 'mobile' },
]

const visibleGames = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase('zh-Hant')
  return games.value.filter((game) => {
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
    </div>
    <nav aria-label="主要導覽">
      <a href="#games">{{ t('explore') }}</a><a href="#anita-games">{{ t('teacher') }}</a><a href="#learning">{{ t('learning') }}</a>
      <div class="language-switch" role="group" :aria-label="t('languageLabel')"><button type="button" :aria-pressed="language === 'zh-Hant'" @click="setLanguage('zh-Hant')">中</button><button type="button" :aria-pressed="language === 'en'" @click="setLanguage('en')">EN</button></div>
    </nav>
  </header>

  <main id="main-content">
    <section id="top" class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="partner-pill"><span aria-hidden="true"></span>東勢長頸鹿 × 鹿多多素養程式</p>
        <p class="eyebrow">CODE · CREATE · SHARE</p>
        <h1 id="hero-title">{{ t('hero') }}</h1><p class="hero-text">{{ t('heroText') }}</p>
        <div class="hero-actions">
          <a class="button button-primary" href="#games">
            {{ t('exploreStudents') }}
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
          </a>
          <a class="button button-secondary" href="#learning">{{ t('learning') }}</a>
        </div>
        <ul class="hero-highlights" aria-label="課程特色">
          <li><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>{{ t('learnByDoing') }}</li><li><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>{{ t('crossCurricular') }}</li><li><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>{{ t('confidentSharing') }}</li>
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
        <h2 id="learning-title">{{ t('learningTitle') }}</h2><p>{{ t('learningText') }}</p>
      </div>
      <div class="learning-grid">
        <article><span>01</span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 18h6M10 22h4M8.5 14.5A6 6 0 1 1 16 14c-1 .8-1.5 1.6-1.5 2.5h-5c0-.8-.4-1.4-1-2Z" /></svg><h3>{{ t('createTitle') }}</h3><p>{{ t('createText') }}</p></article>
        <article><span>02</span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8M8 12h5" /></svg><h3>{{ t('communicateTitle') }}</h3><p>{{ t('communicateText') }}</p></article>
        <article><span>03</span><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><path d="M3 20c0-3 2-5 5-5s5 2 5 5M11 20c0-3 2-5 5-5s5 2 5 5" /></svg><h3>{{ t('collaborateTitle') }}</h3><p>{{ t('collaborateText') }}</p></article>
        <article><span>04</span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M7 4v6M17 4v6M6 13h5v5H6zM14 13h4M14 17h4" /></svg><h3>{{ t('thinkTitle') }}</h3><p>{{ t('thinkText') }}</p></article>
      </div>
    </section>

    <section id="games" class="library" aria-labelledby="games-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">{{ t('studentShowcase') }}</p><h2 id="games-title">{{ t('creators') }}</h2>
        </div>
        <p class="result-count" aria-live="polite">
          {{ loading ? '讀取中…' : `共 ${visibleGames.length} 件作品` }}
        </p>
      </div>

      <div class="library-tools" role="search">
        <label class="search-field" for="game-search">
          <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></svg>
          <span class="sr-only">搜尋作品</span>
          <input id="game-search" v-model="query" type="search" :placeholder="t('search')" autocomplete="off" />
        </label>
        <div class="filter-groups">
          <div class="filter-group" role="group" aria-label="依班級篩選">
            <span class="filter-label">{{ t('class') }}</span>
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
            <span class="filter-label">{{ t('devices') }}</span>
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
                {{ t(device.label) }}
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
        <h3>{{ t('noMatches') }}</h3><p>{{ t('tryAgain') }}</p>
      </div>
    </section>

    <section id="anita-games" class="anita-library" aria-labelledby="anita-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">TEACHER'S LAB</p>
          <h2 id="anita-title">{{ t('teacherLab') }}</h2>
        </div>
        <p class="section-note">{{ t('teacherNote') }}</p>
      </div>
      <div class="game-grid anita-grid">
        <article class="game-card teacher-teaser-card">
          <div class="game-cover teaser-cover" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M9 18h6M10 22h4M8.5 14.5A6 6 0 1 1 16 14c-1 .8-1.5 1.6-1.5 2.5h-5c0-.8-.4-1.4-1-2Z" /></svg>
            <span class="game-status">{{ t('comingSoon') }}</span>
          </div>
          <div class="game-body">
            <div class="game-meta"><span>{{ t('teacherCollection') }}</span><span>{{ t('comingSoon') }}</span></div>
            <h3>{{ t('nextWork') }}</h3><p>{{ t('nextWorkText') }}</p>
          </div>
        </article>
      </div>
    </section>

    <section class="about" aria-labelledby="about-title">
      <div><p class="eyebrow">THE MAKING OF</p><h2 id="about-title">{{ t('making') }}</h2></div>
      <div class="about-points">
        <article><span>01</span><h3>{{ t('idea') }}</h3><p>{{ t('ideaText') }}</p></article>
        <article><span>02</span><h3>{{ t('build') }}</h3><p>{{ t('buildText') }}</p></article>
        <article><span>03</span><h3>{{ t('share') }}</h3><p>{{ t('shareText') }}</p></article>
      </div>
    </section>
  </main>

  <footer><p><strong>東勢長頸鹿美語</strong> · {{ t('footer') }} <span class="footer-version">{{ siteVersionLabel }}</span></p><p>{{ language === 'en' ? 'Knowledge gives us power. Character guides how we use it.' : '知識帶來力量；品格指引我們如何運用它。' }}</p></footer>

  <GamePlayerDialog v-if="selectedGame" :game="selectedGame" @close="selectedGame = null" />
  <HeroVideo v-if="videoOpen" @close="videoOpen = false" />
</template>
