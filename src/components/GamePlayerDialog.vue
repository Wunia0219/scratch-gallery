<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  game: { type: Object, default: null },
})

const emit = defineEmits(['close'])
const dialog = ref(null)

watch(
  () => props.game,
  async (game) => {
    await nextTick()
    if (game && dialog.value && !dialog.value.open) dialog.value.showModal()
  },
  { immediate: true },
)

function close() {
  if (dialog.value?.open) dialog.value.close()
  emit('close')
}

function closeFromBackdrop(event) {
  if (event.target === dialog.value) close()
}

function cancel(event) {
  event.preventDefault()
  close()
}

onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close()
})
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="game ? 'dialog-title' : undefined"
    @click="closeFromBackdrop"
    @cancel="cancel"
    @close="emit('close')"
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
