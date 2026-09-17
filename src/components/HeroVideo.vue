<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { showcaseVideoUrl } from '../media'

const emit = defineEmits(['close'])
const dialog = ref(null)
const video = ref(null)

onMounted(async () => {
  await nextTick()
  dialog.value?.showModal()
  if (video.value) {
    video.value.muted = false
    video.value.volume = 0.8
    video.value.play().catch(() => {})
  }
})

function close() {
  releaseVideo()
  if (dialog.value?.open) dialog.value.close()
  else emit('close')
}

function releaseVideo() {
  if (!video.value) return
  video.value.pause()
  video.value.removeAttribute('src')
  video.value.querySelector('source')?.removeAttribute('src')
  video.value.load()
}

function closeFromBackdrop(event) {
  if (event.target === dialog.value) close()
}

function cancel(event) {
  event.preventDefault()
  close()
}

onBeforeUnmount(releaseVideo)
</script>

<template>
  <dialog
    ref="dialog"
    class="video-dialog"
    aria-labelledby="video-dialog-title"
    @click="closeFromBackdrop"
    @cancel="cancel"
    @close="emit('close')"
  >
    <div class="dialog-bar video-dialog-bar">
      <div>
        <p class="eyebrow">精彩影片</p>
        <h2 id="video-dialog-title">Scratch 創作展</h2>
      </div>
      <button class="icon-button" type="button" aria-label="關閉影片" @click="close">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
    </div>
    <div class="video-player-shell">
      <video ref="video" controls autoplay playsinline preload="none">
        <source :src="showcaseVideoUrl" type="video/mp4" />
        您的瀏覽器不支援影片播放。
      </video>
    </div>
    <p class="dialog-note">可使用播放器下方的音量按鈕調整或關閉聲音。</p>
  </dialog>
</template>
