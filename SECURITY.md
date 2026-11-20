# Scratch Gallery 安全維護

訪客可匿名遊玩。計數保存匿名事件，排行榜另存玩家輸入的名稱與成績。本站無付款或公開上傳。

## 防護界線

- **管理權限**。API 核對 Firebase ID token（含撤銷狀態）及啟用的 owner。管理寫入限同源並檢查大小、版本及重試識別碼。Firestore 規則拒絕瀏覽器直接存取，Admin SDK 權限由 IAM 控制。
- **草稿與發布**。草稿、公開資料分開保存；發布、關閉、版本及稽核在同一交易更新。還原作品會建立草稿。前台 API、頁面、sitemap、計數與排行榜均依公開作品判定。Firebase 首次上架須先驗證正式資源雜湊並登錄；正式登錄後禁止以 `--local` 覆寫。
- **預覽與快取**。預覽須用獨立 Firebase 專案。正式資料讀取失敗時不回退舊活動。首頁／公開設定 CDN 快取 15 秒，前台每 30 秒更新；隱藏活動及 noindex 都無法保護公開檔案。
- **私有檔案**。服務帳號限受保護的本機檔案或 Functions 秘密設定。Vite dev 封鎖 `.packages/`、`.netlify/`、SB3 與私密設定。建置檢查阻擋常見私鑰、憑證 JSON、ZIP、SB3 與 source map。`public/` 僅放已授權的公開素材。
- **遊戲隔離**。iframe 固定 `sandbox="allow-scripts allow-pointer-lock"`，直接開啟遊戲另受 CSP sandbox 限制。遊戲 CSP 只對隔離頁允許行內程式與 eval，資源限指定來源。公開遊戲素材允許不帶憑證的跨來源讀取。
- **網站標頭**。網站 CSP 限制 script、frame、form、base 與外掛，後台僅額外開放 Google 登入所需來源並設 no-store／noindex。保留 HSTS、nosniff、no-referrer，停用相機、麥克風、定位、付款與 USB。
- **投票**。獨立表單限每帳號一次，採單題必填，不收姓名或 Email，關閉修改、其他選項與原始摘要。同步／控制分用活動 HMAC，簽章有效 5 分鐘，POST 最多 64 KB。只接版本化完整彙總，忽略過期資料。控制限 Google Script 的 `/exec`；Google 內容站轉址只送 GET。
- **結算**。啟用後固定規則。須確認 Google 已停止收票並有最新完整統計才可結算；更正另存版本與原因。CSV 指定版本並跳脫公式。根金鑰限本機私密環境或 Functions，活動金鑰存 Apps Script Properties。詳見[投票指南](docs/FIREBASE-VOTING-SETUP.md)。
- **公開寫入**。計數驗證作品、事件 UUID 及正式同源。GET 快取 60 秒，POST／錯誤 no-store；30 分鐘冷卻由瀏覽器執行。排行核對作品、1–8 位英數名稱、分數範圍及 iframe 訊息來源。匿名成績無法驗證實際遊玩，同名並行寫入可能競爭。詳見[煉金塔筆記](docs/WORD-ALCHEMY-TOWER-DESIGN.md)。

## 檢查與部署

```powershell
npm run verify:local
npm run check:live -- https://giraffegallery.com
```

`verify:local` 執行 verify、Chrome 全遊戲測試及 `npm audit --audit-level=high`，需要 Chrome 與網路；失敗即停止，不自動更新／推送。它清除正式部署環境設定，產出 noindex 測試版，正式部署交由 Netlify 重建。

`test:browser` 使用 127.0.0.1:4173 模擬 Netlify 標頭，檢查遊戲啟動、沙盒／localStorage 隔離、關閉釋放、無 JavaScript 內容，以及中英文頁面在 320–1920 px 的版面。Chrome 路徑用 `CHROME_PATH`；更改 `BROWSER_TEST_PORT` 時建置與測試要一致，避免 CSP 來源不符。

Windows ARM64 建置請用 `npm ci` 安裝鎖檔中的 Vite 與 Rolldown 配對。若 Windows 在更新後封鎖原生綁定，先隔離核對修補版本的載入及建置結果，再決定是否更新鎖檔。

`check:live` 唯讀抽查正式標頭、canonical、sitemap、404；網域／標頭變更後必跑。Vite dev／preview 不是完整 Netlify 環境，聲音、全螢幕、手機操作與分享預覽仍需人工確認。

## CI 與套件

- `quick-check.yml`：PR、main 更新及手動執行 verify。
- `security.yml`：每月 1、15 日 02:17 UTC（台灣 10:17）及手動執行，另跑弱點掃描與 Chromium。排程需已合併預設分支、帳號可用，時間可能延遲。
- Netlify 執行 verify 與高風險弱點掃描；失敗阻止新部署，但不移除既有版本。Netlify 不等待 GitHub 瀏覽器測試，合併前兩邊皆須確認成功。
- Dependabot 每週檢查，npm minor／patch 與 Actions 分組，major 分開審查；不自動合併。
- 移除 Firebase 間接相依套件的 `@grpc/grpc-js` override 前，先確認相容版本並重跑弱點掃描。
- TypeScript 7 曾與目前 vue-tsc 不相容，維持 6.0.3 並暫排除 7.x；升級型別工具鏈時重新評估。不要 `npm audit fix --force`。

雲端帳務阻擋時先跑本機備援並處理帳號問題，不把本機通過當作 CI 通過。平台帳號建議開啟雙因素驗證；本站沒有全天候入侵監控。

## 故障處理

1. 匯入中斷：核對 `.packages/` 備份、作品與 JSON 後才清除 import.lock；勿刪回復失敗的備份。
2. 可疑作品：先停止公開或回復已知安全版本，移除目錄與記錄、驗證後依正式發布流程處理。
3. 秘密外洩：先撤銷／輪替，再清檔案及 Git 歷史；刪除檔案不會讓秘密失效。
4. 套件漏洞：依上游修補版本更新、重跑 verify:local，保留可回復版本。

每次正式發布需站主當次明確核准，規則見 [AGENTS.md](AGENTS.md)。署名與公開授權由站主確認；HTML、JSON、搜尋結果與素材均可能包含署名。
