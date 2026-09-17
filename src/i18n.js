import { computed, onMounted, ref } from 'vue'

const language = ref('zh-Hant')
const messages = {
  'zh-Hant': {
    explore: '探索作品', teacher: '老師作品集', learning: '學習理念', hero: '孩子寫的程式，讓全世界看見。',
    heroText: '從一個想法出發，孩子練習邏輯、表達與解決問題，親手做出可以玩的作品。',
    exploreStudents: '探索學生作品', studentShowcase: '學生作品集', creators: '今天，換孩子當創作者',
    search: '搜尋作品、學生或主題', class: '班級', allClasses: '全部', devices: '可遊玩裝置', allDevices: '所有裝置', desktop: '電腦', mobile: '行動裝置',
    noMatches: '還沒有符合的作品', tryAgain: '換個關鍵字或篩選條件，繼續探索孩子們的創意作品吧！', workCount: '共 {count} 件作品', showMore: '再顯示 {count} 件', showingCount: '目前顯示 {shown}／{total} 件',
    chooseCollection: '從這裡開始探索作品', collectionIntro: '學生與老師作品各自擁有完整空間，首頁也能保持快速、輕巧。', studentCollectionTitle: '學生作品集', studentCollectionText: '依班級、主題或裝置尋找孩子們的 Scratch 創作。', teacherCollectionTitle: '老師作品集', teacherCollectionText: '探索老師設計的遊戲、示範與教學創作。',
    studentCollectionNav: '學生作品', teacherCollectionNav: '老師作品', studentGalleryTitle: '孩子的想法，在這裡變成作品', studentGalleryText: '搜尋學生、班級或主題，點選封面就能開始遊玩。', teacherGalleryTitle: '老師的創作實驗室', teacherGalleryText: '收錄課堂示範、教學靈感與老師完成的 Scratch 作品。', collectionEmpty: '作品正在準備中', collectionEmptyText: '第一件作品上架後，就會自動出現在這裡。',
    teacherLab: 'Anita 老師的創作實驗室', teacherNote: '新的創作正在準備中，敬請期待。', comingSoon: '即將推出', teacherCollection: '老師作品集', nextWork: '下一件精彩創作', nextWorkText: '新的 Scratch 作品正在製作中，完成後將在這裡與大家見面。',
    learningTitle: '不只學會操作，更學會把想法做出來', learningText: '作品展記錄的不只是完成品，更是孩子反覆嘗試、修正與分享的過程。',
    making: '一份作品，三段成長', idea: '發想', build: '實作', share: '發表',
    learnByDoing: '做中學', crossCurricular: '跨域創作', confidentSharing: '自信分享',
    createTitle: '創造', createText: '從故事、角色到遊戲規則，把腦中的點子化成作品。', communicateTitle: '溝通', communicateText: '說明玩法與設計選擇，練習讓別人理解自己的想法。', collaborateTitle: '合作', collaborateText: '觀摩同學、交換回饋，在彼此作品裡找到新方法。', thinkTitle: '思考', thinkText: '拆解問題、測試條件，從錯誤中找出更好的解法。',
    ideaText: '從生活觀察與故事想像出發，定義角色、目標與玩法。', buildText: '用積木程式逐步測試，讓角色、互動與規則真的運作。', shareText: '以創作者署名公開展示，邀請家長與朋友親自遊玩。',
    footer: 'Scratch 創作成果展', languageLabel: '選擇語言', play: '遊玩', ready: '可遊玩', preparing: '準備中', creator: '創作者：', closeGame: '關閉這個視窗即可結束遊戲。', nowPlaying: '正在遊玩', close: '關閉',
  },
  en: {
    explore: 'Explore Games', teacher: "Teacher's Corner", learning: 'Why We Create', hero: 'Kids code it. The world gets to play.',
    heroText: 'Every project starts with an idea. Along the way, kids practice thinking things through, sharing their voice, and solving problems.',
    exploreStudents: 'See Student Games', studentShowcase: 'STUDENT SHOWCASE', creators: 'Made by young creators',
    search: 'Search games, creators, or topics', class: 'Class', allClasses: 'All classes', devices: 'Play on', allDevices: 'All devices', desktop: 'Computer', mobile: 'Mobile',
    noMatches: 'Nothing here just yet', tryAgain: 'Try a different keyword or filter to discover more student creations.', workCount: '{count} projects', showMore: 'Show {count} more', showingCount: 'Showing {shown} of {total}',
    chooseCollection: 'Choose a collection', collectionIntro: 'Student and teacher projects each have their own space, keeping the homepage quick and focused.', studentCollectionTitle: 'Student projects', studentCollectionText: 'Find young creators by class, topic, or supported device.', teacherCollectionTitle: 'Teacher projects', teacherCollectionText: 'Explore games, demonstrations, and teaching ideas made by teachers.',
    studentCollectionNav: 'Student projects', teacherCollectionNav: 'Teacher projects', studentGalleryTitle: 'Big ideas, built by young creators', studentGalleryText: 'Search by creator, class, or topic, then select a cover to play.', teacherGalleryTitle: "The teacher's creative lab", teacherGalleryText: 'Classroom demonstrations, teaching ideas, and Scratch projects made by teachers.', collectionEmpty: 'Projects are on the way', collectionEmptyText: 'The first project will appear here automatically when it is published.',
    teacherLab: "Anita's Creative Corner", teacherNote: 'A new project is in the works—check back soon!', comingSoon: 'Coming soon', teacherCollection: "Teacher's collection", nextWork: 'Something fun is on the way', nextWorkText: 'A new Scratch project is being made and will appear here soon.',
    learningTitle: 'More than learning to click—learning to create', learningText: 'These projects show the experimenting, improving, and sharing that happen along the way.',
    making: 'One project, three big steps', idea: 'Imagine', build: 'Make', share: 'Share',
    learnByDoing: 'Learn by doing', crossCurricular: 'Create across subjects', confidentSharing: 'Share with confidence',
    createTitle: 'Create', createText: 'Turn stories, characters, and game rules into something real.', communicateTitle: 'Speak up', communicateText: 'Explain how it works and help others see your idea.', collaborateTitle: 'Create together', collaborateText: 'Swap ideas, learn from classmates, and find new ways forward.', thinkTitle: 'Think it through', thinkText: 'Break big problems into steps, test ideas, and learn from mistakes.',
    ideaText: 'Start with something you notice, a story you love, or a wild idea.', buildText: 'Use code blocks to test, tweak, and bring characters and rules to life.', shareText: 'Put your name on your work and invite family and friends to give it a try.',
    footer: 'Scratch Creation Showcase', languageLabel: 'Choose language', play: 'Play', ready: 'Ready to play', preparing: 'Coming soon', creator: 'Created by: ', closeGame: 'Close this window when you are finished playing.', nowPlaying: 'Now playing', close: 'Close',
  },
}

export function useLanguage() {
  const t = (key, values = {}) => {
    const message = messages[language.value][key] ?? messages['zh-Hant'][key] ?? key
    return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), message)
  }
  const setLanguage = (value) => { language.value = value; localStorage.setItem('scratch-gallery-language', value); document.documentElement.lang = value }
  onMounted(() => { const saved = localStorage.getItem('scratch-gallery-language'); if (saved && messages[saved]) setLanguage(saved) })
  return { language, t, setLanguage, isEnglish: computed(() => language.value === 'en') }
}
