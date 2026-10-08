<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue'
import { adminRequest, adminDownload } from '../lib/adminAuth.js'
import { editableVoting, validateVoting } from '../lib/votingSchema.js'
import VotingConnectionGuide from './VotingConnectionGuide.vue'
const emit = defineEmits(['busy'])
const records = ref([]), works = ref([]), selected = ref(null), busy = ref(false), error = ref(''), notice = ref(''), original = ref(''), confirmation = ref(''), reason = ref(''), visibility = ref('live')
const form = reactive({}), selectedIds = ref([]), exportVersion = ref(1), connectionReady = ref(false), connectionUrl = ref('')
let operation, alive = true
const snapshot = () => JSON.stringify({ ...form, selectedIds: selectedIds.value, connectionUrl: connectionUrl.value })
const changed = computed(() => snapshot() !== original.value)
const frozen = computed(() => Boolean(selected.value?.config))
const summary = computed(() => selected.value?.summary)
const counts = computed(() => selected.value?.final ?? summary.value)
function canLeave() { return !busy.value && (!changed.value || window.confirm('投票有尚未儲存的修改，要捨棄嗎？')) }
defineExpose({ canLeave })
function localDate(value) { return new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 19) }
function select(record, force = false) {
  if (!force && !canLeave()) return
  selected.value = record; confirmation.value = ''; reason.value = ''; operation = null
  const value = record.draft ?? record.config ?? { activityId: record.id, title: `${record.title} · 作品票選`, voteStartsAt: new Date().toISOString(), voteEndsAt: new Date(Date.now() + 7 * 86400000).toISOString(), maxChoices: 1, resultsVisibility: 'live', entries: [], formId: '', formUrl: '', questionItemId: '', controlUrl: '' }
  for (const key of Object.keys(form)) delete form[key]
  Object.assign(form, editableVoting(value), { voteStartsAt: localDate(value.voteStartsAt), voteEndsAt: localDate(value.voteEndsAt) })
  selectedIds.value = value.entries.map(item => item.workId); visibility.value = value.resultsVisibility
  connectionUrl.value = value.controlUrl || ''; original.value = snapshot(); exportVersion.value = record.final?.resultVersion ?? 1
}
function entries() {
  const existing = form.entries || []
  return selectedIds.value.map((workId, index) => ({ code: `W${String(index + 1).padStart(3, '0')}`, workId, title: existing.find(item => item.workId === workId)?.title ?? works.value.find(item => item.id === workId)?.title ?? '' }))
}
function candidate(allowUnbound = false) {
  return validateVoting({ ...form, entries: entries(), voteStartsAt: `${form.voteStartsAt}+08:00`, voteEndsAt: `${form.voteEndsAt}+08:00` }, allowUnbound)
}
async function reload(id = selected.value?.id) {
  const value = await adminRequest('voting'); if (!alive) return
  records.value = value.activities; works.value = value.works; connectionReady.value = Boolean(value.connectionReady)
  const record = records.value.find(item => item.id === id) ?? records.value[0]
  if (record) select(record, true)
}
async function run(task) {
  if (busy.value) return
  busy.value = true; emit('busy', true); error.value = ''; notice.value = ''
  try { await task() } catch (failure) { if (alive) error.value = failure.message } finally { if (alive) { busy.value = false; emit('busy', false) } }
}
async function mutate(action) {
  if (changed.value && !['save', 'activate', 'connection'].includes(action)) { error.value = '有尚未儲存或套用的修改，請先完成設定。'; return }
  await run(async () => {
    const id = selected.value.id, config = selected.value.config
    const body = { id, action, expectedRevision: config?.revision ?? 0, expectedDraftRevision: selected.value.draft?.revision ?? 0,
      ...(['save', 'activate'].includes(action) ? { voting: candidate(action === 'save') } : {}), ...(action === 'visibility' ? { resultsVisibility: visibility.value } : {}),
      ...(action === 'connection' ? { controlUrl: connectionUrl.value } : {}),
      ...(['finalize', 'correct'].includes(action) ? { reason: reason.value, expectedFinalVersion: config?.finalVersion || 0, expectedSourceRevision: summary.value?.sourceRevision ?? 0 } : {}) }
    const fingerprint = JSON.stringify(body)
    if (operation?.fingerprint !== fingerprint) operation = { fingerprint, operationId: crypto.randomUUID() }
    const result = await adminRequest('vote-mutate', { ...body, operationId: operation.operationId })
    operation = null; await reload(id)
    notice.value = action === 'save' ? '投票草稿已儲存，尚未公開。' : action === 'activate' ? '設定已啟用並固定名單。請完整同步，驗證表單設定。' : ['finalize', 'correct'].includes(action) ? '結算版本已保存，可匯出此版本的結果。' : '管理設定已儲存。'
    if (result.controlStatus === 'confirmed') notice.value += ' Google 表單狀態與完整統計已確認。'
    if (result.controlStatus === 'failed') error.value = '網站設定已儲存，但 Google 表單尚未確認。請檢查 Apps Script 連接後再次完整同步；目前保留原統計。'
    if (result.cacheStatus === 'pending') notice.value += ' 前台快取將於期限內更新。'
  })
}
function request(action) {
  if (changed.value) { error.value = '請先儲存目前草稿。'; return }
  confirmation.value = action; reason.value = ''
}
function downloadSetup() {
  try {
    const value = frozen.value ? editableVoting(selected.value.config) : { activityId: selected.value.id, title: form.title, maxChoices: form.maxChoices, entries: entries() }
    if (!value.title?.trim() || value.entries.length < 2 || value.entries.length < value.maxChoices) throw new Error('請先填寫投票名稱並選擇至少兩件參賽作品，再下載建立表單用的設定。')
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = `${selected.value.id}-voting-setup.json`; link.click(); URL.revokeObjectURL(url)
  } catch (failure) { error.value = failure.message }
}
function date(value) { return value ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Taipei' }).format(new Date(value)) : '尚無紀錄' }
const confirmTitle = computed(() => ({ activate: '啟用並固定這一輪投票規則？', open: '開放 Google 表單收票？', close: '關閉投票並完整重算？', finalize: '確認保存正式結算版本？', correct: '建立更正後的新結算版本？' })[confirmation.value])
function beforeUnload(event) { if (changed.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => { original.value = snapshot(); window.addEventListener('beforeunload', beforeUnload); void run(reload) })
onBeforeUnmount(() => { alive = false; window.removeEventListener('beforeunload', beforeUnload) })
</script>
<template>
  <div class="voting-admin">
    <p class="admin-help">Google 帳號每帳號一次，表單不收姓名與電子郵件。統計採完整重算；啟用後固定名單與期限，新一輪請建立新活動。</p>
    <p v-if="error" class="admin-message admin-error" role="alert">{{ error }}</p><p v-if="notice" class="admin-message" role="status">{{ notice }}</p>
    <VotingConnectionGuide :activity-id="selected?.id" :ready="connectionReady" :busy="busy" :configured="frozen" @setup="downloadSetup" @template="file => run(() => adminDownload(`vote-template?file=${file}`, file === 'script' ? 'Code.gs' : 'appsscript.json'))" @private-settings="run(() => adminDownload('vote-connection', `${selected.id}-private-properties.json`, { id: selected.id }))" />
    <div class="admin-workspace" :aria-busy="busy">
      <aside class="admin-panel admin-list"><div class="admin-panel-heading"><h2>投票活動</h2></div>
        <button v-for="item in records" :key="item.id" class="admin-activity-item" type="button" :aria-pressed="selected?.id === item.id" :disabled="busy" @click="select(item)"><strong>{{ item.title }}</strong><span>{{ item.config?.finalVersion ? '已結算' : item.config ? '已啟用' : item.draft ? '投票草稿' : '尚未設定' }} · {{ item.activityPublished ? '活動已公開' : '活動未公開' }}</span></button>
        <p v-if="!records.length && !busy">請先在活動管理新增活動。</p><button type="button" :disabled="busy" @click="canLeave() && run(() => reload())">重新載入</button>
      </aside>
      <section v-if="selected" class="admin-panel admin-editor"><div class="admin-panel-heading"><h2>投票設定</h2><span class="admin-state">{{ frozen ? '規則已固定' : '尚未啟用' }}</span></div>
        <p v-if="!selected.activityPublished" class="admin-help">活動未公開，投票資訊不會出現在前台。</p>
        <form @submit.prevent="mutate('save')"><fieldset class="admin-edit-fields" :disabled="busy || frozen">
          <label>投票名稱<input v-model="form.title" maxlength="120" required></label>
          <div class="vote-date-fields"><label>投票開始（台灣時間）<input v-model="form.voteStartsAt" type="datetime-local" step="1" required></label><label>投票截止（台灣時間）<input v-model="form.voteEndsAt" type="datetime-local" step="1" required></label></div>
          <label>每票最多選擇<select v-model.number="form.maxChoices"><option v-for="number in 5" :key="number" :value="number">{{ number }} 件作品</option></select></label>
          <label>統計顯示<select v-model="form.resultsVisibility"><option value="live">投票期間公開票數</option><option value="final">確認結算後公開</option><option value="hidden">只在後台顯示</option></select></label>
          <fieldset class="vote-entry-picker"><legend>參賽作品（依勾選順序建立固定選項代號）</legend><label v-for="work in works" :key="work.id"><input v-model="selectedIds" type="checkbox" :value="work.id"><span>{{ work.title }}</span></label><p>已選 {{ selectedIds.length }} 件</p></fieldset>
          <p class="admin-help">表單尚未建立也可以儲存名單草稿。日後補齊以下連接資料，再確認啟用。</p>
          <label>表單編輯 ID<input v-model="form.formId" aria-label="表單編輯 ID" aria-describedby="vote-form-id-help" maxlength="200"><small id="vote-form-id-help">從表單編輯網址 /d/ 與 /edit 之間取得；填答網址的 ID 可能不同。</small></label>
          <label>投票題目 ID<input v-model="form.questionItemId" inputmode="numeric" maxlength="16"></label>
          <label>表單完整填答網址<input v-model="form.formUrl" type="url" placeholder="https://docs.google.com/forms/d/e/…/viewform"></label>
          <label>Apps Script 控制網址<input v-model="form.controlUrl" aria-label="Apps Script 控制網址" aria-describedby="vote-control-help" type="url" placeholder="https://script.google.com/macros/s/…/exec"><small id="vote-control-help">可先留空儲存草稿；啟用前需完成部署。</small></label>
          <div v-if="!frozen" class="admin-editor-actions"><button class="admin-primary" type="submit">儲存投票草稿</button><button class="admin-publish" type="button" @click="request('activate')">確認啟用設定</button></div>
        </fieldset></form>
        <div class="admin-editor-actions"><button type="button" :disabled="busy" @click="downloadSetup">下載串接設定</button></div>
        <template v-if="frozen">
          <details class="vote-repair"><summary>修復 Apps Script 控制連接</summary><p>更新 /exec 網址不會變更表單、名單、票數或結算。更新後需重新完整同步確認。</p><label>新的控制網址<input v-model="connectionUrl" type="url"></label><button type="button" :disabled="busy" @click="mutate('connection')">更新控制連接</button></details>
          <section class="vote-health"><h3>收票與同步狀態</h3><dl><div><dt>網站投票入口</dt><dd>{{ selected.config.entryEnabled ? '已允許顯示（須符合收票確認與期限）' : '已關閉' }}</dd></div><div><dt>期望 Google 表單收票</dt><dd>{{ selected.config.acceptanceDesired ? '開放' : '關閉' }}</dd></div><div><dt>Google 最近確認</dt><dd>{{ selected.config.acceptanceConfirmed === null ? '尚未確認' : selected.config.acceptanceConfirmed ? '仍在收票' : '已停止收票' }} · {{ ({ pending: '等待確認', failed: '連線失敗', confirmed: '已確認', unverified: '尚未驗證' })[selected.config.controlStatus] }}</dd></div><div><dt>確認時間</dt><dd>{{ date(selected.config.confirmedAt) }}</dd></div><div><dt>統計更新</dt><dd>{{ date(summary?.lastSyncedAt) }} · 來源版本 {{ summary?.sourceRevision ?? 0 }}{{ summary?.syncStatus === 'error' ? ' · 同步失敗，保留舊票數' : '' }}</dd></div></dl></section>
          <div class="admin-editor-actions"><button class="admin-primary" type="button" :disabled="busy" @click="mutate('sync')">完整同步統計</button><button v-if="!selected.config.finalVersion" class="admin-publish" type="button" :disabled="busy" @click="request('open')">開放收票</button><button type="button" :disabled="busy" @click="request('close')">關閉收票並重算</button><button v-if="!selected.config.finalVersion" type="button" :disabled="busy" @click="mutate(selected.config.entryEnabled ? 'hide-entry' : 'show-entry')">{{ selected.config.entryEnabled ? '隱藏網站投票入口' : '顯示網站投票入口' }}</button></div>
          <label class="vote-visibility">票數公開方式<select v-model="visibility" :disabled="busy"><option value="live">投票期間公開票數</option><option value="final">確認結算後公開</option><option value="hidden">只在後台顯示</option></select><button type="button" :disabled="busy" @click="mutate('visibility')">套用公開方式</button></label>
          <section class="vote-totals"><h3>{{ selected.final ? `固定結算結果 · 版本 ${selected.final.resultVersion}` : '最近完整統計' }}</h3><p v-if="!counts">尚未收到來源統計。空白不代表零票。</p><template v-else><p>有效選票 {{ counts.ballotCount }} 張 · 總選擇 {{ counts.selectionCount }} 次 · 無效 {{ counts.invalidCount }} 張 · 期限外排除 {{ counts.excludedCount }} 張</p><ul class="vote-count-list"><li v-for="entry in selected.config.entries" :key="entry.workId"><span>{{ entry.code }} · {{ entry.title }}</span><strong>{{ counts.countsByWorkId[entry.workId] }} 票</strong></li></ul></template><p v-if="selected.final && summary">最新來源：{{ summary.ballotCount }} 張有效選票；一般同步不會覆寫結算版本。</p></section>
          <div class="admin-editor-actions"><button class="admin-publish" type="button" :disabled="busy || !summary" @click="request(selected.final ? 'correct' : 'finalize')">{{ selected.final ? '建立更正版本' : '確認結算結果' }}</button><template v-if="selected.final"><label>匯出結算版本<select v-model.number="exportVersion"><option v-for="version in selected.final.resultVersion" :key="version" :value="version">版本 {{ version }}</option></select></label><button type="button" :disabled="busy" @click="run(() => adminDownload(`vote-export?id=${selected.id}&version=${exportVersion}`, `${selected.id}-results-v${exportVersion}.csv`))">匯出結算 CSV</button></template></div>
        </template>
        <div v-if="confirmation" class="admin-confirm" role="region" aria-label="確認投票操作"><h3>{{ confirmTitle }}</h3><p>{{ confirmation === 'activate' ? '名單、表單、題目與起訖時間固定後不能直接修改。此動作尚未開放收票；接著請完整同步驗證。' : confirmation === 'open' ? '確認表單限制與名單後，於投票期間開放 Google 收票，網站同步提供入口。' : confirmation === 'close' ? '網站入口立即關閉，再要求 Google 表單停止收票並完整重算。若連接失敗，後台會保留未確認狀態。' : '需先關閉表單並完成最新完整同步。保存當次票數與來源版本，既有結算版本永久保留；更正需另建新版本。' }}</p><label v-if="['finalize', 'correct'].includes(confirmation)">結算／更正說明<textarea v-model="reason" rows="3" maxlength="1000" placeholder="至少 10 字，說明異常票、同票或更正原因。"></textarea></label><button class="admin-primary" type="button" :disabled="busy" @click="mutate(confirmation)">確認操作</button><button type="button" :disabled="busy" @click="confirmation = ''">取消</button></div>
      </section>
    </div>
  </div>
</template>
