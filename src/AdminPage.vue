<script setup>
import { computed, defineAsyncComponent, onMounted, onBeforeUnmount, reactive, ref } from 'vue'
import SiteFooter from './components/SiteFooter.vue'
import ActivityDraftPreview from './components/ActivityDraftPreview.vue'
import { initializeAdminAuth, signInAdmin, signOutAdmin, adminRequest } from './lib/adminAuth.js'
import { editableActivity, validateActivity } from './lib/activitySchema.js'
import previews from '../public/standalone-games.json'
import './admin.css'

const user = ref(null), configured = ref(false), ready = ref(false), authorized = ref(false)
const busy = ref(false), error = ref(''), notice = ref(''), records = ref([]), selected = ref(null)
const form = reactive({}), preview = ref(null), confirmation = ref(''), pendingOperation = ref(null)
const original = ref('')
const WorkAdmin = defineAsyncComponent(() => import('./components/WorkAdmin.vue'))
const section = ref('activities'), workAdmin = ref(null), workBusy = ref(false)
function switchSection(next) {
  if (busy.value || workBusy.value || next === section.value) return
  if (section.value === 'works' && !workAdmin.value?.canLeave()) return
  if (section.value === 'activities' && changed.value && !window.confirm('活動有尚未儲存的修改，要捨棄並切換嗎？')) return
  if (section.value === 'activities' && selected.value) { original.value = JSON.stringify(form); select(selected.value); preview.value = null }
  section.value = next
}
let unsubscribe
const dates = ['remindFrom', 'startsAt', 'endsAt']
const changed = computed(() => JSON.stringify(form) !== original.value)
const revision = computed(() => selected.value?.published?.revision ?? 0)
const draftRevision = computed(() => selected.value?.draft?.revision ?? 0)
function localDate(value) { return new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 19) }
function candidate() { return validateActivity({ ...form, ...Object.fromEntries(dates.map(key => [key, `${form[key]}+08:00`])) }, previews.map(item => item.id)) }
function select(record) {
  if (changed.value && !window.confirm('目前有尚未儲存的修改，要捨棄並切換活動嗎？')) return
  selected.value = record; preview.value = null; confirmation.value = ''; pendingOperation.value = null
  const data = editableActivity(record.draft ?? record.published)
  for (const key of Object.keys(form)) delete form[key]
  Object.assign(form, data, Object.fromEntries(dates.map(key => [key, localDate(data[key])])))
  original.value = JSON.stringify(form)
}
function addActivity() {
  const startsAt = new Date().toISOString(), endsAt = new Date(Date.now() + 14 * 86400000).toISOString()
  select({ id: `activity-${crypto.randomUUID()}`, published: null, draft: { id: `activity-${crypto.randomUUID()}`, templateKey: 'halloween', title: '新的萬聖節創作活動', titleEn: '', description: '請填寫活動介紹。', descriptionEn: '', remindFrom: startsAt, startsAt, endsAt, submissionUrl: 'https://forms.gle/bFmxHkUJjHcd5uw37', previewId: 'halloween-activity-intro', sortOrder: 0, revision: 0 } })
  selected.value.id = form.id
}
async function reload(keepId = selected.value?.id, confirmed = false) {
  if (!confirmed && changed.value && !window.confirm('重新載入會捨棄尚未儲存的修改，是否繼續？')) return
  const ownerUid = user.value?.uid
  const result = await adminRequest('activities')
  if (!ownerUid || user.value?.uid !== ownerUid) return
  records.value = result.activities
  authorized.value = true
  const record = records.value.find(item => item.id === keepId) ?? records.value[0]
  if (record) { original.value = JSON.stringify(form); select(record) }
}
async function run(task) {
  if (busy.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try { await task() } catch (reason) {
    const messages = { 'auth/popup-blocked': '登入視窗被瀏覽器封鎖。請允許本站開啟彈出視窗，再按登入。', 'auth/popup-closed-by-user': '登入視窗已關閉，可以再次按登入。', 'auth/unauthorized-domain': '這個網站尚未加入 Firebase 登入網域，請確認連接設定。', 'auth/network-request-failed': '登入服務暫時無法連接，請稍後再試。' }
    error.value = messages[reason.code] || reason.message
  } finally { busy.value = false }
}
function showPreview() {
  error.value = ''
  try { preview.value = candidate() } catch (reason) { error.value = reason.message }
}
async function mutate(action) {
  await run(async () => {
    const body = { id: form.id, action, expectedRevision: revision.value, expectedDraftRevision: draftRevision.value, ...(action !== 'hide' ? { activity: candidate(), makeFeatured: true } : {}) }
    const fingerprint = JSON.stringify(body)
    if (!pendingOperation.value || pendingOperation.value.fingerprint !== fingerprint) pendingOperation.value = { fingerprint, operationId: crypto.randomUUID() }
    const result = await adminRequest(action === 'save' ? 'activity-save' : 'activity-publish', { ...body, operationId: pendingOperation.value.operationId })
    pendingOperation.value = null; confirmation.value = ''
    await reload(form.id, true)
    notice.value = action === 'save' ? '草稿已儲存，前台仍顯示已發布版本。' : action === 'hide' ? '活動已關閉，前台將在約 30 秒內更新。' : '活動已發布，前台將在約 30 秒內更新。'
    if (result.cacheStatus === 'pending') notice.value += ' 快取會在期限內自動更新。'
  })
}
function requestPublish() {
  error.value = ''
  if (changed.value || !selected.value?.draft || draftRevision.value === 0) { error.value = '請先儲存目前草稿，再確認發布。'; return }
  showPreview()
  if (preview.value) confirmation.value = 'publish'
}
function beforeUnload(event) { if (changed.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(async () => {
  if (new URLSearchParams(window.location.search).get('section') === 'works') section.value = 'works'
  window.addEventListener('beforeunload', beforeUnload)
  await run(async () => {
    const response = await fetch('/api/admin/config', { cache: 'no-store' })
    if (!response.ok) throw new Error('後台連接設定暫時無法取得')
    const config = await response.json()
    configured.value = config.configured
    if (config.configured) unsubscribe = await initializeAdminAuth(config, async account => {
      user.value = account; authorized.value = false; records.value = []; selected.value = null
      preview.value = null; confirmation.value = ''; pendingOperation.value = null; notice.value = ''; error.value = ''
      for (const key of Object.keys(form)) delete form[key]
      original.value = JSON.stringify(form)
      if (account) {
        busy.value = true
        try { await reload() } catch (reason) { error.value = reason.message } finally { busy.value = false }
      }
    })
    ready.value = true
  })
})
onBeforeUnmount(() => { unsubscribe?.(); window.removeEventListener('beforeunload', beforeUnload) })
</script>

<template>
  <a class="skip-link" href="#admin-main">跳至管理內容</a>
  <div class="admin-shell">
    <header class="admin-header">
      <a class="brand" href="/"><img class="brand-logo" src="/brand/dongshi-giraffe-logo.webp" alt="" width="48" height="48"><span class="brand-name"><strong>東勢長頸鹿美語</strong><small>Scratch 創作館 · 管理後台</small></span></a>
      <div class="admin-account"><span v-if="user">{{ user.email }}</span><button v-if="user" type="button" :disabled="busy || workBusy" @click="(!workAdmin || workAdmin.canLeave()) && run(signOutAdmin)">登出</button><a href="/">返回網站</a></div>
    </header>
    <main id="admin-main" class="admin-main">
      <div class="admin-title"><p class="eyebrow">GALLERY ADMIN</p><h1>{{ section === 'works' ? '作品管理' : '活動管理' }}</h1><p>先儲存草稿，預覽確認後再公開。</p></div>
      <nav v-if="authorized" class="admin-tabs" aria-label="管理項目"><button type="button" :aria-current="section === 'activities' ? 'page' : undefined" :disabled="busy || workBusy" @click="switchSection('activities')">活動管理</button><button type="button" :aria-current="section === 'works' ? 'page' : undefined" :disabled="busy || workBusy" @click="switchSection('works')">作品管理</button></nav>
      <p v-if="error" class="admin-message admin-error" role="alert">{{ error }}</p>
      <p v-if="notice" class="admin-message" role="status">{{ notice }}</p>
      <section v-if="!user || !authorized" class="admin-panel admin-login" :aria-busy="busy">
        <h2>{{ user ? '確認管理權限' : '歡迎回到創作館' }}</h2>
        <p v-if="!ready">正在確認後台連接設定…</p>
        <p v-else-if="!configured">後台已準備好，等待完成 Firebase 連接設定。完成後即可使用 Google 帳號登入。</p>
        <template v-else-if="!user"><p>請使用站主管理帳號登入。</p><button class="admin-primary" type="button" :disabled="busy" @click="run(signInAdmin)"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 17l5-5-5-5M3 12h12M14 3h6v18h-6"/></svg>使用 Google 帳號登入</button></template>
        <template v-else><p>此 Google 帳號需要站主授權才可管理活動。</p><p class="admin-uid">管理員識別碼：<code>{{ user.uid }}</code></p><button type="button" :disabled="busy" @click="run(() => reload())">重新確認權限</button></template>
      </section>
      <WorkAdmin v-else-if="section === 'works'" ref="workAdmin" :key="user.uid" @busy="workBusy = $event" />
      <div v-else class="admin-workspace" :aria-busy="busy">
        <aside class="admin-panel admin-list"><div class="admin-panel-heading"><h2>所有活動</h2><button type="button" :disabled="busy" @click="addActivity">新增活動</button></div>
          <button v-for="record in records" :key="record.id" type="button" class="admin-activity-item" :aria-pressed="selected?.id === record.id" :disabled="busy" @click="select(record)"><strong>{{ (record.draft ?? record.published).title }}</strong><span>{{ record.published?.status === 'published' ? '已公開' : '未公開' }}<template v-if="record.draft"> · 有草稿</template></span></button>
          <button type="button" :disabled="busy" @click="run(() => reload())">重新載入</button>
        </aside>
        <section v-if="selected" class="admin-panel admin-editor"><div class="admin-panel-heading"><h2>編輯活動</h2><span class="admin-state">{{ selected.published?.status === 'published' ? '目前公開' : '目前未公開' }}</span></div>
          <p class="admin-help">使用現有萬聖節樣式。獎項與作品規格依既有介面呈現；新樣式會另行製作。</p>
          <form @submit.prevent="mutate('save')">
            <label>活動代號<input :value="form.id" readonly></label>
            <label>活動名稱<input v-model="form.title" required maxlength="120"></label>
            <label>英文名稱（選填）<input v-model="form.titleEn" maxlength="180"></label>
            <label>活動介紹<textarea v-model="form.description" required maxlength="2000" rows="4"></textarea></label>
            <label>英文介紹（選填）<textarea v-model="form.descriptionEn" maxlength="3000" rows="3"></textarea></label>
            <div class="admin-date-fields"><label>開始提醒（台灣時間）<input v-model="form.remindFrom" type="datetime-local" step="1" required></label><label>活動開始（台灣時間）<input v-model="form.startsAt" type="datetime-local" step="1" required></label><label>活動截止（台灣時間）<input v-model="form.endsAt" type="datetime-local" step="1" required></label></div>
            <label>Google 表單連結<input v-model="form.submissionUrl" type="url" required></label>
            <label>活動示範<select v-model="form.previewId"><option v-for="item in previews" :key="item.id" :value="item.id">{{ item.title }}</option></select></label>
            <div class="admin-editor-actions"><button class="admin-primary" type="submit" :disabled="busy">{{ busy ? '處理中…' : '儲存草稿' }}</button><button type="button" :disabled="busy" @click="showPreview">預覽活動</button><button class="admin-publish" type="button" :disabled="busy" @click="requestPublish">確認發布</button><button v-if="selected.published?.status === 'published'" type="button" :disabled="busy" @click="confirmation = 'hide'">關閉活動</button></div>
          </form>
          <div v-if="confirmation" class="admin-confirm" role="region" aria-label="確認活動操作"><h3>{{ confirmation === 'publish' ? '將這個版本公開到首頁？' : '將活動從前台關閉？' }}</h3><p>{{ confirmation === 'publish' ? '此活動會成為首頁主打活動，儲存的草稿將取代已發布版本。' : '訪客將看不到活動內容。已儲存的草稿會一併清除；之後可重新編輯並發布。' }}</p><button class="admin-primary" type="button" :disabled="busy" @click="mutate(confirmation)">{{ confirmation === 'publish' ? '發布到前台' : '確定關閉' }}</button><button type="button" :disabled="busy" @click="confirmation = ''">取消</button></div>
        </section>
      </div>
      <section v-if="preview" class="admin-preview"><div class="admin-panel-heading"><h2>草稿預覽</h2><button type="button" @click="preview = null">關閉預覽</button></div><p>這個預覽只有你看得到，尚未發布到前台。</p><ActivityDraftPreview :activity="preview" /></section>
    </main>
    <SiteFooter />
  </div>
</template>
