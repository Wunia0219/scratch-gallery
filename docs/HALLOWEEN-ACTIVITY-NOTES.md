# 萬聖節 Scratch 活動維護筆記

活動名稱為「萬聖節魔法 Scratch 創作挑戰」，對象以東勢長頸鹿補習班國小學生為主；接受遊戲、動畫、互動故事與藝術作品。內容需適合國小學生。

## 目前設定

時程、公開開關、投稿網址與預覽 ID 統一在 `src/contentUpdates.js` 的 `featuredActivity`。目前 `isPublished: false`，首頁只顯示「敬請期待」；已設定台灣時間 2026-09-28 開始、2026-10-23 截止，公布前仍須主辦方確認。

公布後依 remindFrom、startsAt、endsAt 顯示預告／徵稿／截止前三天提醒；截止後隱藏投稿連結。關閉提醒只影響當前階段，下一階段可再提醒。隱藏活動與 noindex 都不是存取控制，公開目錄內的示範仍可直接存取。

## 示範與更新

來源為 `萬聖節魔法-活動說明.sb3`，獨立示範 ID 為 `halloween-activity-intro`，記錄於 `public/standalone-games.json`，不加入師生作品庫。現有故事以小鹿邀請大家用 Scratch 創意點亮萬聖節魔法燈；完整規則由活動頁呈現。

```powershell
npm run import-game -- "萬聖節魔法-活動說明.sb3" --standalone halloween-activity-intro --replace
npm run verify:local
```

2026-09-20 盤點：20 張 PNG 與 4 張 SVG 共 1,592,154 bytes，最大圖片 508,642 bytes；3 個 WAV 共 554,470 bytes。封面已為 WebP，遊戲內素材保留原格式。本機 `.packages/halloween-scratch-studio/` 含生成腳本與母片，勿整批刪除。

## 投稿與待辦

投稿表單網址以 `featuredActivity.submissionUrl` 為準。已規劃必填姓名／公開署名、年級、作品名稱、類型、簡介、單一 ≤10 MB SB3，以及原創與公開展示同意。表單可重複投稿；檔案上傳涉及 Google 帳戶資料，不可描述為「不收集 Email」，公布前確認表單實際設定及資料用途說明。

主辦方先私下審核、評分，只有入選且同意公開的作品才匯入網站。尚待確認：正式公布時程、評分標準、獎項、結果公布日及是否需要評分表。正式發布依 [AGENTS.md](../AGENTS.md) 逐次取得核准。
