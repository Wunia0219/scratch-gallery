<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLanguage } from '../i18n.js'
import { halloweenShowcase } from '../lib/halloweenShowcase.js'
import { halloweenTeaserMedia } from '../media.js'

const props = defineProps({ covers: { type: Array, required: true }, active: Boolean })
const { t } = useLanguage()
const reel = ref(null)
const frame = ref(0)
const finished = ref(false)
const inView = ref(false)
const pageVisible = ref(false)
const motionAllowed = ref(false)
const covers = computed(() => props.covers.map(cover => {
  const media = halloweenTeaserMedia[cover.id]
  // The client build resolves the HD poster to an assets URL. SSR can use the catalog cover.
  const poster = typeof window === 'undefined' ? cover.thumbnail : media?.poster ?? cover.thumbnail
  return { ...cover, clip: media?.clip, poster }
}))
const currentCover = computed(() => covers.value[frame.value] ?? covers.value[0])
const canPlay = computed(() => props.active && inView.value && pageVisible.value && motionAllowed.value)
const clip = computed(() => canPlay.value && !finished.value ? currentCover.value?.clip : undefined)
let observer
let motionPreference

function resetReel() {
  frame.value = 0
  finished.value = false
}
function nextClip() {
  if (!canPlay.value) return
  if (frame.value + 1 < props.covers.length) frame.value++
  else finished.value = true
}
watch(() => props.active, active => { if (!active) resetReel() })
watch(() => props.covers.map(cover => cover.id).join(','), resetReel)

function syncVisibility() { pageVisible.value = !document.hidden }
function syncMotion() { motionAllowed.value = !motionPreference?.matches }
onMounted(() => {
  motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  syncVisibility()
  syncMotion()
  document.addEventListener('visibilitychange', syncVisibility)
  motionPreference?.addEventListener?.('change', syncMotion)
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(([entry]) => {
      inView.value = entry.intersectionRatio >= 0.5
    }, { threshold: 0.5 })
    observer.observe(reel.value)
  } else inView.value = true
})
onBeforeUnmount(() => {
  observer?.disconnect()
  document.removeEventListener('visibilitychange', syncVisibility)
  motionPreference?.removeEventListener?.('change', syncMotion)
})
</script>

<template>
  <article class="halloween-announcement" aria-labelledby="halloween-announcement-title">
    <div class="showcase-night" aria-hidden="true">
      <span class="showcase-moon"></span>
      <svg class="showcase-bats" viewBox="0 0 178 77" fill="currentColor" stroke="none">
        <path d="M8 49q21-17 39-8l6-14 7 12q18-14 45-8-25 10-34 31-6-8-15-9l-8 10-6-11Q29 47 8 49Z"/>
        <path d="M79 14q12-7 21-2l4-8 4 7q10-7 24-2-13 4-18 15l-10-5-5 6q-5-9-20-11Z"/>
        <path d="M131 49q10-5 17-2l3-6 3 5q8-6 18-2-10 4-13 12l-7-4-4 5q-4-7-17-8Z"/>
      </svg>
      <svg class="showcase-lanterns" viewBox="0 0 220 105" fill="none" stroke="none">
        <path fill="#a48e68" d="M64 39c0-12-5-17-10-19l4-5c12 4 16 13 16 23zm94 40c1-8 4-12 10-15l3 4c-4 4-5 7-6 13z"/>
        <path fill="#b64e30" d="M65 36c-19-9-48 3-46 28 2 22 22 32 46 32s48-7 50-32c2-24-29-38-50-28Z"/>
        <ellipse cx="66" cy="66" rx="27" ry="30" fill="#dc7138"/>
        <path fill="#ffe0a0" d="m51 55-7 14h15zm30 0-7 14h15zM46 77q20 12 40 0-3 14-20 14T46 77Z"/>
        <path fill="#9a3e30" d="M160 74c-19-8-34 2-33 13 0 12 13 18 34 18 17 0 30-5 31-17 1-13-16-22-32-14Z"/>
        <ellipse cx="160" cy="88" rx="16" ry="17" fill="#bc5634"/>
        <path fill="#ffb577" d="m149 83-4 8h8zm19 0-4 8h8zm-18 13q10 7 20 0-2 7-10 7t-10-7Z"/>
      </svg>
    </div>
    <div class="halloween-announcement-copy">
      <h3 id="halloween-announcement-title" :aria-label="t('halloweenAnnouncementTitle')">
        <span>{{ t('halloweenAnnouncementSeason') }}</span>{{ t('halloweenAnnouncementFormat') }}
      </h3>
      <p>{{ t('halloweenAnnouncementText') }}</p>
      <a :href="halloweenShowcase.path" class="button halloween-showcase-button">
        {{ t('halloweenAnnouncementVisit') }}
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
      </a>
    </div>
    <figure ref="reel" class="showcase-reel" :aria-label="t('showcasePreview')">
      <div class="halloween-announcement-covers">
        <img v-for="(cover, index) in covers" :key="cover.id" :src="cover.poster"
          :alt="t('workCoverAlt', { title: cover.title })" :aria-hidden="index !== frame"
          :class="{ 'showcase-frame-current': index === frame }" width="480" height="360" loading="lazy" decoding="async">
        <video v-if="clip" :key="clip" :src="clip" :poster="currentCover.poster" autoplay muted playsinline
          preload="none" aria-hidden="true" @ended="nextClip" @error="nextClip"></video>
      </div>
      <figcaption class="showcase-reel-caption">
        <strong>{{ currentCover.title }}</strong>
        <ul v-if="covers.length > 1" class="showcase-reel-strip" aria-hidden="true">
          <li v-for="(cover, index) in covers" :key="cover.id" :class="{ 'showcase-strip-current': index === frame }">
            <img :src="cover.thumbnail" alt="" width="48" height="32" loading="lazy" decoding="async">
          </li>
        </ul>
      </figcaption>
    </figure>
  </article>
</template>
