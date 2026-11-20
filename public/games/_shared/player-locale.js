(() => {
  const translations = {
    'zh-Hant': {
      start: '點擊開始',
      loading: '正在載入作品…',
      error: '作品無法載入',
      details: '技術詳細資訊',
      greenFlag: '按綠旗開始',
      pause: '暫停',
      resume: '繼續播放',
      stop: '停止',
      fullscreen: '全螢幕',
      exitFullscreen: '離開全螢幕',
    },
    en: {
      start: 'Click to start',
      loading: 'Loading project…',
      error: 'Could not load the project',
      details: 'Technical details',
      greenFlag: 'Start with the green flag',
      pause: 'Pause',
      resume: 'Resume',
      stop: 'Stop',
      fullscreen: 'Fullscreen',
      exitFullscreen: 'Exit fullscreen',
    },
  }
  let language = new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'zh-Hant'
  let paused = false
  let expanded = false
  let fullscreenPending = false
  let fullscreenButton
  const fullscreenChannel = 'scratch-gallery-player-fullscreen'
  const fullscreenSelector = '#app .fullscreen-button, body > .standalone-fullscreen-button'

  function label(selector, text) {
    const element = document.querySelector(selector)
    if (!element) return
    element.title = text
    element.setAttribute('aria-label', text)
    if (element.tagName === 'IMG') element.alt = text
  }

  function updatePauseLabel() {
    const { pause, resume } = translations[language]
    label('#app .pause-button', paused ? resume : pause)
  }

  function updateFullscreenLabel() {
    const { fullscreen, exitFullscreen } = translations[language]
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement
    label(fullscreenSelector, isFullscreen || expanded ? exitFullscreen : fullscreen)
  }

  function fullscreenIcon(isExpanded) {
    const corners = isExpanded ? 'M3 9h6V3m12 6h-6V3M3 15h6v6m12-6h-6v6' : 'M9 3H3v6m12-6h6v6M9 21H3v-6m12 6h6v-6'
    return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${corners}" fill="none" stroke="#575e75" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`)
  }

  function requestExpansion(nextExpanded) {
    window.parent.postMessage({ channel: fullscreenChannel, expanded: nextExpanded }, window.location.origin)
  }

  async function toggleFullscreen(event) {
    event.stopImmediatePropagation()
    if (fullscreenPending) return
    if (expanded) {
      requestExpansion(false)
      return
    }

    fullscreenPending = true
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen
        await exit?.call(document)
      } else if (document.fullscreenEnabled && document.body.requestFullscreen) {
        await document.body.requestFullscreen()
      } else {
        // The host can still expand the player when the iframe lacks promise-based fullscreen.
        requestExpansion(true)
      }
    } catch {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) requestExpansion(true)
    } finally {
      fullscreenPending = false
    }
  }

  function setupEmbeddedFullscreen() {
    if (window.parent === window || !window.scaffolding) return
    fullscreenButton = document.querySelector(fullscreenSelector)
    if (!fullscreenButton) {
      fullscreenButton = document.createElement('img')
      fullscreenButton.className = 'control-button fullscreen-button'
      fullscreenButton.src = fullscreenIcon(false)
      fullscreenButton.draggable = false
      window.scaffolding.addControlButton({ element: fullscreenButton, where: 'top-right' })
    }
    fullscreenButton.setAttribute('role', 'button')
    fullscreenButton.tabIndex = 0
    fullscreenButton.addEventListener('click', toggleFullscreen, { capture: true })
    fullscreenButton.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      toggleFullscreen(event)
    })
  }

  function renderLanguage() {
    const copy = translations[language]
    document.documentElement.lang = language
    label('#launch', copy.start)
    label('#loading', copy.loading)
    label('#app .green-flag-button', copy.greenFlag)
    label('#app .stop-all-button', copy.stop)
    const errorTitle = document.getElementById('player-error-title')
    if (errorTitle) errorTitle.textContent = copy.error
    const errorDetails = document.getElementById('player-error-details')
    if (errorDetails) errorDetails.textContent = copy.details
    updatePauseLabel()
    updateFullscreenLabel()
  }

  window.vm?.runtime?.on('RUNTIME_PAUSED', () => {
    paused = true
    updatePauseLabel()
  })
  window.vm?.runtime?.on('RUNTIME_UNPAUSED', () => {
    paused = false
    updatePauseLabel()
  })
  document.addEventListener('fullscreenchange', updateFullscreenLabel)
  document.addEventListener('webkitfullscreenchange', updateFullscreenLabel)

  window.addEventListener('message', ({ source, origin, data }) => {
    if (window.parent === window || source !== window.parent || origin !== window.location.origin) return
    if (data?.channel === fullscreenChannel && typeof data.expanded === 'boolean' && fullscreenButton) {
      expanded = data.expanded
      fullscreenButton.src = fullscreenIcon(expanded)
      updateFullscreenLabel()
      return
    }
    if (data?.channel !== 'scratch-gallery-player-language' || (data.language !== 'en' && data.language !== 'zh-Hant')) return
    if (language === data.language) return
    language = data.language
    renderLanguage()
  })

  setupEmbeddedFullscreen()
  renderLanguage()
})()
