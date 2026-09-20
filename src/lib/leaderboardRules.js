export function normalizePlayerName(value) {
  if (typeof value !== 'string') return ''
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ')
  return /^[a-z0-9]{1,8}$/iu.test(name) ? name : ''
}

export function enemyHealth(floor) {
  return Math.round(1 + floor / 3)
}

export function scoreBounds(floor) {
  let clearedAnswers = 0
  let floorBonus = 0
  for (let current = 1; current < floor; current += 1) {
    clearedAnswers += enemyHealth(current)
    floorBonus += 200 + current * 80
  }
  const maximumAnswers = clearedAnswers + enemyHealth(floor) - 1
  return {
    minimum: clearedAnswers * 120 + floorBonus,
    maximum: maximumAnswers * 100 + 20 * maximumAnswers * (maximumAnswers + 1) / 2 + floorBonus,
  }
}

export function validateLeaderboardScore(value) {
  if (!value || typeof value !== 'object') return null
  const player = normalizePlayerName(value.player)
  const floor = Number(value.floor)
  const score = Number(value.score)
  if (!player || !Number.isSafeInteger(floor) || floor < 1 || floor > 999 || !Number.isSafeInteger(score)) return null
  const bounds = scoreBounds(floor)
  if (score < bounds.minimum || score > bounds.maximum) return null
  return { player, floor, score }
}
