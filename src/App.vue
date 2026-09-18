<script setup>
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { showcaseVideoUrl } from './media'
import packageInfo from '../package.json'
import { useLanguage } from './i18n'

const HeroVideo = defineAsyncComponent(() => import('./components/HeroVideo.vue'))
const AnnouncementBoard = defineAsyncComponent(() => import('./components/AnnouncementBoard.vue'))
const { language, t, setLanguage } = useLanguage()
const videoOpen = ref(false)
const heroVideo = ref(null)
const heroVideoPaused = ref(false)
const heroVideoInView = ref(true)
const siteVersion = packageInfo.version
const siteVersionLabel = siteVersion.endsWith('-beta')
  ? `Beta ${siteVersion.slice(0, -'-beta'.length)}`
  : `ver ${siteVersion}`
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
      <a href="/students/">{{ t('explore') }}</a><a href="#announcements">{{ t('announcementsNav') }}</a><a href="/teachers/">{{ t('teacher') }}</a><a class="learning-nav" href="#learning">{{ t('learning') }}</a>
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
          <a class="button button-primary" href="/students/">
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
      <a class="hero-scroll-cue" href="#announcements" :aria-label="t('viewAnnouncements')">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
      </a>
    </section>

    <AnnouncementBoard />

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

    <section class="collection-gateways" aria-labelledby="collections-title">
      <div class="section-heading">
        <div><p class="eyebrow">EXPLORE THE GALLERY</p><h2 id="collections-title">{{ t('chooseCollection') }}</h2></div>
        <p class="section-note">{{ t('collectionIntro') }}</p>
      </div>
      <div class="collection-grid">
        <a class="collection-card collection-card-student" href="/students/">
          <span class="collection-icon"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><path d="M3 20c0-3 2-5 5-5s5 2 5 5M11 20c0-3 2-5 5-5s5 2 5 5" /></svg></span>
          <span><small>STUDENT SHOWCASE</small><strong>{{ t('studentCollectionTitle') }}</strong><span>{{ t('studentCollectionText') }}</span></span>
          <svg class="collection-arrow" aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
        </a>
        <a class="collection-card collection-card-teacher" href="/teachers/">
          <span class="collection-icon"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 18h6M10 22h4M8.5 14.5A6 6 0 1 1 16 14c-1 .8-1.5 1.6-1.5 2.5h-5c0-.8-.4-1.4-1-2Z" /></svg></span>
          <span><small>TEACHER'S LAB</small><strong>{{ t('teacherCollectionTitle') }}</strong><span>{{ t('teacherCollectionText') }}</span></span>
          <svg class="collection-arrow" aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
        </a>
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

  <footer><p><strong>東勢長頸鹿美語</strong> · {{ t('footer') }} <span class="footer-version">{{ siteVersionLabel }}</span></p><p>Knowledge gives us power. Character guides how we use it.</p></footer>

  <HeroVideo v-if="videoOpen" @close="videoOpen = false" />
</template>
