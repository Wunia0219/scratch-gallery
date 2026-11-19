<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, ref, watch } from 'vue'
import { formatActivityDate, getActivityPhase } from '../contentUpdates.js'
import { useSiteState } from '../composables/useSiteState.js'
import { catalogRequest } from '../composables/useGames.js'
import { useLanguage } from '../i18n'
import { useNow } from '../composables/useNow.js'
import { halloweenShowcase } from '../lib/halloweenShowcase.js'
import HalloweenAnnouncement from './HalloweenAnnouncement.vue'
import previews from '../../public/standalone-games.json'

const GamePlayerDialog = defineAsyncComponent(() => import('./GamePlayerDialog.vue'))
const VotingResults = defineAsyncComponent(() => import('./VotingResults.vue'))
const { t, language } = useLanguage()
const now = useNow()
const { activity, state } = useSiteState()
const availability = computed(() => state.value.availability)
const phase = computed(() => getActivityPhase(now.value, activity.value))
const dates = computed(() => activity.value ? ({ start: formatActivityDate(activity.value.startsAt, language.value, true), end: formatActivityDate(activity.value.endsAt, language.value, true) }) : {})
const status = computed(() => phase.value === 'upcoming' ? t('halloweenStatus', { date: formatActivityDate(activity.value.startsAt, language.value) }) : phase.value === 'closed' ? t('activityClosed') : t(phase.value === 'closing' ? 'activityReminderClosing' : 'activityReminderOpen'))
const submissionUrl = computed(() => activity.value?.submissionUrl)
const title = computed(() => language.value === 'en' ? activity.value?.titleEn || activity.value?.title || t('halloweenTitle') : activity.value?.title || t('halloweenTitle'))
const summary = computed(() => language.value === 'en' ? activity.value?.descriptionEn || activity.value?.description || t('halloweenSummary') : activity.value?.description || t('halloweenSummary'))
const previewOpen = ref(false)
const activityPublished = computed(() => Boolean(activity.value?.isPublished))
const halloweenPreview = computed(() => previews.find(preview => preview.id === activity.value?.previewId))
watch([activityPublished, halloweenPreview], () => { previewOpen.value = false })

const initialShowcase = state.value.halloweenShowcase
const covers = ref(initialShowcase?.covers ?? [])
const slides = computed(() => {
  const items = []
  if (covers.value.length) items.push({ id: 'showcase', title: t('halloweenShowcaseTitle'), date: halloweenShowcase.announcementDate })
  if (activityPublished.value) items.push({ id: 'challenge', title: title.value, date: activity.value.remindFrom || activity.value.startsAt })
  return items.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0))
})
const currentSlide = ref(0)
const activeAnnouncement = computed(() => slides.value[currentSlide.value]?.id)
const viewport = ref(null)
const navigation = ref(null)
let teaserRequest = 0

async function refreshShowcase() {
  const request = ++teaserRequest
  try {
    const data = await catalogRequest(halloweenShowcase.api + '?view=teaser')
    if (request === teaserRequest) covers.value = data.covers
  } catch {
    if (request === teaserRequest) covers.value = []
  }
}
onMounted(() => { if (!initialShowcase) void refreshShowcase() })
watch(() => state.value.catalogRevision, (revision, previous) => {
  if (revision && previous && revision !== previous) void refreshShowcase()
})
watch(() => slides.value.map(slide => slide.id).join(','), async () => {
  currentSlide.value = 0
  await nextTick()
  viewport.value?.scrollTo({ left: 0, behavior: 'instant' })
})

function showSlide(index) {
  if (index < 0 || index >= slides.value.length || index === currentSlide.value) return
  const carousel = viewport.value
  if (carousel) carousel.scrollTo({ left: index * carousel.clientWidth })
}
function updateSlide(event) {
  if (slides.value.length < 2) return
  const carousel = event.currentTarget
  if (!carousel.clientWidth) return
  const index = Math.min(slides.value.length - 1, Math.max(0, Math.round(carousel.scrollLeft / carousel.clientWidth)))
  if (index === currentSlide.value) return
  if (carousel.contains(document.activeElement)) {
    navigation.value?.querySelectorAll('button')[index ? 0 : 1]?.focus({ preventScroll: true })
  }
  currentSlide.value = index
}
</script>

