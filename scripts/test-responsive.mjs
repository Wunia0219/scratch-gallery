import assert from 'node:assert/strict'

const viewports = [[320, 568], [375, 667], [390, 844], [430, 932], [844, 390],
  [768, 1024], [1024, 768], [1280, 720], [1440, 900], [1920, 1080]]

async function checkSizes(page, label) {
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height })
    await page.waitForFunction(expected => {
      const root = document.documentElement
      return innerWidth === expected && root.scrollWidth <= root.clientWidth + 1
    }, width, { timeout: 2500 }).catch(error => {
      if (error.name !== 'TimeoutError') throw error
    })
    const problems = await page.evaluate(async () => {
      await document.fonts.ready
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const root = document.documentElement
      const issues = []
      if (root.scrollWidth > root.clientWidth + 1) {
        const outside = [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > root.clientWidth + 1)
        issues.push(`page width ${root.scrollWidth}: ${outside.slice(0, 8).map(el => el.localName + '.' + el.getAttribute('class')).join(', ')}`)
      }
      const controls = document.querySelectorAll('header a, header button, main h1, main input, .game-card, .nav-drawer-layer.is-open nav a, dialog[open] button, dialog[open] iframe')
      for (const element of controls) {
        if (element.closest('[inert], [aria-hidden="true"]')) continue
        const box = element.getBoundingClientRect()
        if (box.width && (box.left < -1 || box.right > root.clientWidth + 1)) {
          issues.push(element.className || element.textContent.trim().slice(0, 40))
        }
      }
      const brand = document.querySelector('header .brand, .exhibition-brand')
      const switcher = document.querySelector('header .language-switch')
      if (brand && switcher && brand.getBoundingClientRect().right > switcher.getBoundingClientRect().left + 1 &&
          brand.getBoundingClientRect().bottom > switcher.getBoundingClientRect().top + 1) issues.push('brand overlaps languages')
      return issues
    })
    assert.deepEqual(problems, [], `${label} at ${width}×${height}: ${problems.join(', ')}`)
  }
}

export async function testResponsive(browser, origin, games) {
  const page = await browser.newPage({ reducedMotion: 'reduce' })
  try {
    const paths = ['/', '/students/', '/teachers/', '/events/halloween-showcase/', ...games.map(game => game.detailUrl)]
    for (const path of paths) {
      await page.goto(origin + path)
      await page.locator('main h1').waitFor()
      for (const [language, button] of [['en', 'English'], ['zh-Hant', '中文']]) {
        await page.getByRole('button', { name: button, exact: true }).click()
        await page.waitForFunction(lang => document.documentElement.lang === lang, language)
        const label = `${path} ${language}`
        await checkSizes(page, label)
        if (path === '/') {
          await page.locator('.nav-drawer-trigger').click()
          await checkSizes(page, `${label} menu`)
          await page.locator('.nav-drawer-close').click()
        }
        if (path === games[0]?.detailUrl) {
          await page.locator('.work-cover .game-cover').click()
          await page.locator('.game-dialog[open] iframe').waitFor()
          await checkSizes(page, `${label} player`)
          await page.locator('.game-dialog .dialog-bar button').click()
        }
      }
    }
    for (const path of ['/admin/', '/404.html']) {
      await page.goto(origin + path)
      await page.locator('h1').waitFor()
      await checkSizes(page, path)
    }
    console.log(`PASS responsive layout: ${paths.length} bilingual pages plus admin and 404 at ${viewports.length} sizes.`)
  } finally { await page.close() }
}
