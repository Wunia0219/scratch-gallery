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
    label('#app .fullscreen-button, body > .standalone-fullscreen-button', isFullscreen ? exitFullscreen : fullscreen)
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
    if (data?.channel !== 'scratch-gallery-player-language' || (data.language !== 'en' && data.language !== 'zh-Hant')) return
    if (language === data.language) return
    language = data.language
    renderLanguage()
  })

  renderLanguage()
})()