<template>
  <section id="announcements" class="announcement-board" aria-labelledby="announcements-title">
    <div class="section-heading announcement-heading">
      <div>
        <p class="eyebrow">{{ t('announcementsEyebrow') }}</p>
        <h2 id="announcements-title">{{ t('announcementsTitle') }}</h2>
      </div>
      <div class="announcement-heading-actions">
        <p class="section-note">{{ t('announcementsIntro') }}</p>
        <div v-if="slides.length > 1" ref="navigation" class="announcement-navigation" role="group" :aria-label="t('announcementNavigation')"
          @keydown.left.prevent="showSlide(currentSlide - 1)" @keydown.right.prevent="showSlide(currentSlide + 1)">
          <button type="button" :aria-label="t('previousAnnouncement')" :aria-disabled="currentSlide === 0" aria-controls="announcement-slides" @click="showSlide(currentSlide - 1)">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6" /></svg>
          </button>
          <button type="button" :aria-label="t('nextAnnouncement')" :aria-disabled="currentSlide === slides.length - 1" aria-controls="announcement-slides" @click="showSlide(currentSlide + 1)">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </div>
      </div>
    </div>

    <div id="announcement-slides" ref="viewport" class="announcement-carousel" @scroll.passive="updateSlide">
      <template v-for="(slide, index) in slides" :key="slide.id">
      <HalloweenAnnouncement v-if="slide.id === 'showcase'" class="announcement-slide" :covers="covers"
        :active="index === currentSlide" :inert="index !== currentSlide" />
      <article v-else class="announcement-slide announcement-card announcement-card-halloween" :inert="index !== currentSlide">
      <div class="announcement-copy">
        <div class="announcement-meta">
          <span class="announcement-status"><span aria-hidden="true"></span>{{ status }}</span>
          <span class="announcement-label">{{ t('halloweenLabel') }}</span>
        </div>
        <p class="announcement-kicker">{{ t('challengeEyebrow') }}</p>
        <h3>{{ title }}</h3>
        <p class="announcement-summary">{{ summary }}</p>

        <section class="announcement-prizes" aria-labelledby="announcement-prizes-title">
          <h4 id="announcement-prizes-title">{{ t('halloweenPrizesTitle') }}</h4>
          <ol class="announcement-prizes-list">
            <li><span>{{ t('halloweenPrizeFirst') }}</span><strong>{{ t('halloweenPrizeFirstAmount') }}</strong></li>
            <li><span>{{ t('halloweenPrizeSecond') }}</span><strong>{{ t('halloweenPrizeSecondAmount') }}</strong></li>
            <li><span>{{ t('halloweenPrizeThird') }}</span><strong>{{ t('halloweenPrizeThirdAmount') }}</strong></li>
          </ol>
        </section>

        <ul class="announcement-details" :aria-label="t('halloweenDetailsLabel')">
          <li>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 5h14v15H5zM8 3v4M16 3v4M5 9h14"/><path d="m9 14 2 2 4-4"/></svg>
            <span><strong>{{ t('halloweenDatesTitle') }}</strong>{{ t('halloweenDates', dates) }}</span>
          </li>
          <li>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 5h14v14H5z"/><path d="m8 14 2.6-2.8 2.2 2.1 2.2-2.5L18 14M9 9h.01"/></svg>
            <span><strong>{{ t('halloweenFormatsTitle') }}</strong>{{ t('halloweenFormats') }}</span>
          </li>
          <li>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 14v5h14v-5"/></svg>
            <span><strong>{{ t('halloweenFileTitle') }}</strong>{{ t('halloweenFile') }}</span>
          </li>
        </ul>

        <div v-if="phase !== 'closed'" class="announcement-actions">
          <a class="button announcement-button" :href="submissionUrl" target="_blank" rel="noreferrer">
            {{ t('halloweenSubmit') }}
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 17 17 7M8 7h9v9" /></svg>
          </a>
        </div>
      </div>

      <div class="announcement-art">
        <svg class="halloween-moon" aria-hidden="true" viewBox="0 0 220 220">
          <circle cx="110" cy="110" r="86" />
          <path d="M62 69c16-24 45-37 74-32-23 7-39 29-39 55 0 34 27 61 61 61 7 0 14-1 20-3-15 28-45 47-79 45-47-3-83-43-80-90 1-13 5-25 12-36Z" />
        </svg>
        <svg class="halloween-stars" aria-hidden="true" viewBox="0 0 320 230">
          <path d="m34 48 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2 5-10ZM277 75l4 8 9 1-7 7 2 9-8-4-8 4 2-9-7-7 9-1 4-8Z" />
          <path d="M250 32c10 5 18 5 27 0M263 20c0 8 0 15 1 24M47 140c11 4 20 4 30-1M61 126c0 9 0 18 1 27" />
        </svg>
        <span class="halloween-bat halloween-bat-one"></span>
        <span class="halloween-bat halloween-bat-two"></span>
        <button v-if="halloweenPreview" class="announcement-preview" type="button" :aria-label="t('halloweenPreviewPlay')" @click="previewOpen = true">
          <img :src="halloweenPreview.thumbnail" :alt="t('halloweenPreviewAlt')" width="480" height="360" loading="lazy" decoding="async" />
          <span class="announcement-preview-badge">{{ t('halloweenPreviewLabel') }}</span>
          <span class="announcement-preview-play" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="m9 7 8 5-8 5V7Z" /></svg>
          </span>
        </button>
        <p>{{ t('halloweenArtLine') }}</p>
      </div>
      </article>
      </template>

      <article v-if="!slides.length" class="announcement-slide announcement-card announcement-card-halloween announcement-card-coming-soon">
        <div class="announcement-private-preview" aria-hidden="true">
          <div class="announcement-private-copy">
            <span class="announcement-private-pill"></span>
            <span class="announcement-private-title"></span>
            <span class="announcement-private-line"></span>
            <span class="announcement-private-line announcement-private-line-short"></span>
            <div class="announcement-private-details"><span></span><span></span><span></span></div>
          </div>
          <div class="announcement-private-art"></div>
        </div>
        <div class="announcement-coming-soon" role="status">
          <span class="announcement-coming-soon-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M6 3v4M18 3v4M4 9h16M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /><path d="M9 14h6M12 11v6" /></svg>
          </span>
          <p class="eyebrow">{{ t('announcementsEyebrow') }}</p>
          <h3>{{ availability === 'unavailable' ? (language === 'en' ? 'Events temporarily unavailable' : '活動資訊暫時無法載入') : availability === 'loading' ? (language === 'en' ? 'Loading events' : '正在讀取活動資訊') : t('activityComingSoon') }}</h3>
          <p>{{ availability === 'unavailable' ? (language === 'en' ? 'Please try again in a moment.' : '請稍後再試，或重新整理頁面。') : availability === 'loading' ? (language === 'en' ? 'Please wait a moment.' : '請稍候。') : t('activityComingSoonText') }}</p>
        </div>
      </article>
    </div>

    <div v-if="slides.length" class="announcement-pagination">
      <div v-if="slides.length > 1" class="announcement-indicators" role="group" :aria-label="t('announcementNavigation')"
        @keydown.left.prevent="showSlide(currentSlide - 1)" @keydown.right.prevent="showSlide(currentSlide + 1)">
        <button v-for="(slide, index) in slides" :key="slide.id" type="button" aria-controls="announcement-slides"
          :aria-label="t('announcementJump', { current: index + 1, title: slide.title })"
          :aria-current="index === currentSlide ? 'true' : undefined" @click="showSlide(index)">
          <span aria-hidden="true"></span>
        </button>
      </div>
      <p class="announcement-position" aria-live="polite">
        {{ t('announcementPosition', { current: currentSlide + 1, count: slides.length }) }}
      </p>
    </div>

    <VotingResults v-if="activityPublished" v-show="activeAnnouncement === 'challenge'" :key="activity.id" :activity-id="activity.id" />
    <GamePlayerDialog v-if="activityPublished && halloweenPreview && previewOpen" :game="halloweenPreview" @close="previewOpen = false" />
  </section>
</template>
