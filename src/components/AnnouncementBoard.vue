<script setup>
import { useLanguage } from '../i18n'

const { t } = useLanguage()
const submissionUrl = 'https://forms.gle/bFmxHkUJjHcd5uw37'
</script>

<template>
  <section id="announcements" class="announcement-board" aria-labelledby="announcements-title">
    <div class="section-heading announcement-heading">
      <div>
        <p class="eyebrow">WHAT'S HAPPENING</p>
        <h2 id="announcements-title">{{ t('announcementsTitle') }}</h2>
      </div>
      <p class="section-note">{{ t('announcementsIntro') }}</p>
    </div>

    <article class="announcement-card announcement-card-halloween">
      <div class="announcement-copy">
        <div class="announcement-meta">
          <span class="announcement-status"><span aria-hidden="true"></span>{{ t('halloweenStatus') }}</span>
          <span class="announcement-label">{{ t('halloweenLabel') }}</span>
        </div>
        <p class="announcement-kicker">SCRATCH HALLOWEEN CHALLENGE</p>
        <h3>{{ t('halloweenTitle') }}</h3>
        <p class="announcement-summary">{{ t('halloweenSummary') }}</p>

        <ul class="announcement-details" :aria-label="t('halloweenDetailsLabel')">
          <li>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 5h14v14H5z"/><path d="m8 14 2.6-2.8 2.2 2.1 2.2-2.5L18 14M9 9h.01"/></svg>
            <span><strong>{{ t('halloweenFormatsTitle') }}</strong>{{ t('halloweenFormats') }}</span>
          </li>
          <li>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 14v5h14v-5"/></svg>
            <span><strong>{{ t('halloweenFileTitle') }}</strong>{{ t('halloweenFile') }}</span>
          </li>
        </ul>

        <div class="announcement-actions">
          <a class="button announcement-button" :href="submissionUrl" target="_blank" rel="noreferrer">
            {{ t('halloweenSubmit') }}
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 17 17 7M8 7h9v9" /></svg>
          </a>
        </div>
      </div>

      <div class="announcement-art" aria-hidden="true">
        <svg class="halloween-moon" viewBox="0 0 220 220">
          <circle cx="110" cy="110" r="86" />
          <path d="M62 69c16-24 45-37 74-32-23 7-39 29-39 55 0 34 27 61 61 61 7 0 14-1 20-3-15 28-45 47-79 45-47-3-83-43-80-90 1-13 5-25 12-36Z" />
        </svg>
        <svg class="halloween-pumpkin" viewBox="0 0 260 230">
          <path class="pumpkin-stem" d="M132 54c-4-18 2-31 20-41-3 17 2 27 14 36" />
          <path class="pumpkin-body" d="M132 48c57-19 105 24 99 82-5 54-47 87-101 87S33 184 28 130c-6-58 42-101 104-82Z" />
          <path class="pumpkin-ridge" d="M92 48c-23 43-22 112 1 164M171 49c22 45 20 115-4 163M132 48c-15 48-14 119-2 169" />
          <path class="pumpkin-face" d="m63 112 35-17-8 34-27-17Zm132 0-35-17 8 34 27-17ZM82 158c31 25 67 26 101 0-7 32-28 48-51 48-24 0-43-16-50-48Z" />
        </svg>
        <svg class="halloween-stars" viewBox="0 0 320 230">
          <path d="m34 48 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2 5-10ZM277 75l4 8 9 1-7 7 2 9-8-4-8 4 2-9-7-7 9-1 4-8Z" />
          <path d="M250 32c10 5 18 5 27 0M263 20c0 8 0 15 1 24M47 140c11 4 20 4 30-1M61 126c0 9 0 18 1 27" />
        </svg>
        <span class="halloween-bat halloween-bat-one"></span>
        <span class="halloween-bat halloween-bat-two"></span>
        <p>{{ t('halloweenArtLine') }}</p>
      </div>
    </article>
  </section>
</template>
