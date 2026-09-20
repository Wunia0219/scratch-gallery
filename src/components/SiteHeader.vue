<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { contentUpdates, contentUpdatesStorageKey } from '../contentUpdates.js'
import { useLanguage } from '../i18n.js'
import { readStoredObject, writeStored } from '../lib/storage.js'
import ActivityReminder from './ActivityReminder.vue'

const props = defineProps({
  active: { type: String, default: 'home' },
})

const { language, t, setLanguage } = useLanguage()
const drawerOpen = ref(false)
const drawer = ref(null)
const menuButton = ref(null)
const currentHash = ref('')
const seenUpdates = ref({})
const updatesReady = ref(false)
let previousFocus = null

const isHome = computed(() => props.active === 'home')
const navItems = computed(() => [
  { section: 'students', number: '01', label: t('studentCollectionNav'), hint: t('studentNavHint'), href: '/students/' },
  { section: 'events', number: '02', label: t('announcementsNav'), hint: t('eventsNavHint'), href: isHome.value ? '#announcements' : '/#announcements' },
  { section: 'teachers', number: '03', label: t('teacherCollectionNav'), hint: t('teacherNavHint'), href: '/teachers/' },
  { section: 'learning', number: '04', label: t('learning'), hint: t('learningNavHint'), href: isHome.value ? '#learning' : '/#learning' },
])

function loadSeenUpdates() {
  seenUpdates.value = readStoredObject(contentUpdatesStorageKey)
  updatesReady.value = true
}

function hasNewContent(section) {
  const version = contentUpdates[section]
  return updatesReady.value && Boolean(version) && seenUpdates.value[section] !== version && props.active !== section
}

const hasAnyNewContent = computed(() => navItems.value.some(item => hasNewContent(item.section)))

function markSeen(section) {
  const version = contentUpdates[section]
  if (!version) return
  seenUpdates.value = { ...seenUpdates.value, [section]: version }
  writeStored(contentUpdatesStorageKey, JSON.stringify(seenUpdates.value))
}

function syncLocation() {
  currentHash.value = window.location.hash
  if (isHome.value && currentHash.value === '#announcements') markSeen('events')
}

function currentMarker(section) {
  if (section === props.active) return 'page'
  if (isHome.value && section === 'events' && currentHash.value === '#announcements') return 'location'
  if (isHome.value && section === 'learning' && currentHash.value === '#learning') return 'location'
  return undefined
}

async function openDrawer() {
  previousFocus = document.activeElement
  drawerOpen.value = true
  document.body.classList.add('nav-drawer-open')
  await nextTick()
  drawer.value?.querySelector('.nav-drawer-close')?.focus()
}

async function closeDrawer({ restoreFocus = true } = {}) {
  drawerOpen.value = false
  document.body.classList.remove('nav-drawer-open')
  if (!restoreFocus) return
  await nextTick()
  const focusTarget = previousFocus instanceof HTMLElement ? previousFocus : menuButton.value
  focusTarget?.focus()
}

async function followNav(event, item) {
  markSeen(item.section)
  if (!isHome.value || !item.href.startsWith('#')) {
    closeDrawer({ restoreFocus: false })
    return
  }

  event.preventDefault()
  await closeDrawer({ restoreFocus: false })
  await nextTick()

  const target = document.querySelector(item.href)
  if (!(target instanceof HTMLElement)) return
  const historyMethod = window.location.hash === item.href ? 'replaceState' : 'pushState'
  window.history[historyMethod](null, '', item.href)
  currentHash.value = item.href
  target.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  })
  const focusTarget = target.querySelector('h2') || target
  if (!(focusTarget instanceof HTMLElement)) return
  focusTarget.setAttribute('tabindex', '-1')
  focusTarget.focus({ preventScroll: true })
  focusTarget.addEventListener('blur', () => focusTarget.removeAttribute('tabindex'), { once: true })
}

function handleDrawerKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeDrawer()
    return
  }
  if (event.key !== 'Tab' || !drawer.value) return

  const focusable = [...drawer.value.querySelectorAll('a[href], button:not([disabled])')]
    .filter(element => element.getClientRects().length > 0)
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  loadSeenUpdates()
  syncLocation()
  if (props.active === 'students' || props.active === 'teachers') markSeen(props.active)
  window.addEventListener('hashchange', syncLocation)
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', syncLocation)
  document.body.classList.remove('nav-drawer-open')
})
</script>

