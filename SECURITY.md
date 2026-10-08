# Scratch Gallery 安全維護

訪客不需要登入；管理後台使用 Firebase Google 登入，沒有付款或公開上傳。計數只保存匿名事件；排行榜另保存玩家自行輸入的名稱與成績。`public/` 全部公開，不放權杖、私人 SB3 或未授權素材；noindex 不是存取控制。

## 防護界線

- 活動管理 API 驗證 Firebase ID token（含撤銷狀態）與 `admins/{uid}` 的啟用 owner 權限。瀏覽器不能直接讀寫 Firestore；`firestore.rules` 預設全部拒絕，Admin SDK 的權限由 IAM 控制。服務帳號私鑰只能放在本機受保護檔案或 Netlify Functions 的秘密設定。
- 草稿與公開活動／作品分開保存；發布／關閉、版本更新及稽核在同一個資料庫交易內完成。作品另保留私有版本紀錄，還原只建立草稿。管理寫入同源限定、JSON 大小限制、版本衝突與重試識別碼避免誤覆寫。公開回應採明確欄位投影，不回傳草稿、權限或稽核。
- 遊戲與封面來源由建置資源清單限制；正式上架需要正式網址檔案的雜湊驗證及資源登錄，本機驗證不能啟動新作品首次上架。正式資源登錄後拒絕以 `--local` 覆寫該資料庫。Firebase 建置移除公開原始作品／作者 JSON 及靜態作品頁；動態 404／sitemap 與計數／排行榜資格都使用有效公開作品。
- `/admin/` 使用獨立 CSP，僅增加 Google 登入需要的腳本、連線及 iframe 來源，no-store／noindex。公開首頁和遊戲的 CSP 維持隔離。
- 預覽環境不能使用正式 Firebase 專案；未配置獨立測試專案時管理 API 拒絕服務。Firebase 正式模式遇到讀取失敗時不回復舊活動，避免已關閉活動再曝光。首頁與公開設定有 15 秒 CDN 快取，前台每 30 秒重新讀取；不可將活動開關當作敏感檔案的存取控制。
- 新增 SDK 時以相容的 `@grpc/grpc-js` override 使用修補版，避免 Firebase Web SDK 固定舊的傳遞相依套件。移除 override 前重新掃描；不得降級 Firebase 或跳過弱點檢查。

- 網站 CSP 禁止行內程式、eval、外部框架／嵌入、表單、外部 base URL 與外掛；遊戲所需行內 script／eval 只開放於隔離的 `/games/*`，連線限定本站及部署來源。
- iframe 固定 `sandbox="allow-scripts allow-pointer-lock"`；Netlify CSP sandbox 另保護直接開啟的遊戲。不可加入 `allow-same-origin`。
- 遊戲素材提供無 credentials 的 `Access-Control-Allow-Origin: *`，供 opaque-origin iframe 讀取；不能存私人內容。
- 停用相機、麥克風、定位、付款與 USB；設定 nosniff、no-referrer、HSTS。作品／素材 URL 採本機白名單，拒絕重複 ID；輸出檢查阻擋常見秘密、私鑰、ZIP、SB3 與 source map，但不是完整秘密掃描。
- 計數 API 驗證作品／事件 UUID，只接受正式站同源寫入；localhost 與預覽不寫入正式計數。成功 GET 可在 Netlify 快取 60 秒，POST／錯誤 no-store。30 分鐘冷卻是瀏覽器體驗機制，不是防灌票。
- 排行榜另驗證啟用作品、1–8 個英數字名稱及成績上下限；父頁驗證訊息來源再呼叫 Function。無帳號、逐題驗證或同名寫入鎖定，屬友善排行；細節見[煉金塔筆記](docs/WORD-ALCHEMY-TOWER-DESIGN.md)。

## 檢查與部署

```powershell
npm run verify:local
npm run check:live -- https://giraffegallery.com
```

`verify:local` 執行 verify、Chrome 全遊戲測試及 `npm audit --audit-level=high`，需要 Chrome 與網路；失敗即停止，不自動更新／推送。它清除正式部署環境設定，產出 noindex 測試版，正式部署交由 Netlify 重建。

`test:browser` 使用 127.0.0.1:4173 模擬 Netlify 標頭，檢查遊戲啟動、沙盒／localStorage 隔離、關閉釋放、無 JavaScript 內容與手機寬度。Chrome 路徑用 `CHROME_PATH`；更改 `BROWSER_TEST_PORT` 時建置與測試要一致，避免 CSP 來源不符。

`check:live` 唯讀抽查正式標頭、canonical、sitemap、404；網域／標頭變更後必跑。Vite dev／preview 不是完整 Netlify 環境，聲音、全螢幕、手機操作與分享預覽仍需人工確認。

## CI 與套件

- `quick-check.yml`：PR、main 更新及手動執行 verify。
- `security.yml`：每月 1、15 日 02:17 UTC（台灣 10:17）及手動執行，另跑弱點掃描與 Chromium。排程需已合併預設分支、帳號可用，時間可能延遲。
- Netlify 執行 verify 與高風險弱點掃描；失敗阻止新部署，但不移除既有版本。Netlify 不等待 GitHub 瀏覽器測試，合併前兩邊皆須確認成功。
- Dependabot 每週檢查，npm minor／patch 與 Actions 分組，major 分開審查；不自動合併。
- TypeScript 7 曾與目前 vue-tsc 不相容，維持 6.0.3 並暫排除 7.x；升級型別工具鏈時重新評估。不要 `npm audit fix --force`。

雲端帳務阻擋時先跑本機備援並處理帳號問題，不把本機通過當作 CI 通過。平台帳號建議開啟雙因素驗證；本站沒有全天候入侵監控。

## 故障處理

1. 匯入中斷：核對 `.packages/` 備份、作品與 JSON 後才清除 import.lock；勿刪回復失敗的備份。
2. 可疑作品：先停止公開或回復已知安全版本，移除目錄與記錄、驗證後依正式發布流程處理。
3. 秘密外洩：先撤銷／輪替，再清檔案及 Git 歷史；刪除檔案不會讓秘密失效。
4. 套件漏洞：依上游修補版本更新、重跑 verify:local，保留可回復版本。

每次正式發布需站主當次明確核准，規則見 [AGENTS.md](AGENTS.md)。署名與公開授權由站主確認；HTML、JSON、搜尋結果與素材均可能包含署名。
