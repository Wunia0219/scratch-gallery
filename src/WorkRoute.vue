<script setup>
import { inject, onMounted, ref, watch } from 'vue'
import WorkPage from './WorkPage.vue'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import { catalogRequest, catalogStateKey } from './composables/useGames.js'
import { useSiteState } from './composables/useSiteState.js'
import { useLanguage } from './i18n.js'
const props = defineProps({ id: { type: String, required: true } })
const data = ref(inject(catalogStateKey, null)), status = ref(data.value?.status ?? 200), loading = ref(false)
const { state } = useSiteState()
const { t } = useLanguage()
async function refresh() {
  loading.value = true
  try { data.value = await catalogRequest(`/api/works/${props.id}`); status.value = 200 } catch (reason) { data.value = null; status.value = reason.status ?? 503 } finally { loading.value = false }
}
watch(() => state.value.catalogRevision, value => { if (value && value !== data.value?.revision) { data.value = null; void refresh() } })
onMounted(refresh)
</script>
<template>
  <WorkPage v-if="data?.game" :key="data.revision" :game="data.game" :related="data.related" />
  <template v-else>
    <SiteHeader />
    <main id="main-content" class="work-intro">
      <h1>{{ t(loading ? 'projectsLoading' : status === 404 ? 'missingWork' : 'projectsUnavailable') }}</h1>
      <p v-if="!loading">{{ t(status === 404 ? 'missingWorkHelp' : 'tryReload') }}</p>
      <button v-if="status !== 404" class="button button-secondary" type="button" :disabled="loading" @click="refresh">{{ t('reload') }}</button>
      <p><a href="/students/">{{ t('backToGallery') }}</a></p>
    </main>
    <SiteFooter />
  </template>
</template>
