# 萬聖節 Scratch 活動維護筆記

「萬聖節魔法 Scratch 創作挑戰」徵集適合國小學生的遊戲、動畫、互動故事及藝術作品。

## 時程與來源

legacy 設定在 `src/contentUpdates.js` 的 `featuredActivity`。2026 年投稿期為台灣時間 9/29–10/23，前三名獎學金依序為 500、300、200 元。Firebase 模式以後台發布資料為準。

系統依提醒、開始與截止時間顯示預告、徵稿及最後三天提醒。關閉提醒只影響當期，截止後隱藏投稿入口。公開示範仍可直接開啟。

## 示範與更新

來源為 `萬聖節魔法-活動說明.sb3`，獨立示範 ID 為 `halloween-activity-intro`，記錄於 `public/standalone-games.json`，不加入師生作品庫。現有故事以小鹿邀請大家用 Scratch 創意點亮萬聖節魔法燈；完整規則由活動頁呈現。

```powershell
npm run import-game -- "萬聖節魔法-活動說明.sb3" --standalone halloween-activity-intro --replace
npm run verify:local
```

2026-09-20 盤點：20 張 PNG 與 4 張 SVG 共 1,592,154 bytes，最大圖片 508,642 bytes；3 個 WAV 共 554,470 bytes。封面已為 WebP，遊戲內素材保留原格式。本機 `.packages/halloween-scratch-studio/` 含生成腳本與母片，勿整批刪除。

## 投稿與待辦

投稿表單以已發布活動的 `submissionUrl` 為準。已規劃必填姓名／公開署名、年級、作品名稱、類型、簡介、單一 ≤10 MB SB3，以及原創與公開展示同意。表單可重複投稿；檔案上傳涉及 Google 帳戶資料，不可描述為「不收集 Email」，公布前確認表單實際設定及資料用途說明。

主辦方先私下審核、評分，只有入選且同意公開的作品才匯入網站。尚待確認：評分標準、結果公布日及是否需要評分表。正式發布依 [AGENTS.md](../AGENTS.md) 逐次取得核准。
