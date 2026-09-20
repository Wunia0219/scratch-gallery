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

watch(
  () => props.game,
  async (game) => {
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

function sendLeaderboard(leaderboard) {
  playerFrame.value?.contentWindow?.postMessage({
    channel: leaderboardChannel,
    action: 'result',
    gameId: props.game?.id,
    leaderboard,
  }, '*')
}

async function handleGameMessage(event) {
  const data = event.data
  if (!props.game?.leaderboard || event.source !== playerFrame.value?.contentWindow) return
  if (!data || data.channel !== leaderboardChannel || data.gameId !== props.game.id) return
  try {
    const leaderboard = data.action === 'load'
      ? await loadLeaderboard(props.game.id)
      : data.action === 'submit'
        ? await submitLeaderboard({ gameId: props.game.id, eventId: data.eventId, player: data.player, floor: data.floor, score: data.score })
        : null
    if (leaderboard) sendLeaderboard(leaderboard)
  } catch (error) {
    console.warn('Leaderboard unavailable', error)
  }
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
    </template>
  </dialog>
</template>
