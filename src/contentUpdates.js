export const featuredActivity = {
  id: 'halloween-challenge-2026',
  isPublished: false,
  remindFrom: '2026-09-19T00:00:00+08:00',
  startsAt: '2026-09-28T00:00:00+08:00',
  endsAt: '2026-10-23T23:59:59+08:00',
  href: '/#announcements',
}

export const contentUpdates = {
  students: 'fireworks-featured-2026-09-19',
  events: featuredActivity.isPublished ? 'halloween-challenge-2026-dates' : null,
  teachers: null,
}

export const contentUpdatesStorageKey = 'scratch-gallery-seen-updates'
export const activityReminderStorageKey = 'scratch-gallery-dismissed-reminders'
export const newWorkWindowDays = 15

export function getActivityReminder(now = Date.now(), activity = featuredActivity) {
  if (!activity.isPublished) return null

  const remindFrom = Date.parse(activity.remindFrom)
  const startsAt = Date.parse(activity.startsAt)
  const endsAt = Date.parse(activity.endsAt)
  if (now < remindFrom || now > endsAt) return null

  const day = 24 * 60 * 60 * 1000
  if (now < startsAt) {
    return {
      ...activity,
      phase: 'upcoming',
      version: `${activity.id}:upcoming`,
      days: Math.max(1, Math.ceil((startsAt - now) / day)),
    }
  }

  const days = Math.max(1, Math.ceil((endsAt - now) / day))
  const phase = days <= 3 ? 'closing' : 'open'
  return {
    ...activity,
    phase,
    version: `${activity.id}:${phase}`,
    days,
  }
}

export function getWorkUpdate(work, now = Date.now()) {
  const publishedAt = Date.parse(work?.publishedAt)
  if (!Number.isFinite(publishedAt) || now < publishedAt) return null

  const expiresAt = publishedAt + newWorkWindowDays * 24 * 60 * 60 * 1000
  return now < expiresAt ? { kind: 'new', publishedAt, expiresAt } : null
}
