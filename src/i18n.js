import { computed, onMounted, ref } from 'vue'
import { readStored, writeStored } from './lib/storage.js'

const language = ref('zh-Hant')
const englishCategories = {
  冒險: 'Adventure', 創意: 'Creative', 英語學習: 'English learning', 反應: 'Reflexes',
  動畫: 'Animation', 動作: 'Action', 闖關: 'Level challenge', 探險: 'Exploration', 互動動畫: 'Interactive animation',
}
const englishSingularCounts = {
  projectsLoaded: '{count} project loaded', matchingProjectsLoaded: '{count} matching project loaded',
  workCount: '{count} project', playCount: '{count} play', activityReminderDays: '{count} day left',
}
const messages = {
  'zh-Hant': {
    brandName: '東勢長頸鹿美語', brandGallery: 'Scratch 創作館',
    heroPartners: '東勢長頸鹿 × 鹿多多素養程式', heroBrandCourse: '鹿多多 Scratch 創作課',
    studentWorkLabel: '學生創作', teacherWorkLabel: '教師作品', scratchProject: 'Scratch 作品',
    workControls: '操作方式', workCredit: '創作者：{name}', devicesList: '可遊玩裝置：{devices}',
    workNoScript: '請開啟瀏覽器的 JavaScript，才能遊玩 Scratch 作品。',
    codeCreateShare: '寫程式 · 做創作 · 分享', englishAndCoding: '英語 × 程式設計',
    exploreGallery: '探索作品展', teacherShowcase: '老師創作實驗室', makingEyebrow: '創作過程',
    announcementsEyebrow: '活動動態', challengeEyebrow: 'Scratch 萬聖節創作挑戰', votingEyebrow: '人氣投票',
    newBadge: '新作', workCoverAlt: '《{title}》的遊戲畫面',
    workAuthorDetail: '{name}的作品介紹', featuredWorkFallback: '精彩作品', workDescriptionFallback: '一起來看看這件作品吧。', studentCreatorFallback: '學生創作者',
    footerMotto: '知識給我們力量，品格指引我們如何善用它。', scratchDisclaimer: '本網站並非 Scratch 官方網站。',
    skipToMain: '跳到主要內容', courseHighlights: '課程特色', searchWorksLabel: '搜尋作品',
    projectsLoaded: '已載入 {count} 件作品', matchingProjectsLoaded: '已載入 {count} 件符合條件的作品',
    projectsLoading: '正在載入作品…', loadingMore: '載入中…', morePending: '還有作品尚未搜尋，請繼續載入。',
    projectsUnavailable: '作品暫時無法載入', tryReload: '請稍後重新載入。', reload: '重新載入',
    missingWork: '找不到這個作品', missingWorkHelp: '作品可能已移動或下架。', backToGallery: '返回作品庫',
    home: '首頁', workDevices: '適用裝置', workDevicesFallback: '請依作品實際操作體驗', workGoal: '遊戲目標：{goal}',
    startPlaying: '如何開始遊玩', playingGuide: '點選作品封面開啟播放器，再按播放按鈕或綠旗開始。可使用播放器的暫停、停止及全螢幕控制；關閉視窗即可結束。',
    relatedWorks: '更多{category}作品',
    playerClose: '關閉遊戲播放器', playerTitle: '《{title}》遊戲播放器',
    scoreSaving: '成績儲存中，請稍候…', leaderboardLoading: '排行榜載入中…',
    scorePending: '成績尚未儲存，請重試。', scoreSaved: '成績已儲存。', leaderboardUpdated: '排行榜已更新。',
    scoreSaveFailed: '成績儲存失敗，請在播放器下方重試；離開頁面將無法保留本次成績。', leaderboardLoadFailed: '排行榜載入失敗，請返回選單後重試。',
    scoreRetry: '重試儲存成績',
    videoPlay: '播放預覽影片', videoPause: '暫停預覽影片', videoFullscreen: '全螢幕播放',
    videoFullscreenSound: '全螢幕播放並開啟聲音', videoLabel: '精彩影片', videoTitle: 'Scratch 創作展',
    videoClose: '關閉影片', videoUnsupported: '您的瀏覽器不支援影片播放。', videoVolumeHelp: '可使用播放器下方的音量按鈕調整或關閉聲音。',
    announcementNavigation: '切換活動公告', previousAnnouncement: '上一則活動', nextAnnouncement: '下一則活動', announcementPosition: '第 {current} 則，共 {count} 則公告', announcementJump: '查看第 {current} 則公告，{title}',
    showcasePreview: '作品預覽',
    halloweenAnnouncementTitle: '萬聖節活動的作品',
    eventsUnavailable: '活動資訊暫時無法載入',
    halloweenAnnouncementLead: '小鹿發現魔法燈熄了，就請大家用 Scratch 想辦法把它點亮。',
    halloweenAnnouncementText: '兩班同學各有自己的點子，有人做遊戲，也有人做動畫。先看看預覽，再挑一件你喜歡的作品吧！',
    halloweenAnnouncementVisit: '看同學的作品',
    halloweenShowcaseTitle: '萬聖節 Scratch 作品展', halloweenExhibitionTitleMain: '萬聖節', halloweenExhibitionTitleSub: 'Scratch 作品展',
    halloweenExhibitionScene: '戴紫色巫師帽的小鹿提著南瓜桶，在燈籠工坊伸手碰星星。',
    halloweenExhibitionEnter: '瀏覽作品',
    explore: '探索作品', teacher: '老師作品集', learning: '學習理念', announcementsNav: '活動公告', viewAnnouncements: '往下查看活動公告', hero: '孩子寫的程式，讓全世界看見。',
    heroText: '從一個想法出發，孩子練習邏輯、表達與解決問題，親手做出可以玩的作品。',
    exploreStudents: '探索學生作品', studentShowcase: '學生創作', creators: '今天，換孩子當創作者',
    search: '搜尋作品、學生或主題', class: '班級', allClasses: '全部', devices: '可遊玩裝置', allDevices: '所有裝置', desktop: '電腦', mobile: '行動裝置',
    noMatches: '還沒有符合的作品', tryAgain: '換個關鍵字或篩選條件，繼續探索孩子們的創意作品吧！', workCount: '共 {count} 件作品', showMore: '再顯示 {count} 件', showingCount: '目前顯示 {shown}／{total} 件',
    chooseCollection: '從這裡開始探索作品', collectionIntro: '學生與老師作品各自擁有完整空間，首頁也能保持快速、輕巧。', studentCollectionTitle: '學生作品集', studentCollectionText: '依班級、主題或裝置尋找孩子們的 Scratch 創作。', teacherCollectionTitle: '老師作品集', teacherCollectionText: '探索老師設計的遊戲、示範與教學創作。',
    announcementsTitle: '最新活動公告', activityComingSoon: '敬請期待', activityComingSoonText: '新的創作活動正在準備中，活動內容公布後就能從這裡查看。', halloweenStatus: '{date} 開始徵稿', activityClosed: '活動已截止', halloweenLabel: '本期活動', halloweenTitle: '萬聖節魔法 Scratch 創作挑戰', halloweenSummary: '南瓜燈正在等待大家的創意！用 Scratch 做出遊戲、動畫、互動故事或藝術作品，一起點亮萬聖節魔法派對。', halloweenDetailsLabel: '投稿重點', halloweenDatesTitle: '投稿期間', halloweenDates: '{start}－{end}', halloweenFormatsTitle: '創作形式', halloweenFormats: '遊戲、動畫、互動故事、繪圖或其他 Scratch 創作', halloweenFileTitle: '投稿檔案', halloweenFile: '上傳 1 個 SB3 檔案，檔案大小上限 10 MB', halloweenSubmit: '前往投稿', halloweenPreviewLabel: '活動說明', halloweenPreviewPlay: '播放萬聖節活動說明', halloweenPreviewAlt: '萬聖節魔法 Scratch 創作挑戰活動說明預覽', halloweenArtLine: '點擊預覽，聽小鹿介紹萬聖節魔法任務。',
    halloweenPrizesTitle: '活動獎勵', halloweenPrizeFirst: '第一名', halloweenPrizeFirstAmount: '500 元獎學金', halloweenPrizeSecond: '第二名', halloweenPrizeSecondAmount: '300 元獎學金', halloweenPrizeThird: '第三名', halloweenPrizeThirdAmount: '200 元獎學金',
    studentCollectionNav: '學生作品', teacherCollectionNav: '老師作品', studentGalleryTitle: '孩子的想法，在這裡變成作品', studentGalleryText: '搜尋學生、班級或主題，點選封面就能開始遊玩。', teacherGalleryTitle: '老師的創作實驗室', teacherGalleryText: '收錄課堂示範、教學靈感與老師完成的 Scratch 作品。', collectionEmpty: '作品正在準備中', collectionEmptyText: '第一件作品上架後，就會自動出現在這裡。',
    learningTitle: '不只學會操作，更學會把想法做出來', learningText: '作品展記錄的不只是完成品，更是孩子反覆嘗試、修正與分享的過程。',
    making: '一份作品，三段成長', idea: '發想', build: '實作', share: '發表',
    learnByDoing: '做中學', crossCurricular: '跨域創作', confidentSharing: '自信分享',
    createTitle: '創造', createText: '從故事、角色到遊戲規則，把腦中的點子化成作品。', communicateTitle: '溝通', communicateText: '說明玩法與設計選擇，練習讓別人理解自己的想法。', collaborateTitle: '合作', collaborateText: '觀摩同學、交換回饋，在彼此作品裡找到新方法。', thinkTitle: '思考', thinkText: '拆解問題、測試條件，從錯誤中找出更好的解法。',
    ideaText: '從生活觀察與故事想像出發，定義角色、目標與玩法。', buildText: '用積木程式逐步測試，讓角色、互動與規則真的運作。', shareText: '以創作者署名公開展示，邀請家長與朋友親自遊玩。',
    footer: 'Scratch 創作成果展', languageLabel: '選擇語言', primaryNavigation: '主要導覽', navigationLabel: '網站導覽', browseMenu: '瀏覽選單', openMenu: '開啟導覽選單', closeMenu: '關閉導覽選單', homeLabel: 'Scratch 創作館首頁', newContent: '有新內容', menuHasUpdates: '導覽中有新內容', drawerTitle: '今天想探索什麼？', drawerText: '從學生作品、活動消息到教學創作，選一條路開始逛逛。', drawerFooter: '每一個作品，都是孩子把想法做出來的證明。', studentNavHint: '瀏覽學生 Scratch 創作', eventsNavHint: '查看活動與投稿消息', teacherNavHint: '探索老師示範作品', learningNavHint: '認識課程學習理念', activityReminderLabel: '活動時程提醒', activityReminderUpcoming: '萬聖節創作挑戰即將開始', activityReminderOpen: '萬聖節創作挑戰徵稿中', activityReminderClosing: '萬聖節創作挑戰即將截止', activityReminderDates: '{start} 開始徵稿 · {end} 截止', activityReminderDays: '剩 {count} 天', viewActivity: '查看活動', dismissActivityReminder: '關閉活動提醒', newWork: '新上架', playWork: '遊玩《{title}》', unavailableWork: '《{title}》尚未上架', play: '遊玩', ready: '可遊玩', preparing: '準備中', playCount: '遊玩次數 {count}', closeGame: '關閉這個視窗即可結束遊戲。', nowPlaying: '正在遊玩', close: '關閉',
  },
  en: {
    brandName: 'Dongshi Giraffe English', brandGallery: 'Scratch Gallery',
    heroPartners: 'Dongshi Giraffe English × Lu Duoduo Coding', heroBrandCourse: 'Lu Duoduo Scratch class',
    studentWorkLabel: 'Student project', teacherWorkLabel: 'Teacher project', scratchProject: 'Scratch project',
    workControls: 'Controls', workCredit: 'Created by {name}', devicesList: 'Supported devices: {devices}',
    workNoScript: 'Enable JavaScript in your browser to play Scratch projects.',
    codeCreateShare: 'Code · Create · Share', englishAndCoding: 'English × Coding',
    exploreGallery: 'Explore the gallery', teacherShowcase: "TEACHER'S LAB", makingEyebrow: 'The making of',
    announcementsEyebrow: "What's happening", challengeEyebrow: 'SCRATCH HALLOWEEN CHALLENGE', votingEyebrow: 'Community vote',
    newBadge: 'NEW', workCoverAlt: 'Gameplay from “{title}”',
    workAuthorDetail: 'Project details by {name}', featuredWorkFallback: 'Featured project', workDescriptionFallback: 'Take a look at this project.', studentCreatorFallback: 'Student creator',
    footerMotto: 'Knowledge gives us power. Character guides how we use it.', scratchDisclaimer: 'This is an independent site and is not affiliated with Scratch.',
    skipToMain: 'Skip to main content', courseHighlights: 'Course highlights', searchWorksLabel: 'Search projects',
    projectsLoaded: '{count} projects loaded', matchingProjectsLoaded: '{count} matching projects loaded',
    projectsLoading: 'Loading projects…', loadingMore: 'Loading…', morePending: 'Load more projects to continue searching.',
    projectsUnavailable: 'Projects are temporarily unavailable', tryReload: 'Reload in a moment.', reload: 'Reload',
    missingWork: 'Project not found', missingWorkHelp: 'The project may have moved or been unpublished.', backToGallery: 'Back to the gallery',
    home: 'Home', workDevices: 'Supported devices', workDevicesFallback: 'See the project for controls', workGoal: 'Goal: {goal}',
    startPlaying: 'How to play', playingGuide: 'Select the cover to open the player, then press Play or the green flag. You can pause, stop, or play fullscreen. Close the window to finish.',
    relatedWorks: 'More projects in {category}',
    playerClose: 'Close game player', playerTitle: 'Game player for “{title}”',
    scoreSaving: 'Saving your score…', leaderboardLoading: 'Loading the leaderboard…',
    scorePending: 'Your score has not been saved. Please try again.', scoreSaved: 'Score saved.', leaderboardUpdated: 'Leaderboard updated.',
    scoreSaveFailed: 'Could not save your score. Try again below the player before leaving this page.', leaderboardLoadFailed: 'Could not load the leaderboard. Return to the menu and try again.',
    scoreRetry: 'Retry saving score',
    videoPlay: 'Play preview video', videoPause: 'Pause preview video', videoFullscreen: 'Play fullscreen',
    videoFullscreenSound: 'Play fullscreen with sound', videoLabel: 'Featured video', videoTitle: 'Scratch Showcase',
    videoClose: 'Close video', videoUnsupported: 'Your browser does not support video playback.', videoVolumeHelp: 'Use the volume control below the video to adjust or mute the sound.',
    announcementNavigation: 'Browse event announcements', previousAnnouncement: 'Previous event', nextAnnouncement: 'Next event', announcementPosition: 'Announcement {current} of {count}', announcementJump: 'Show announcement {current}, {title}',
    showcasePreview: 'Project previews',
    halloweenAnnouncementTitle: 'Halloween Event Projects',
    eventsUnavailable: 'Events temporarily unavailable',
    halloweenAnnouncementLead: 'When the magic lantern went out, the little giraffe asked everyone to find a way to light it again with Scratch.',
    halloweenAnnouncementText: 'Some students made games. Others made animations. Watch a few previews, then pick one to try.',
    halloweenAnnouncementVisit: 'See the student projects',
    halloweenShowcaseTitle: 'Halloween Scratch Showcase', halloweenExhibitionTitleMain: 'Halloween', halloweenExhibitionTitleSub: 'Scratch Showcase',
    halloweenExhibitionScene: 'The little giraffe wears a purple witch hat and carries a pumpkin bucket while reaching for a star in a lantern workshop.',
    halloweenExhibitionEnter: 'Browse projects',
    explore: 'Explore Games', teacher: "Teacher's Corner", learning: 'Why We Create', announcementsNav: 'Events', viewAnnouncements: 'Scroll down to event announcements', hero: 'Kids code it. The world gets to play.',
    heroText: 'Every project starts with an idea. Along the way, kids practice thinking things through, sharing their voice, and solving problems.',
    exploreStudents: 'See Student Games', studentShowcase: 'STUDENT SHOWCASE', creators: 'Made by young creators',
    search: 'Creator, class, or topic', class: 'Class', allClasses: 'All classes', devices: 'Play on', allDevices: 'All devices', desktop: 'Computer', mobile: 'Mobile',
    noMatches: 'Nothing here just yet', tryAgain: 'Try a different keyword or filter to discover more student creations.', workCount: '{count} projects', showMore: 'Show {count} more', showingCount: 'Showing {shown} of {total}',
    chooseCollection: 'Choose a collection', collectionIntro: 'Student and teacher projects each have their own space, keeping the homepage quick and focused.', studentCollectionTitle: 'Student projects', studentCollectionText: 'Find young creators by class, topic, or supported device.', teacherCollectionTitle: 'Teacher projects', teacherCollectionText: 'Explore games, demonstrations, and teaching ideas made by teachers.',
    announcementsTitle: 'Latest events', activityComingSoon: 'Coming soon', activityComingSoonText: 'A new creative challenge is being prepared. Full details will appear here when it is announced.', halloweenStatus: 'Submissions open {date}', activityClosed: 'Submissions closed', halloweenLabel: 'Featured event', halloweenTitle: 'Halloween Magic Scratch Challenge', halloweenSummary: 'The pumpkin lights need your ideas! Create a Scratch game, animation, interactive story, or artwork and help light up our Halloween party.', halloweenDetailsLabel: 'Submission highlights', halloweenDatesTitle: 'Submission period', halloweenDates: '{start}–{end}', halloweenFormatsTitle: 'What to create', halloweenFormats: 'A game, animation, interactive story, artwork, or another Scratch creation', halloweenFileTitle: 'What to upload', halloweenFile: 'One SB3 file, up to 10 MB', halloweenSubmit: 'Submit your project', halloweenPreviewLabel: 'Event preview', halloweenPreviewPlay: 'Play the Halloween activity introduction', halloweenPreviewAlt: 'Preview of the Halloween Magic Scratch Challenge introduction', halloweenArtLine: 'Hear the giraffe explain the challenge.',
    halloweenPrizesTitle: 'Event prizes', halloweenPrizeFirst: '1st place', halloweenPrizeFirstAmount: 'NT$500 scholarship', halloweenPrizeSecond: '2nd place', halloweenPrizeSecondAmount: 'NT$300 scholarship', halloweenPrizeThird: '3rd place', halloweenPrizeThirdAmount: 'NT$200 scholarship',
    studentCollectionNav: 'Student projects', teacherCollectionNav: 'Teacher projects', studentGalleryTitle: 'Big ideas, built by young creators', studentGalleryText: 'Search by creator, class, or topic, then select a cover to play.', teacherGalleryTitle: "The teacher's creative lab", teacherGalleryText: 'Classroom demonstrations, teaching ideas, and Scratch projects made by teachers.', collectionEmpty: 'Projects are on the way', collectionEmptyText: 'The first project will appear here automatically when it is published.',
    learningTitle: 'Learning to bring ideas to life', learningText: 'These projects show how students experiment, improve, and share their work.',
    making: 'One project, three steps', idea: 'Imagine', build: 'Make', share: 'Share',
    learnByDoing: 'Learn by doing', crossCurricular: 'Create across subjects', confidentSharing: 'Share with confidence',
    createTitle: 'Create', createText: 'Turn stories, characters, and game rules into something real.', communicateTitle: 'Speak up', communicateText: 'Explain how it works and help others see your idea.', collaborateTitle: 'Create together', collaborateText: 'Swap ideas, learn from classmates, and find new ways forward.', thinkTitle: 'Think it through', thinkText: 'Break big problems into steps, test ideas, and learn from mistakes.',
    ideaText: 'Start with something you notice, a story you love, or a wild idea.', buildText: 'Use code blocks to test, tweak, and bring characters and rules to life.', shareText: 'Put your name on your work and invite family and friends to give it a try.',
    footer: 'Scratch Creation Showcase', languageLabel: 'Choose language', primaryNavigation: 'Primary navigation', navigationLabel: 'Site navigation', browseMenu: 'Browse', openMenu: 'Open navigation menu', closeMenu: 'Close navigation menu', homeLabel: 'Scratch Gallery home', newContent: 'New', menuHasUpdates: 'New content is available in the menu', drawerTitle: 'What will you explore?', drawerText: 'Choose a path through student projects, event news, teacher creations, and our learning approach.', drawerFooter: 'Every project is proof that a young creator brought an idea to life.', studentNavHint: 'Browse student Scratch projects', eventsNavHint: 'See events and submission news', teacherNavHint: 'Explore teacher demonstrations', learningNavHint: 'Learn about the course approach', activityReminderLabel: 'Activity schedule reminder', activityReminderUpcoming: 'Halloween Challenge starts soon', activityReminderOpen: 'Halloween Challenge submissions are open', activityReminderClosing: 'Halloween Challenge ends soon', activityReminderDates: 'Submissions {start} · Deadline {end}', activityReminderDays: '{count} days left', viewActivity: 'View event', dismissActivityReminder: 'Dismiss activity reminder', newWork: 'Just added', playWork: 'Play “{title}”', unavailableWork: '“{title}” is not available yet', play: 'Play', ready: 'Ready to play', preparing: 'Coming soon', playCount: '{count} plays', closeGame: 'Close this window when you are finished playing.', nowPlaying: 'Now playing', close: 'Close',
  },
}

let initialized = false

export function useLanguage() {
  const isEnglish = computed(() => language.value === 'en')
  const t = (key, values = {}) => {
    const singular = isEnglish.value && String(values.count) === '1' && Object.hasOwn(englishSingularCounts, key)
    const message = singular ? englishSingularCounts[key] : messages[language.value][key] ?? messages['zh-Hant'][key] ?? key
    return message.replace(/\{(\w+)\}/g, (placeholder, name) => Object.hasOwn(values, name) ? String(values[name]) : placeholder)
  }
  const categoryLabel = (category) => {
    if (!category) return t('scratchProject')
    return isEnglish.value && Object.hasOwn(englishCategories, category) ? englishCategories[category] : category
  }
  const setLanguage = (value) => {
    if (!Object.hasOwn(messages, value)) return
    language.value = value
    writeStored('scratch-gallery-language', value)
    document.documentElement.lang = value
  }
  onMounted(() => {
    if (initialized) return
    initialized = true
    const saved = readStored('scratch-gallery-language')
    if (saved && Object.hasOwn(messages, saved)) setLanguage(saved)
  })
  return { language, t, setLanguage, isEnglish, categoryLabel }
}
