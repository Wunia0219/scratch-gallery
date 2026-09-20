<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { loadLeaderboard, submitLeaderboard } from '../lib/leaderboardClient.js'

const props = defineProps({
  game: { type: Object, default: null },
})

const emit = defineEmits(['close'])
const dialog = ref(null)
const playerFrame = ref(null)
let closing = false
const leaderboardChannel = 'scratch-gallery-leaderboard-v1'
const leaderboardStatus = ref('')
const retrySubmission = ref(null)
let leaderboardQueue = Promise.resolve()

watch(
  () => props.game,
  async (game) => {
    leaderboardStatus.value = ''
    retrySubmission.value = null
    await nextTick()
    if (game && dialog.value && !dialog.value.open) { closing = false; dialog.value.showModal() }
  },
  { immediate: true },
)

function close() {
  if (dialog.value?.open) dialog.value.close()
  notifyClose()
}

function notifyClose() {
  if (closing) return
  closing = true
  emit('close')
}

function closeFromBackdrop(event) {
  if (event.target === dialog.value) close()
}

function cancel(event) {
  event.preventDefault()
  close()
}

function sendLeaderboard(frame, gameId, leaderboard) {
  frame.postMessage({
    channel: leaderboardChannel,
    action: 'result',
    gameId,
    leaderboard,
  }, '*')
}

function handleGameMessage(event) {
  const data = event.data
  if (!props.game?.leaderboard || event.source !== playerFrame.value?.contentWindow) return
  if (!data || data.channel !== leaderboardChannel || data.gameId !== props.game.id) return
  if (!['load', 'submit'].includes(data.action)) return
  const frame = event.source
  const gameId = props.game.id
  const submission = data.action === 'submit'
    ? { gameId, eventId: data.eventId, player: data.player, floor: data.floor, score: data.score }
    : null
  // Serialize reads after writes so a late GET cannot replace a new score.
  leaderboardQueue = leaderboardQueue.then(() => syncLeaderboard(frame, gameId, submission))
}

async function syncLeaderboard(frame, gameId, submission) {
  const isCurrent = () => frame === playerFrame.value?.contentWindow && gameId === props.game?.id
  const showStatus = message => {
    leaderboardStatus.value = message
    frame.postMessage({ channel: leaderboardChannel, action: 'status', gameId, message }, '*')
  }
  if (!isCurrent()) return
  showStatus(submission ? '成績儲存中，請稍候…' : '排行榜載入中…')
  try {
    const leaderboard = submission ? await submitLeaderboard(submission) : await loadLeaderboard(gameId)
    if (!isCurrent()) return
    if (submission) retrySubmission.value = null
    showStatus(retrySubmission.value ? '成績尚未儲存，請重試。' : submission ? '成績已儲存。' : '排行榜已更新。')
    sendLeaderboard(frame, gameId, leaderboard)
  } catch (error) {
    if (!isCurrent()) return
    if (submission) retrySubmission.value = submission
    showStatus(retrySubmission.value ? '成績儲存失敗，請在播放器下方重試；離開頁面將無法保留本次成績。' : '排行榜載入失敗，請返回選單後重試。')
    console.warn('Leaderboard unavailable', error)
  }
}

function retryLeaderboard() {
  if (!retrySubmission.value) return
  handleGameMessage({ source: playerFrame.value?.contentWindow, data: { ...retrySubmission.value, channel: leaderboardChannel, action: 'submit' } })
}

onMounted(() => window.addEventListener('message', handleGameMessage))

onBeforeUnmount(() => {
  window.removeEventListener('message', handleGameMessage)
  if (dialog.value?.open) dialog.value.close()
})
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="game ? 'dialog-title' : undefined"
    @click="closeFromBackdrop"
    @cancel="cancel"
    @close="notifyClose"
  >
    <template v-if="game">
      <div class="dialog-bar">
        <div>
          <p class="eyebrow">正在遊玩</p>
          <h2 id="dialog-title">{{ game.title }}</h2>
        </div>
        <button class="icon-button" type="button" aria-label="關閉遊戲播放器" @click="close">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <div class="player-shell">
        <iframe
          ref="playerFrame"
          :src="game.playUrl"
          :title="`${game.title} 遊戲播放器`"
          sandbox="allow-scripts allow-pointer-lock"
          referrerpolicy="no-referrer"
          allow="fullscreen; autoplay"
          allowfullscreen
          loading="lazy"
        />
      </div>
      <p class="dialog-note">關閉這個視窗即可結束遊戲。</p>
      <p v-if="game.leaderboard" class="dialog-note" role="status">
        {{ leaderboardStatus }}
        <button v-if="retrySubmission" class="button" type="button" @click="retryLeaderboard">重試儲存成績</button>
      </p>
    </template>
  </dialog>
</template>