<template>
  <header class="site-header">
    <div class="header-start">
      <button
        ref="menuButton"
        class="nav-drawer-trigger"
        type="button"
        :aria-label="t('openMenu')"
        :aria-expanded="drawerOpen"
        aria-controls="site-navigation-drawer"
        @click="openDrawer"
      >
        <span class="nav-drawer-trigger-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14" /></svg>
          <span v-if="hasAnyNewContent" class="nav-drawer-trigger-dot"></span>
        </span>
        <span v-if="hasAnyNewContent" class="sr-only">{{ t('menuHasUpdates') }}</span>
      </button>

      <a class="brand" :href="isHome ? '#top' : '/'" :aria-label="t('homeLabel')">
        <img class="brand-logo" src="/brand/dongshi-giraffe-logo.webp" alt="" width="48" height="48" />
        <span class="brand-name"><strong>東勢長頸鹿美語</strong><small>Scratch 創作館</small></span>
      </a>
    </div>

    <div class="header-actions">
      <div class="language-switch" role="group" :aria-label="t('languageLabel')">
        <button type="button" :aria-pressed="language === 'zh-Hant'" @click="setLanguage('zh-Hant')">中</button>
        <button type="button" :aria-pressed="language === 'en'" @click="setLanguage('en')">EN</button>
      </div>
    </div>
  </header>

  <ActivityReminder />

  <div class="nav-drawer-layer" :class="{ 'is-open': drawerOpen }" :aria-hidden="!drawerOpen">
    <button class="nav-drawer-backdrop" type="button" tabindex="-1" aria-hidden="true" @click="closeDrawer()"></button>
    <aside
      id="site-navigation-drawer"
      ref="drawer"
      class="nav-drawer"
      role="dialog"
      aria-modal="true"
      :aria-label="t('primaryNavigation')"
      :inert="!drawerOpen"
      @keydown="handleDrawerKeydown"
    >
      <div class="nav-drawer-header">
        <a class="nav-drawer-brand" :href="isHome ? '#top' : '/'" :aria-label="t('homeLabel')" @click="closeDrawer({ restoreFocus: false })">
          <img src="/brand/dongshi-giraffe-logo.webp" alt="" width="48" height="48" />
          <span><strong>東勢長頸鹿美語</strong><small>Scratch 創作館</small></span>
        </a>
        <button class="nav-drawer-close" type="button" :aria-label="t('closeMenu')" @click="closeDrawer()">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>

      <div class="nav-drawer-intro">
        <p class="eyebrow">CODE · CREATE · SHARE</p>
        <h2>{{ t('drawerTitle') }}</h2>
        <p>{{ t('drawerText') }}</p>
      </div>

      <nav class="nav-drawer-nav" :aria-label="t('primaryNavigation')">
        <a
          v-for="item in navItems"
          :key="item.section"
          :href="item.href"
          :aria-current="currentMarker(item.section)"
          @click="followNav($event, item)"
        >
          <span class="nav-drawer-icon" aria-hidden="true">
            <svg v-if="item.section === 'students'" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            <svg v-else-if="item.section === 'events'" viewBox="0 0 24 24"><path d="M6 2v4M18 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM8 13h3v3H8z" /></svg>
            <svg v-else-if="item.section === 'teachers'" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15ZM8 7h8M8 11h6" /></svg>
            <svg v-else viewBox="0 0 24 24"><path d="M9 18h6M10 22h4M8.7 15.3a7 7 0 1 1 6.6 0c-.83.55-1.3 1.15-1.3 2.2h-4c0-1.05-.47-1.65-1.3-2.2Z" /></svg>
          </span>
          <span class="nav-drawer-copy">
            <small>{{ item.number }}</small>
            <strong>{{ item.label }}</strong>
            <span>{{ item.hint }}</span>
          </span>
          <span v-if="hasNewContent(item.section)" class="nav-drawer-update">{{ t('newContent') }}</span>
          <svg class="nav-drawer-arrow" aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
        </a>
      </nav>

      <p class="nav-drawer-footer">{{ t('drawerFooter') }}</p>
    </aside>
  </div>
</template>
