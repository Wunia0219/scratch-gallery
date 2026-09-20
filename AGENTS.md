# Scratch Gallery Agent Guide

## 專案與閱讀入口

- Vue 3 + Vite，Node.js 24，繁體中文介面；靜態前端搭配 Netlify Functions／Blobs，無登入、傳統資料庫或公開上傳。
- 先讀 [README.md](README.md) 的架構與操作；安全、部署或套件變更另讀 [SECURITY.md](SECURITY.md)。作品維護見 `docs/`，不要將過期規劃當作現況。
- `src/main.js` 按網址拆分首頁、師生作品庫與作品頁；首頁不載入作品目錄，作品庫每批 9 件。不新增 Router／全域狀態套件。
- `games.json` 以永久 creatorId 關聯 `creators.json`，作者 role 衍生 creatorType。catalog.js 驗證、useGames.js 提供資料；standalone-games.json 為獨立示範。
- build-site.mjs 預先渲染，瀏覽器重新掛載 Vue；site-policy.mjs 集中 SEO／CSP。Netlify 發佈 dist/ 與 Functions，不手改產出或加入 SPA catch-all。

## 驗證

- 安裝依 lockfile 使用 `npm ci`。程式、作品、建置變更跑 `npm run verify`；純文件檢查內容與 `git diff --check`。
- 遊戲、播放器、安全政策或套件變更另跑 `npm run verify:local`，包含 Chrome 與連網弱點掃描；Chrome 路徑可由 CHROME_PATH 指定。
- verify:local 的 dist/ 是 noindex 測試版，不可直接部署。正式網域／標頭變更後跑 `npm run check:live -- <正式網址>`。
- CI／Dependabot 時程及故障處理以 SECURITY.md 為準。套件合併須確認 GitHub 與 Netlify 成功，不略過失敗或執行 `npm audit fix --force`。

## 正式發布核准

- 使用者準備合併或發布時，主動檢查並提醒待發布作品與 release:mark 步驟；不可把本機／預覽驗證通過當作正式發布就緒。取得核准、標記上架時間後，以正式環境設定執行 verify，再推送或合併。
- 未取得站主當次明確同意，不得合併／推送 main 或觸發 Netlify 正式發布。每次新發布重新取得核准，不沿用先前授權。
- 本機、非 main 分支及 Deploy Preview 不代表正式發布授權。
- 新作品維持 `releasePending: true`；取得當次核准且準備合併前才執行 `npm run release:mark -- <UUID>`，publishedAt 與 NEW 的 15 天由此起算。

## 產品與安全

- 版本讀取 package.json，修改時同步 lockfile，畫面顯示 `ver X.Y.Z`。保留藍／黃／橘、寬鬆響應式、既有功能及官方品牌素材。
- 封面為遊玩入口，名稱連到介紹頁，不加重複遊玩鈕。控制項 ≥44×44 px，保留鍵盤、焦點、對比、reduced-motion；圖示用 SVG。
- 遊戲按需載入、關閉釋放 iframe；固定 `sandbox="allow-scripts allow-pointer-lock"`，不可加 allow-same-origin。保留素材白名單及網站／遊戲分離 CSP。
- public/ 全部公開，只匯入可信任作品，不放秘密或私人來源。保留作者署名，站主確認公開授權；noindex 不是存取控制。
- SITE_URL／Netlify URL 決定正式網址；正式 canonical、分享標籤、sitemap 及預覽 noindex 均須保留。

## 作品、素材與清理

- 先 register:creator，再 capture-previews 目視選 480×360 代表畫面，以 --thumbnail 匯入。老師身分用作者 role，無 --teacher 參數。
- 更新明確指定原 --id 與 --replace；新作品使用新 UUID。保留 turbo／autoplay 關閉及播放、暫停、停止、全螢幕控制，不手改打包結果。
- 網站圖片優先 WebP／AVIF；Scratch 內部 PNG／SVG／音效由來源與打包流程維護，不直接轉檔。預算與媒體命令見 README.md，新增素材跑 audit:assets。
- 用 optimize:games 清除未引用共用資源，不刪整個 _shared/。不預載所有遊戲／大型媒體；離開畫面或背景暫停影片，關閉釋放資源，保留雜湊快取。
- 每當使用者確認一項主要工作完成後，順便清理該次工作產生的暫存檔、匯出 ZIP、未選封面、檢查截圖、快取及不再需要的可重建輸出。清理前確認相關驗證已完成，完成後簡短回報清理結果。
- 保留 SB3、題庫、選定成果、生成腳本、必要母片及仍供回復使用的備份。`.packages/` 混有來源與暫存，不可整批清空；匯入中斷／回復失敗的備份先核對再處理。
