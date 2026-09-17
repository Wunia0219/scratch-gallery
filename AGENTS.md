# Scratch Gallery Agent Guide

## 專案與入口
- Vue 3 + Vite 靜態網站，Node.js 24；無後端、登入、資料庫或公開上傳。介面使用繁體中文。
- 先讀 README.md 的架構與操作說明；修改安全、部署或套件時另讀 SECURITY.md。
- `src/main.js` 依網址掛載 `App.vue` 首頁或 `WorkPage.vue` 作品頁；共用樣式在 `styles.css`。
- `src/components/` 放卡片、影片及遊戲對話框；`src/media.js` 管理展示媒體。
- `public/games.json` 以 `creatorId` 關聯 `public/creators.json`；`src/lib/catalog.js` 驗證並合成目錄，`useGames.js` 供畫面使用。
- `scripts/build-site.mjs` 預先渲染首頁與 `/works/<UUID>/`，產生 SEO 檔案、404 與安全標頭；政策集中在 `scripts/site-policy.mjs`。
- Netlify 依 `netlify.toml` 建置，只發佈 `dist/`；不要手改產出檔或加入 SPA catch-all 轉址。

## 驗證
- 安裝依 lockfile 使用 `npm ci`；開發使用 `npm run dev`。
- 程式、作品或建置修改後執行 `npm run verify`（目錄、資源、型別、安全、建置與輸出檢查）。純文件修改檢查內容與 `git diff --check` 即可。
- 遊戲、播放器、安全政策或套件變更另跑 `npm run verify:local`，含瀏覽器測試與連網弱點掃描；需 Chrome，可用 `CHROME_PATH` 指定。
- `verify:local` 產出 noindex 測試版，不可直接部署。正式網域／標頭變更後執行 `npm run check:live -- <正式網址>`。
- GitHub Actions 驗證 main、PR 及每週排程；套件合併須確認 CI 與 Netlify 成功，不略過失敗或直接執行 `npm audit fix --force`。

## 產品與安全界線
- 版本讀取 `package.json`；維持藍／黃／橘視覺、寬鬆響應式排版、既有功能及官方品牌素材。
- 封面是遊玩入口，作品名稱連到介紹頁；不加重複遊玩按鈕。作者 `role` 衍生 `creatorType`，區分師生作品。
- 控制項至少 44×44 px，保留鍵盤操作、焦點、對比與 reduced-motion；圖示使用 SVG。
- 遊戲只按需載入，關閉時釋放 iframe；維持 `sandbox="allow-scripts allow-pointer-lock"`，不可加入 `allow-same-origin`。
- 僅匯入可信任遊戲；保留素材路徑白名單與首頁／遊戲分離的 CSP。`public/` 全部公開，不放秘密或私人原始檔。
- 正式網址由 `SITE_URL` 或 Netlify `URL` 提供；預覽維持 noindex，正式頁保留 canonical、分享標籤與 sitemap。
- 保留目前作者署名，由站主確認公開授權；noindex 不等於存取控制。

## 作品與媒體
- 作者及作品 UUID 永久保留；先用 `register:creator` 建作者，再以 `import-game -- <file.sb3> --creator-id <UUID>` 匯入。老師身分設定在作者 `role`，沒有 `--teacher` 參數。
- 匯入前用 `capture-previews -- <file.sb3> --slug <slug>` 產生候選，目視選擇清楚且具代表性的 480×360 畫面，以 `--thumbnail` 傳入。
- 更新作品明確指定原 `--id` 與 `--replace`；新作品使用新 UUID。不要手改打包結果；維持 turbo/autoplay 關閉及播放、暫停、停止、全螢幕控制。
- `public/games/_shared/` 是共用資源；透過 `optimize:games` 清理未引用檔案，不直接刪除整個目錄。
- 圖片優先 AVIF/WebP，適當尺寸、延遲載入與非同步解碼；影片 MP4/WebM，音訊 MP3/M4A/OGG，WAV 僅短音效。大小預算見 README.md，新增素材跑 `audit:assets`。
- 不預載所有遊戲或大型媒體；離開畫面／背景時暫停影片，關閉釋放資源，保留雜湊資產快取。
- 驗證後清除暫存套件、未選預覽、截圖及無用或重複媒體；保留必要來源、選定封面與遊戲產出。
