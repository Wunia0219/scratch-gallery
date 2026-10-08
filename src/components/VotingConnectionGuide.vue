<script setup>
import { computed, ref } from 'vue'
const props = defineProps({ activityId: String, ready: Boolean, busy: Boolean, configured: Boolean })
const emit = defineEmits(['setup', 'template', 'private-settings'])
const open = ref(true)
const prepareCommand = computed(() => `npm run voting:prepare -- --activity=${props.activityId || '<活動代號>'} --apply`)
</script>
<template>
  <section class="admin-panel vote-connection-guide" aria-labelledby="vote-connection-title">
    <div class="admin-panel-heading"><div><p class="eyebrow">GOOGLE FORMS CONNECTION</p><h2 id="vote-connection-title">投票串接指南</h2></div><button type="button" :aria-expanded="open" aria-controls="vote-connection-steps" @click="open = !open">{{ open ? '收合指南' : '展開指南' }}</button></div>
    <p>可以先準備規則與名單。這些下載操作不會建立 Google 表單，也不會開放投票。</p>
    <div v-if="open" id="vote-connection-steps" class="vote-connection-steps">
      <article><span class="vote-step-number">01</span><h3>準備投票名單</h3><p>選擇活動、填寫投票名稱、單選或複選規則，再勾選已上架作品。下載的名單使用固定選項代號，日後照名單建立獨立的投票表單。</p><button type="button" :disabled="busy || !activityId" @click="emit('setup')">下載名單設定</button><p class="admin-help">投票表單與投稿表單分開；一帳號一次，不收姓名或 Email，不允許修改回覆與公開回覆摘要。</p></article>
      <article><span class="vote-step-number">02</span><h3>日後連接 Google 表單</h3><p>由站主建立 Apps Script 專案，貼入範本與資訊清單，再將私密設定填入 Script Properties。以站主身份部署 Web App，將表單 ID、題目 ID、完整填答網址與 /exec 控制網址填回下方。</p><div class="admin-editor-actions"><button type="button" :disabled="busy" @click="emit('template', 'script')">下載 Script 範本</button><button type="button" :disabled="busy" @click="emit('template', 'manifest')">下載資訊清單</button><button type="button" :disabled="busy || !ready || !activityId" @click="emit('private-settings')">下載私密連線設定</button></div><p class="admin-help">私密連線檔含此活動的金鑰，只供 Script Properties 使用；不要公開、貼到聊天或加入 Git。Google 授權由站主日後親自確認。</p><details v-if="!ready"><summary>首次連線設定尚未完成</summary><p>目前尚未配置伺服器連線金鑰。首次設定可請 Codex 協助；本機準備指令如下，完成後重啟網站。正式網站需配置 Functions 的秘密設定。</p><code>{{ prepareCommand }}</code><p>之後新增活動即可從這裡下載專用連線設定，不需每次執行指令。本機同步網址會留空：Google 無法推送到 localhost。</p></details><p v-else class="admin-help">伺服器金鑰已配置。每個活動使用獨立 Script 與派生金鑰；下載不會變更或開放表單。</p></article>
      <article><span class="vote-step-number">03</span><h3>驗證後才開放收票</h3><p>儲存草稿，核對名單與期限後啟用。先「完整同步統計」驗證來源，再於投票期間「開放收票」。結束時關閉並重算，核對票數後保存結算版本。</p><p class="admin-help">本機可手動同步；自動更新需公開 HTTPS 同步網址，再安裝 Forms 送出及五分鐘觸發器。前台約 45 秒更新；結算後一般同步不覆寫結果。</p><p class="vote-connection-state">{{ configured ? '此活動已啟用；名單與期限已固定。' : '此活動尚未啟用，不會因準備或下載而開放投票。' }}</p></article>
    </div>
  </section>
</template>
