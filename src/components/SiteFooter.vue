<script setup>
import packageInfo from '../../package.json'
import { useLanguage } from '../i18n.js'
defineProps({ workPage: Boolean })
const { t } = useLanguage()
const version = packageInfo.version
const versionLabel = version.endsWith('-beta') ? `Beta ${version.slice(0, -5)}` : `ver ${version}`
</script>

<template>
  <footer>
    <p><strong>東勢長頸鹿美語</strong> · {{ t('footer') }} <span class="footer-version">{{ versionLabel }}</span></p>
    <p v-if="workPage">本網站並非 Scratch 官方網站。</p>
    <p v-else>Knowledge gives us power. Character guides how we use it.</p>
  </footer>
</template>
