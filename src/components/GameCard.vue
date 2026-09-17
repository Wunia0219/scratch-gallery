<script setup>
import { computed } from 'vue'
import { useLanguage } from '../i18n'

const props = defineProps({
  game: { type: Object, required: true },
})

defineEmits(['play'])

const { t, isEnglish } = useLanguage()

const deviceLabels = {
  desktop: 'desktop',
  mobile: 'mobile',
}
const categoryLabels = { '冒險': 'Adventure', '創意': 'Creativity' }
const categoryLabel = computed(() => isEnglish.value ? (categoryLabels[props.game.category] || props.game.category || 'Scratch game') : (props.game.category || 'Scratch 作品'))

const supportedDevices = computed(() => (props.game.devices || []).filter((device) => deviceLabels[device]))
</script>

<template>
  <article class="game-card">
    <button
      class="game-cover"
      type="button"
      :disabled="!game.playUrl"
      :aria-label="game.playUrl ? `遊玩《${game.title}》` : `《${game.title}》尚未上架`"
      @click="$emit('play', game)"
    >
      <template v-if="game.thumbnail">
        <img
          class="game-cover-image"
          :src="game.thumbnail"
          :alt="`${game.title} 的遊戲畫面`"
          width="480"
          height="360"
          loading="lazy"
          decoding="async"
          fetchpriority="low"
        />
        <img
          v-for="layer in game.thumbnailLayers || []"
          :key="layer.src"
          class="game-cover-layer"
          :class="layer.className"
          :src="layer.src"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
        />
      </template>
      <div v-else class="cover-placeholder" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="m9 7 8 5-8 5V7Z" />
          <rect x="3" y="3" width="18" height="18" rx="4" />
        </svg>
      </div>
      <span class="game-status">{{ game.playUrl ? t('ready') : t('preparing') }}</span>
      <span v-if="game.playUrl" class="cover-play" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="m9 7 8 5-8 5V7Z" /></svg>
      </span>
    </button>

    <div class="game-body">
      <div class="game-meta">
        <span>{{ game.className || '學生創作' }}</span>
        <span>{{ categoryLabel }}</span>
      </div>
      <div v-if="supportedDevices.length" class="device-badges" :aria-label="`${t('devices')}：${supportedDevices.map((device) => t(deviceLabels[device])).join('、')}`">
        <span v-for="device in supportedDevices" :key="device" class="device-badge">
          <svg v-if="device === 'desktop'" aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
          <svg v-else aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="4" width="11" height="16" rx="2" /><rect x="16" y="7" width="5" height="11" rx="1.5" /><path d="M7 17h3M18 15.5h1" /></svg>
          {{ t(deviceLabels[device]) }}
        </span>
      </div>
      <h3><a :href="game.detailUrl">{{ game.title || '精彩作品' }}<span class="sr-only">：{{ game.student }}的作品介紹</span></a></h3>
      <p>{{ game.description || '一起來看看這件作品吧。' }}</p>
      <p class="student-credit">{{ t('creator') }}{{ game.student || '學生創作者' }}</p>
    </div>
  </article>
</template>
