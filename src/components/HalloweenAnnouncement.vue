<script setup>
import { onMounted, ref, watch } from 'vue'
import { useSiteState } from '../composables/useSiteState.js'
import { catalogRequest } from '../composables/useGames.js'
import { useLanguage } from '../i18n.js'
import { halloweenShowcase } from '../lib/halloweenShowcase.js'

const { state } = useSiteState()
const { t } = useLanguage()
const initial = state.value.halloweenShowcase
const covers = ref(initial?.covers ?? [])
let requestId = 0
async function refresh() {
  const id = ++requestId
  try {
    const result = await catalogRequest(halloweenShowcase.api + '?view=teaser')
    if (id === requestId) covers.value = result.covers
  } catch {
    if (id === requestId) covers.value = []
  }
}
onMounted(() => { if (!initial) void refresh() })
watch(() => state.value.catalogRevision, (revision, previous) => {
  if (revision && previous && revision !== previous) void refresh()
})
</script>

<template>
  <article v-if="covers.length" class="halloween-announcement">
    <a :href="halloweenShowcase.path" class="halloween-announcement-link" aria-labelledby="halloween-announcement-title halloween-announcement-cta">
      <div class="halloween-announcement-copy">
        <h3 id="halloween-announcement-title">{{ t('halloweenShowcaseTitle') }}</h3>
        <p>{{ t('halloweenShowcaseTeaser') }}</p>
        <span id="halloween-announcement-cta" class="button halloween-showcase-button">
          {{ t('halloweenShowcaseVisit') }}
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
        </span>
      </div>
      <div class="halloween-announcement-covers" :class="{ 'halloween-announcement-covers-fewer': covers.length < 3 }">
        <img v-for="cover in covers" :key="cover.id" :src="cover.thumbnail" :alt="t('halloweenShowcaseCover', { title: cover.title })" width="480" height="360" loading="lazy" decoding="async">
      </div>
    </a>
  </article>
</template>
