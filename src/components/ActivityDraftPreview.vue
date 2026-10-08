<script setup>
import { provide, computed } from 'vue'
import { siteStateKey, emptySiteState } from '../composables/useSiteState.js'
import AnnouncementBoard from './AnnouncementBoard.vue'
const props = defineProps({ activity: { type: Object, required: true } })
provide(siteStateKey, { state: computed(() => ({ ...emptySiteState(), featuredActivity: { ...props.activity, isPublished: true } })) })
</script>
<template><AnnouncementBoard /></template>
