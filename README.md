# Scratch 學習館

繁體中文／英文 Scratch 作品展示站，使用 Vue 3、Vite 與 Node.js 24。站主在本機打包遊戲，透過 Firebase 管理活動、作品與投票；Netlify Functions／Blobs 提供頁面、計數與排行。

雲端設定與驗收進度見[活動](docs/FIREBASE-ADMIN-SETUP.md)、[作品](docs/FIREBASE-WORKS-SETUP.md)及[投票指南](docs/FIREBASE-VOTING-SETUP.md)。

## 本機與驗證

```powershell
npm ci
npm run dev                 # http://127.0.0.1:3000
npm run verify              # 目錄、資源、型別、安全、維護回歸、建置及輸出
npm run verify:local        # verify + Chrome 遊戲測試 + 連網 npm 弱點掃描
```

Chrome 可用 `CHROME_PATH` 指定。`verify:local` 產生 noindex 測試版 `dist/`，不可直接上傳正式站；詳細檢查與故障處理見 [SECURITY.md](SECURITY.md)。純文件修改執行 `git diff --check`。

## 架構與入口

| 入口 | 用途 |
| --- | --- |
| `src/main.js` | 依網址載入首頁、師生作品庫、作品介紹、活動展或後台。首頁不載入完整目錄，作品庫每頁 9 件。 |
| `public/games.json`、`creators.json` | 本機打包與遷移資料。永久 `creatorId` 關聯作者，role 決定師生分類。獨立示範另存 `standalone-games.json`。 |
| `src/components/`、`media.js`、`i18n.js` | 導覽、卡片、播放器、媒體及雙語介面。共用樣式在根目錄 `styles.css`。 |
| `scripts/build-site.mjs`、`site-policy.mjs` | 建置伺服器模板、後台、SEO 與 CSP。Firebase 模式動態渲染作品頁和 sitemap，legacy 保留靜態頁。 |
| `netlify/functions/` | 首頁、公開查詢、站主管理與投票同步。Firestore 由伺服器存取；Google 範本在 `integrations/google-voting/`。 |
| 計數與排行 | 同瀏覽器計數冷卻 30 分鐘，GET 快取 60 秒；本機使用測試資料。[煉金塔規格](docs/WORD-ALCHEMY-TOWER-DESIGN.md) |

## 匯入與更新作品

只匯入可信任且已取得公開授權的作品。作者及作品 UUID 永久保留。

```powershell
npm run register:creator -- --name "學生名字" --class "Scratch-115"
npm run capture-previews -- "C:\Games\math.sb3" --slug math-adventure
```

作者身分由 `role` 設定，沒有 `--teacher` 參數。同名作者不自動合併。預覽候選放在 `.packages/previews/math-adventure/`，目視選擇清楚、有代表性的 480×360 WebP；可用 `--times "800,1600,3000,5000,8000,12000"` 重擷取。

```powershell
npm run import-game -- "C:\Games\math.sb3" `
  --title "數學探險島" `
  --creator-id "123e4567-e89b-42d3-a456-426614174000" `
  --description "練習基礎運算與問題解決。" `
  --category "數學" --age "8–12 歲" --tags "運算,闖關" `
  --thumbnail ".packages\previews\math-adventure\04-7000ms.webp"
