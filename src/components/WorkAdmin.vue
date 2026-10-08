<script setup>
import { computed, defineAsyncComponent, onMounted, onBeforeUnmount, reactive, ref } from 'vue'
import { adminRequest } from '../lib/adminAuth.js'
import { editableWork, validateWork, publicWork } from '../lib/workSchema.js'
import GameCard from './GameCard.vue'
const emit = defineEmits(['busy'])
const GamePlayerDialog = defineAsyncComponent(() => import('./GamePlayerDialog.vue'))
const records = ref([]), creators = ref([]), selected = ref(null), filter = ref('all'), query = ref('')
const form = reactive({}), tags = ref(''), original = ref(''), busy = ref(false), error = ref(''), notice = ref(''), confirmation = ref(''), preview = ref(null), playing = ref(null), history = ref([])
let operation
const snapshot = () => JSON.stringify({ ...form, tags: tags.value })
const changed = computed(() => snapshot() !== original.value)
const visible = computed(() => records.value.filter(work => (filter.value === 'all' || work.status === filter.value) && [work.title, creators.value.find(creator => creator.id === work.creatorId)?.name, work.id].join(' ').includes(query.value.trim())))
function canLeave() { return !busy.value && (!changed.value || window.confirm('作品有尚未儲存的修改，要捨棄嗎？')) }
defineExpose({ canLeave })
function select(record, force = false) {
  if (!force && !canLeave()) return
  selected.value = record
  for (const key of Object.keys(form)) delete form[key]
  Object.assign(form, editableWork(record.draft ?? record)); tags.value = form.tags.join('、')
  original.value = snapshot(); preview.value = null; confirmation.value = ''; history.value = []; playing.value = null; operation = null
}
function candidate() { return validateWork({ ...form, tags: tags.value.split(/[,，、]/).map(value => value.trim()).filter(Boolean) }, selected.value.asset, creators.value.find(creator => creator.id === form.creatorId)) }
async function reload(id = selected.value?.id) {
  const result = await adminRequest('works')
  records.value = result.works; creators.value = result.creators
  const record = records.value.find(work => work.id === id) ?? records.value[0]
  if (record) select(record, true)
}
async function run(task) {
  if (busy.value) return
  busy.value = true; emit('busy', true); error.value = ''; notice.value = ''
  try { await task() } catch (reason) { error.value = reason.message } finally { busy.value = false; emit('busy', false) }
}
function showPreview() {
  try { const work = candidate(); preview.value = publicWork({ ...work, publishedAt: selected.value.publishedAt, revision: selected.value.revision }, selected.value.asset, creators.value.find(creator => creator.id === work.creatorId)); error.value = '' } catch (reason) { error.value = reason.message }
}
function requestPublish() {
  if (changed.value || !selected.value?.draft) { error.value = '請先儲存目前草稿，再確認上架。'; return }
  if (!selected.value.assetsReady) { error.value = '尚未確認此版本的遊戲檔案已部署，請先完成資源登錄。'; return }
  showPreview(); if (preview.value) confirmation.value = 'publish'
}
async function mutate(action, historyRevision) {
  await run(async () => {
    const id = selected.value.id
    const body = { id, action, expectedRevision: selected.value.revision, expectedDraftRevision: selected.value.draft?.revision ?? 0, ...(['save', 'publish'].includes(action) ? { work: candidate() } : {}), ...(action === 'restore' ? { historyRevision } : {}) }
    const fingerprint = JSON.stringify(body)
    if (operation?.fingerprint !== fingerprint) operation = { fingerprint, operationId: crypto.randomUUID() }
    const result = await adminRequest('work-mutate', { ...body, operationId: operation.operationId })
    operation = null; await reload(id)
    notice.value = ['save', 'restore'].includes(action) ? '草稿已儲存，前台維持原公開內容。' : action === 'hide' ? '作品已下架，前台約 30 秒內更新。' : '作品已上架，前台約 30 秒內更新。首次上架日期已保留。'
    if (result.cacheStatus === 'pending') notice.value += ' 快取將於期限內更新。'
  })
}
function date(value) { return value ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Taipei' }).format(new Date(value)) : '舊作品未記錄日期' }
function beforeUnload(event) { if (changed.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => { original.value = snapshot(); window.addEventListener('beforeunload', beforeUnload); void run(reload) })
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
</script>
<template>
  <div class="work-admin">
    <p class="admin-help">遊戲先於本機打包並部署，再於這裡確認上架。首次上架開始顯示 NEW 15 天；修改與重新上架不會重算。</p>
    <p v-if="error" class="admin-message admin-error" role="alert">{{ error }}</p><p v-if="notice" class="admin-message" role="status">{{ notice }}</p>
    <div class="admin-workspace" :aria-busy="busy">
      <aside class="admin-panel admin-list"><div class="admin-panel-heading"><h2>作品清單</h2><span>{{ records.length }} 件</span></div>
        <label>搜尋作品<input v-model="query" type="search" placeholder="名稱、作者或代號"></label>
        <label>上架狀態<select v-model="filter"><option value="all">全部作品</option><option value="published">已上架</option><option value="draft">待上架</option><option value="unlisted">已下架</option></select></label>
        <button v-for="work in visible" :key="work.id" class="admin-activity-item" type="button" :aria-pressed="selected?.id === work.id" :disabled="busy" @click="select(work)"><strong>{{ (work.draft ?? work).title }}</strong><span>{{ creators.find(creator => creator.id === work.creatorId)?.name }} · {{ work.status === 'published' ? '已上架' : work.status === 'unlisted' ? '已下架' : '待上架' }}{{ work.draft ? ' · 有草稿' : '' }}</span></button>
        <p v-if="!records.length && !busy">尚無作品，請先透過本機工具登錄打包檔案。</p><button type="button" :disabled="busy" @click="canLeave() && run(() => reload())">重新載入</button>
      </aside>
      <section v-if="selected" class="admin-panel admin-editor"><div class="admin-panel-heading"><h2>編輯作品</h2><span class="admin-state">{{ selected.assetsReady ? '資源已確認' : '等待資源部署' }}</span></div>
        <p class="admin-help">{{ selected.hasPublished ? `首次上架：${date(selected.publishedAt)}` : '首次上架時間將於確認上架時記錄。' }}<br>公開版本 {{ selected.revision }} · 草稿版本 {{ selected.draft?.revision ?? 0 }}</p>
        <form @submit.prevent="mutate('save')"><fieldset class="admin-edit-fields" :disabled="busy"><label>作品代號<input :value="form.id" readonly></label>
          <label>作品名稱<input v-model="form.title" maxlength="120" required></label><label>作者<select v-model="form.creatorId"><option v-for="creator in creators" :key="creator.id" :value="creator.id">{{ creator.name }} · {{ creator.className }} · {{ creator.role === 'teacher' ? '老師' : '學生' }}</option></select></label>
          <label>作品介紹<textarea v-model="form.description" rows="4" maxlength="2000" required></textarea></label><label>分類<input v-model="form.category" maxlength="80" required></label><label>標籤（以頓號或逗號分隔）<input v-model="tags" maxlength="500"></label>
          <fieldset class="admin-devices"><legend>適用裝置</legend><label><input v-model="form.devices" type="checkbox" value="desktop">電腦</label><label><input v-model="form.devices" type="checkbox" value="mobile">行動裝置</label></fieldset>
          <label>操作說明<textarea v-model="form.controls" rows="2" maxlength="1000"></textarea></label><label>遊戲目標<textarea v-model="form.objective" rows="2" maxlength="1000"></textarea></label>
          <label>封面<select v-model="form.thumbnail"><option v-for="path in selected.asset?.thumbnails ?? []" :key="path" :value="path">{{ path.split('/').at(-1) }}</option></select></label>
          <label>排序優先值<input v-model.number="form.sortOrder" type="number" min="-9999" max="9999" required><small>數字小的排前面；相同數字依首次上架時間由新到舊。</small></label>
          <div class="admin-editor-actions"><button class="admin-primary" type="submit" :disabled="busy">儲存草稿</button><button type="button" :disabled="busy" @click="showPreview">預覽作品</button><button class="admin-publish" type="button" :disabled="busy || !selected.assetsReady" @click="requestPublish">確認上架</button><button v-if="selected.status === 'published'" type="button" :disabled="busy" @click="confirmation = 'hide'">下架作品</button><button type="button" :disabled="busy" @click="run(async () => { history = (await adminRequest(`work-history?id=${selected.id}`)).history })">版本紀錄</button></div>
        </fieldset></form>
        <div v-if="confirmation" class="admin-confirm"><h3>{{ confirmation === 'publish' ? '將此版本上架到作品庫？' : '將作品從前台下架？' }}</h3><p>{{ confirmation === 'publish' ? selected.hasPublished ? '已儲存的草稿將取代公開介紹。首次上架日期維持不變。' : '將記錄第一次上架時間，NEW 從此刻開始計算 15 天。' : '作品庫、介紹頁與 sitemap 將移除這個作品。遊戲檔案仍可能經直接網址開啟；未儲存的編輯將捨棄，已儲存草稿會清除。' }}</p><button class="admin-primary" type="button" :disabled="busy" @click="mutate(confirmation)">確定{{ confirmation === 'publish' ? '上架' : '下架' }}</button><button type="button" :disabled="busy" @click="confirmation = ''">取消</button></div>
        <div v-if="history.length" class="admin-history"><h3>最近 10 個公開版本</h3><p>還原會建立草稿；確認上架後才公開。</p><div v-for="entry in history" :key="entry.revision"><span>版本 {{ entry.revision }} · {{ entry.content.title }} · {{ date(entry.createdAt) }}</span><button type="button" :disabled="busy" @click="canLeave() && mutate('restore', entry.revision)">還原成草稿</button></div></div>
      </section>
    </div>
    <section v-if="preview" class="admin-preview admin-panel"><div class="admin-panel-heading"><h2>草稿預覽</h2><button type="button" @click="preview = null; playing = null">關閉預覽</button></div><p>尚未公開。封面可開啟遊戲，作品名稱的連結會顯示目前公開版本。</p><div class="admin-work-preview"><GameCard :game="preview" @play="playing = preview" /></div><p>{{ preview.controls }}</p><p>{{ preview.objective }}</p></section>
    <GamePlayerDialog v-if="playing" :game="playing" @close="playing = null" />
  </div>
</template>
