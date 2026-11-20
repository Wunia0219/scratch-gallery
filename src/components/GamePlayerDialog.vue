<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { loadLeaderboard, submitLeaderboard } from '../lib/leaderboardClient.js'
import { useLanguage } from '../i18n'

const { t, language } = useLanguage()
const props = defineProps({
  game: { type: Object, default: null },
})

const emit = defineEmits(['close'])
const dialog = ref(null)
const playerFrame = ref(null)
const playerExpanded = ref(false)
const initialPlayerLanguage = ref(language.value)
let closing = false
const leaderboardChannel = 'scratch-gallery-leaderboard-v1'
const leaderboardStatus = ref('')
const retrySubmission = ref(null)
let leaderboardQueue = Promise.resolve()

watch(
  () => props.game,
  async (game) => {
    initialPlayerLanguage.value = language.value
    playerExpanded.value = false
    leaderboardStatus.value = ''
    retrySubmission.value = null
    await nextTick()
    if (game && dialog.value && !dialog.value.open) { closing = false; dialog.value.showModal() }
  },
  { immediate: true },
)
watch(language, syncPlayerLanguage)

function syncPlayerLanguage() {
  // The sandboxed frame has an opaque origin. The message carries only the locale.
  playerFrame.value?.contentWindow?.postMessage({
    channel: 'scratch-gallery-player-language',
    language: language.value,
  }, '*')
}

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
  if (playerExpanded.value) {
    setPlayerExpanded(false)
    return
  }
  close()
}

const fullscreenChannel = 'scratch-gallery-player-fullscreen'

function setPlayerExpanded(expanded) {
  playerExpanded.value = expanded
  playerFrame.value?.contentWindow?.postMessage({ channel: fullscreenChannel, expanded }, '*')
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
  if (!props.game || event.source !== playerFrame.value?.contentWindow) return
  if (data?.channel === fullscreenChannel && typeof data.expanded === 'boolean') {
    setPlayerExpanded(data.expanded)
    return
  }
  if (!props.game.leaderboard) return
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
  const showStatus = status => {
    leaderboardStatus.value = status
    frame.postMessage({ channel: leaderboardChannel, action: 'status', gameId, message: t(status) }, '*')
  }
  if (!isCurrent()) return
  showStatus(submission ? 'scoreSaving' : 'leaderboardLoading')
  try {
    const leaderboard = submission ? await submitLeaderboard(submission) : await loadLeaderboard(gameId)
    if (!isCurrent()) return
    if (submission) retrySubmission.value = null
    showStatus(retrySubmission.value ? 'scorePending' : submission ? 'scoreSaved' : 'leaderboardUpdated')
    sendLeaderboard(frame, gameId, leaderboard)
  } catch (error) {
    if (!isCurrent()) return
    if (submission) retrySubmission.value = submission
    showStatus(retrySubmission.value ? 'scoreSaveFailed' : 'leaderboardLoadFailed')
    console.warn('Leaderboard unavailable', error)
  }
}

function retryLeaderboard() {
  if (!retrySubmission.value) return
  handleGameMessage({ source: playerFrame.value?.contentWindow, data: { ...retrySubmission.value, channel: leaderboardChannel, action: 'submit' } })
}

onMounted(() => {
  window.addEventListener('message', handleGameMessage)
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handleGameMessage)
  if (dialog.value?.open) dialog.value.close()
})
</script>

<template>
  <dialog
    ref="dialog"
    class="game-dialog"
    :class="{ 'player-expanded': playerExpanded }"
    :aria-labelledby="game ? 'dialog-title' : undefined"
    @click="closeFromBackdrop"
    @cancel="cancel"
    @close="notifyClose"
  >
    <template v-if="game">
      <div class="dialog-bar">
        <div>
          <p class="eyebrow">{{ t('nowPlaying') }}</p>
          <h2 id="dialog-title">{{ game.title }}</h2>
        </div>
        <button class="icon-button" type="button" :aria-label="t('playerClose')" @click="close">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <div class="player-shell">
        <!-- allowfullscreen also covers the sandboxed frame's opaque origin. -->
        <iframe
          ref="playerFrame"
          :src="`${game.playUrl}?lang=${initialPlayerLanguage}`"
          :title="t('playerTitle', { title: game.title })"
          sandbox="allow-scripts allow-pointer-lock"
          referrerpolicy="no-referrer"
          allow="autoplay"
          allowfullscreen
          loading="lazy"
          @load="syncPlayerLanguage"
        />
      </div>
      <p class="dialog-note">{{ t('closeGame') }}</p>
      <p v-if="game.leaderboard" class="dialog-note" role="status">
        {{ leaderboardStatus && t(leaderboardStatus) }}
        <button v-if="retrySubmission" class="button" type="button" @click="retryLeaderboard">{{ t('scoreRetry') }}</button>
      </p>
    </template>
  </dialog>
</template>