```

新作品自動取得 UUID，並標記 `releasePending: true`。同作者的新作品沿用作者 UUID，省略作品 `--id`。更新既有作品必須指定原 UUID：

```powershell
npm run import-game -- "C:\Games\math-v2.sb3" --id "原作品 UUID" --replace
```

更新只覆寫明確提供的欄位，保留原標題、上架時間、封面與圖層。可用 `--devices "desktop,mobile"`、`--controls`、`--objective` 更新資料；全部參數見 `npm run import-game -- --help`。活動示範使用 `--standalone <英文代號>`，更新再加 `--replace`。

匯入先在 `.packages/` 暫存與備份，失敗會回復；回復失敗時保留備份。若程序中斷，先核對備份與目錄，再移除 `.packages/import.lock`。匯入期間不要同時手改 JSON 或清理共用素材。

優先使用 SB3 產線。若手動匯入 TurboWarp ZIP，先解壓到 `public/games/<UUID>/`，確認有 `index.html`，再依 `games.json` 現有欄位填入作者、描述、入口、封面及 `releasePending: true`，最後執行共用資源整理與完整驗證。

## 素材與清理

- 網站封面／展示圖優先 WebP、AVIF，建議每張 ≤1.5 MB；依顯示尺寸輸出。
- Scratch 內部造型／背景保留 PNG、SVG 等原生格式，不直接改成 WebP 或改副檔名。官方 [SB3 格式定義](https://github.com/scratchfoundation/scratch-parser/blob/master/lib/sb3_definitions.json) 的造型格式不含 WebP。
- 遊戲共用素材每檔上限 2.5 MB；影片建議 MP4／WebM ≤12 MB，網站音訊 MP3／M4A／OGG ≤2 MB，其他單檔 ≤15 MB。Scratch 內部音效由打包流程維護。
- 封面為遊玩入口，名稱連到作品介紹；遊戲按需載入，關閉釋放 iframe。非首屏圖片延遲載入，影片離開畫面／背景時暫停。
- `public/games/_shared/` 依內容雜湊共用執行核心與素材，不可整個刪除。

```powershell
npm run optimize:games      # 共用重複素材、清除未引用資源
npm run audit:assets        # 大小與重複內容預算
```

驗證後可刪除 `.packages/` 裡的匯出 ZIP、未選封面、檢查截圖及 Python 快取。此目錄也包含生成腳本與原始母片，不能整個清空；SB3、題庫、生成腳本與必要素材來源應保留。`dist/` 可重建，`public/` 都會公開，不放私人來源。

首頁使用 12 秒、480×854 無聲預覽及 WebP poster，點開才載入完整版；reduced-motion 預設靜態。需要重建時使用本機 FFmpeg，並目視確認畫質：

```powershell
ffmpeg -ss 3 -i src/assets/IMG_3294.MP4 -t 12 -an -vf "scale=480:-2,fps=24" -c:v libx264 -preset slow -crf 29 -pix_fmt yuv420p -movflags +faststart src/assets/showcase-preview.mp4
ffmpeg -ss 3 -i src/assets/IMG_3294.MP4 -frames:v 1 -vf "scale=480:-2" -quality 82 src/assets/showcase-poster.webp
```

## 活動、更新提示與發布

活動由後台管理。前台每 30 秒及回到頁面時更新，導覽提示在造訪後清除。`src/contentUpdates.js` 保存 legacy 種子與時間規則。[萬聖節筆記](docs/HALLOWEEN-ACTIVITY-NOTES.md)

**每次正式部署皆須站主當次核准。** Firebase 先部署資源、核對正式檔案並登錄，再由後台確認上架。來源 JSON 保持 `releasePending: true`，首次上架起算 NEW 15 天。已部署檔案可由直接網址開啟。只改介紹、標籤、排序或上下架，可直接用後台。

`npm run release:mark -- <作品 UUID>` 在 Firebase 模式使用同一筆發布交易，需先存草稿並驗證正式資源。legacy 才在核准合併前標記 JSON 日期；有待發布作品會擋下正式建置。[作品發布流程](docs/FIREBASE-WORKS-SETUP.md)

Netlify 依 `netlify.toml` 建置並發佈 `dist/` 與 Functions。正式網址為 `https://giraffegallery.com`，由 `SITE_URL`／Netlify `URL` 決定；舊 Netlify 子網域轉址至正式網域，只支援根網域部署。正式頁有 canonical、分享標籤、sitemap；預覽 noindex，無 SPA catch-all。網域／標頭變更後執行 `npm run check:live -- https://giraffegallery.com`。可在 Search Console 提交 sitemap；不保證收錄與排名。

維護規則見 [AGENTS.md](AGENTS.md)，安全與 CI 見 [SECURITY.md](SECURITY.md)，歷史用量見 [Netlify 紀錄](docs/netlify-usage-log.md)。Scratch 是 Scratch Foundation 的專案，本站並非 Scratch 官方網站。
