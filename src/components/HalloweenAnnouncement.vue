<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLanguage } from '../i18n.js'
import { halloweenShowcase } from '../lib/halloweenShowcase.js'

const props = defineProps({ covers: { type: Array, required: true }, active: Boolean })
const { t } = useLanguage()
const reel = ref(null)
const frame = ref(0)
const playing = ref(false)
const finished = ref(false)
const currentCover = computed(() => props.covers[frame.value] ?? props.covers[0])
const playbackLabel = computed(() => t(playing.value ? 'showcasePause' : finished.value ? 'showcaseReplay' : 'showcasePlay'))
let observer

function selectFrame(index) {
  playing.value = false
  finished.value = false
  frame.value = index
}
function togglePreview() {
  if (playing.value) { playing.value = false; return }
  if (finished.value) selectFrame(0)
  playing.value = true
}
watch(playing, (running, _, onCleanup) => {
  if (!running) return
  const timer = window.setInterval(() => {
    if (frame.value + 1 < props.covers.length) frame.value++
    else { playing.value = false; finished.value = true }
  }, 2400)
  onCleanup(() => window.clearInterval(timer))
})
watch(() => props.active, active => { if (!active) playing.value = false })
watch(() => props.covers.map(cover => cover.id).join(','), () => selectFrame(0))

function pauseInBackground() { if (document.hidden) playing.value = false }
onMounted(() => {
  document.addEventListener('visibilitychange', pauseInBackground)
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) playing.value = false })
    if (reel.value) observer.observe(reel.value)
  }
})
onBeforeUnmount(() => {
  observer?.disconnect()
  document.removeEventListener('visibilitychange', pauseInBackground)
})
</script>

<template>
  <article class="halloween-announcement" aria-labelledby="halloween-announcement-title">
    <div class="halloween-announcement-copy">
      <h3 id="halloween-announcement-title">{{ t('halloweenShowcaseTitle') }}</h3>
      <p>{{ t('halloweenShowcaseTeaser') }}</p>
      <a :href="halloweenShowcase.path" class="button halloween-showcase-button">
        {{ t('halloweenShowcaseVisit') }}
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
      </a>
    </div>
    <figure ref="reel" class="showcase-reel" :class="{ 'showcase-reel-playing': playing }">
      <div class="halloween-announcement-covers">
        <img v-for="(cover, index) in covers" :key="cover.id" :src="cover.thumbnail"
          :alt="t('halloweenShowcaseCover', { title: cover.title })" :aria-hidden="index !== frame"
          :class="{ 'showcase-frame-current': index === frame }" width="480" height="360" loading="lazy" decoding="async">
      </div>
      <figcaption class="showcase-reel-caption">
        <div class="showcase-reel-label">
          <span>{{ t('showcasePreview') }}</span>
          <strong>{{ currentCover.title }}</strong>
        </div>
        <button v-if="covers.length > 1" class="showcase-reel-play" type="button" :aria-label="playbackLabel" :title="playbackLabel" @click="togglePreview">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path v-if="playing" d="M9 5h1v14H9zm5 0h1v14h-1z" />
            <path v-else d="m8 5 11 7-11 7Z" />
          </svg>
        </button>
      </figcaption>
      <div v-if="covers.length > 1" class="showcase-reel-strip" role="group" :aria-label="t('showcasePreview')">
        <button v-for="(cover, index) in covers" :key="cover.id" type="button" :aria-label="cover.title"
          :aria-pressed="index === frame" @click="selectFrame(index)">
          <img :src="cover.thumbnail" alt="" width="76" height="44" loading="lazy" decoding="async">
        </button>
      </div>
    </figure>
  </article>
</template>
