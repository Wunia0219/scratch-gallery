<script setup>
import { computed, ref } from 'vue'
import { activityReminderStorageKey, featuredActivity, formatActivityDate, getActivityReminder } from '../contentUpdates.js'
import { useLanguage } from '../i18n.js'
import { useNow } from '../composables/useNow.js'
import { readStoredObject, writeStored } from '../lib/storage.js'
const { t, language } = useLanguage()
const now = useNow()
const reminder = computed(() => getActivityReminder(now.value))
const dismissedVersions = ref(readStoredObject(activityReminderStorageKey))
const dismissed = computed(() => reminder.value && dismissedVersions.value[reminder.value.version] === true)
const dates = computed(() => ({ start: formatActivityDate(featuredActivity.startsAt, language.value), end: formatActivityDate(featuredActivity.endsAt, language.value) }))
function dismissReminder() {
  if (!reminder.value) return
  dismissedVersions.value = { ...readStoredObject(activityReminderStorageKey), ...dismissedVersions.value, [reminder.value.version]: true }
  writeStored(activityReminderStorageKey, JSON.stringify(dismissedVersions.value))
}
</script>

<template>
  <aside
    v-if="reminder && !dismissed"
    class="activity-reminder"
    :class="`activity-reminder-${reminder.phase}`"
    :aria-label="t('activityReminderLabel')"
  >
    <span class="activity-reminder-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" /><path d="M8 12h3M8 16h6" /></svg>
    </span>
    <span class="activity-reminder-copy">
      <strong>{{ t(`activityReminder${reminder.phase[0].toUpperCase()}${reminder.phase.slice(1)}`) }}</strong>
      <small>{{ t('activityReminderDates', dates) }}<template v-if="reminder.phase === 'closing'"> · {{ t('activityReminderDays', { count: reminder.days }) }}</template></small>
    </span>
    <a :href="reminder.href">{{ t('viewActivity') }}<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg></a>
    <button class="activity-reminder-close" type="button" :aria-label="t('dismissActivityReminder')" @click="dismissReminder">
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17" /></svg>
    </button>
  </aside>
</template>
