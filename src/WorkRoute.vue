<script setup>
import { inject, onMounted, ref, watch } from 'vue'
import WorkPage from './WorkPage.vue'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import { catalogRequest, catalogStateKey } from './composables/useGames.js'
import { useSiteState } from './composables/useSiteState.js'
const props = defineProps({ id: { type: String, required: true } })
const data = ref(inject(catalogStateKey, null)), error = ref(''), status = ref(data.value?.status ?? 200), loading = ref(false)
const { state } = useSiteState()
async function refresh() {
  loading.value = true
  try { data.value = await catalogRequest(`/api/works/${props.id}`); error.value = ''; status.value = 200 } catch (reason) { data.value = null; error.value = reason.message; status.value = reason.status ?? 503 } finally { loading.value = false }
}
watch(() => state.value.catalogRevision, value => { if (value && value !== data.value?.revision) { data.value = null; void refresh() } })
onMounted(refresh)
</script>
<template>
  <WorkPage v-if="data?.game" :key="data.revision" :game="data.game" :related="data.related" />
  <template v-else><SiteHeader /><main id="main-content" class="work-intro"><h1>{{ loading ? '正在載入作品' : status === 404 ? '找不到這個作品' : '作品暫時無法載入' }}</h1><p>{{ error || (status === 404 ? '作品可能已移動或下架。' : '請稍後重新載入。') }}</p><button v-if="status !== 404" class="button button-secondary" type="button" :disabled="loading" @click="refresh">重新載入</button><p><a href="/students/">返回作品庫</a></p></main><SiteFooter /></template>
</template>
