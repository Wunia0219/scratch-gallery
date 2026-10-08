# 第三階段：投票管理與 Google 串接指南

更新：2026-10-08。網站版本保留 **1.4.0**，待站主驗收後再決定改版與正式發布。

## 目前完成與保留事項

已實作投票後台、後台內建分步串接指南、名單草稿、Script／資訊清單下載、私密連線設定下載、公開票數、完整同步、收票控制、固定結算與 CSV。沿用既有 Firebase 登入與 IAM，不新增服務帳號或權限。站主已指定 **本次先不建立 Google 表單**。

本機程式完成不代表外部連接完成：Google 表單、私人回覆 Sheet、Script 部署／授權與觸發器尚未建立／綁定；兩個投票 HMAC 根值與正式 Netlify 設定尚未配置；沒有正式投票、正式票數或 Google 實票測試。本次不改版號、不推送 main、不部署、不變更付費方案。

入口：`/admin/?section=voting`。投票指南直接顯示在後台，三步依序為準備名單、日後連接 Google、驗證後開放。所有下載只是取得設定／範本，不會建立表單、部署 Script 或開放收票。尚未有表單也可以儲存名單草稿。

## 1. 名單、表單與投票規則

- 使用獨立投票表單，與作品投稿／檔案上傳分開。
- 預設每個 Google 帳號一次、每票選一件；支援每票最多選 2–5 件作品。帳號限制不等於一個人只有一個帳號。
- 不收姓名或 Email，表單只有一題必填單選／複選題；關閉修改回覆、其他選項、測驗、再次填答連結與公開回覆摘要。
- 選項用 `W001｜作品名稱` 對應永久作品 UUID，依勾選順序建立。參賽作品需已上架，2–100 件。
- 開始時間含、截止時間不含，以 Google 回覆送出時間判定；未知／重複選項、超出選擇數時整票無效，期限外另列排除。
- 啟用後固定表單、題目、名單、名稱、選項代號與期限；新的投票輪次建立新活動與新表單。公開方式仍可切換。
- Script 的 /exec 控制網址可於「修復 Apps Script 控制連接」更新；不改票數或固定規則，更新後重新完整同步確認。
- 複選分別顯示有效選票與總選擇，不提供直接改票或從匿名回答推測同一個人。

Google 用登入限制帳號，主辦方不收集登入身份；原始回覆留在私人表單／Sheet。網站只接收完整彙總，不接收回覆 ID、Email、姓名或逐票資料。

## 2. 日後從後台完成串接

### 準備名單

在投票管理選活動，填名稱、規則、日期與作品；儲存草稿或「下載名單設定」。此時可保持表單欄位空白。下載的 JSON 是名單準備資料，不含金鑰，供日後建立投票選項。

### 一次性的私密伺服器設定

兩個根值：`VOTING_SYNC_SECRET`、`VOTING_CONTROL_SECRET`，各為 64 位 hex。僅放本機 `.env.local`／正式 Netlify Functions 秘密設定，不放 `VITE_`、Git、公開目錄或前台。可請 Codex 協助，或先預覽後執行：

```powershell
npm run voting:prepare -- --activity=<活動代號>
npm run voting:prepare -- --activity=<活動代號> --apply
```

工具僅產生／沿用本機根值與 `.packages/firebase-local/voting/<活動代號>-properties.json`；不部署、不連 Google、不改投票。可加 `--setup="<名單 JSON 路徑>"` 產生建表單用 BOOTSTRAP 設定。Windows 檔案權限限本人、SYSTEM、Administrators；Unix 使用私密權限。既有根值不自行輪替。

根值配置後重啟本機網站。後台僅取得「金鑰已配置」的布林狀態，不自動讀出金鑰。日後在每個活動按「下載私密連線設定」取得此活動派生的 `SYNC_KEY`／`CONTROL_KEY`，有 owner、同源與 no-store 驗證，根值不傳到瀏覽器。私密設定是特意下載的秘密檔案，不是公開 API／HTML；僅供填入 Script Properties，不貼到聊天或公開。

本機下載的 `SYNC_URL` 留空，Google 不能推送到 localhost。HTTPS 部署下載使用該部署網址，需核對 Firebase 環境；Deploy Preview 必須用獨立測試專案與測試金鑰，不可連正式專案。

### Google 表單與 Script（本次先不執行）

1. 日後由站主管理帳號建立獨立投票表單與 Apps Script 專案，每個活動一個 Script。名單、設定依後台第一步準備。
2. 從後台下載 `Code.gs` 與 `appsscript.json`，貼入 Script；資訊清單設定台灣時區、V8、Forms／Sheets／觸發器／HTTP 權限。
3. 從私密連線檔填入 Script Properties：`ACTIVITY_ID`、`FORM_ID`、`SYNC_URL`、`SYNC_KEY`、`CONTROL_KEY`。Google 授權由站主親自確認，不能用 Firebase 私鑰代替，也不需給 Firebase 服務帳號 Drive／Forms 權限。
4. 已有表單時手動核對規則、唯一題目與完整選項，用 `inspectVotingForm` 取得表單 ID、題目 ID與完整 `/viewform` 網址。程式不改寫既有題目。
5. 範本另提供日後可手動執行的 `createTestVotingForm`：需 BOOTSTRAP 名單，建立不收票的獨立測試表單及私人 Sheet，保存 FORM_ID 防止重複建立；**後台下載不會執行此函式**。超過單一 Script Property 大小時工具會產生 `BOOTSTRAP_0` 等分段。
6. Script 部署 Web App，以擁有者身份執行、讓網站伺服器能呼叫；端點只接受 HMAC POST，GET 不回傳設定或票數。將正式 `/macros/s/…/exec` 網址填回後台，不使用 `/dev`。修改程式需更新 Script 部署版本。
7. 回後台填 ID、題目 ID、完整填答網址與控制網址，儲存草稿、確認啟用，再完整同步驗證 Google 設定。於設定期間確認開放收票。
8. 自動同步需可用的公開 HTTPS 網站 API。設定 SYNC_URL 後，手動執行 `installVotingTriggers`，建立 **Forms 可安裝的送出觸發器**與五分鐘完整重算，再執行 `syncVoting` 驗證。可重跑安裝，不累加同名觸發器。

本機可主動呼叫 Google Script 並完整讀回票數，自動推送不能指向 `127.0.0.1`。實際 Google 表單尚未建立時，不將模擬回覆當作真票或宣稱來源已連通。

## 3. 收票、入口與公開方式

| 操作 | 網站 | Google |
| --- | --- | --- |
| 隱藏網站入口 | 不提供填答連結 | 繼續按原規則收票 |
| 開放收票 | 符合期限、來源確認與新鮮度才提供連結 | 要求開放並讀回確認 |
| 關閉收票並重算 | 立即儲存入口關閉 | 要求停票並重算；失敗顯示未確認 |
| 關閉活動 | 隱藏活動與該投票資訊 | 不自動關閉表單，仍需到投票管理停票 |
| 隱藏票數／結算後公開 | 不傳出未允許公開的票數 | 收票設定不變 |

知道填答網址的人能否投票由 Google 決定，入口關閉不能代替真正停票。後台保留期望狀態、最近來源確認、確認時間與失敗狀態。

五分鐘觸發器並非準點排程，但會依已快取期限停止收票，即使網站離線；網頁到期停止提供入口，重算按截止時間排除晚票。Google 設定／觸發器異常時人工確認；未確認停止收票不能結算。

前台在公開活動下顯示投票，每 45 秒更新，背景／離開畫面時停止輪詢；重新可見與按更新時讀取。表單以新視窗開啟，不從關窗或 iframe postMessage 推斷已投票。來源重算、15 秒 CDN 與輪詢不是秒級即時。

## 4. 結算與更正

關閉收票並完整同步後，核對有效票、總選擇、無效與期限外排除數，以及私人 Google 原始來源。同票處理與得獎判定由主辦方按規則確認；第一版不自動裁決或逐票手動扣除。

結算需來源已確認停止收票、相同設定／來源版本、關閉操作後產生的完整統計與最近五分鐘同步，填至少 10 字說明後保存快照。前台與 CSV 固定在該結算版本，一般同步只更新後台來源，不能覆寫已確認結果。

更正需完整重算、原因與新的版本。舊版永久保留，CSV 可指定版號，包含來源版本、確認時間、有效票與每作品票數，不含 owner UID、Email、回覆 ID／逐票資料。作品名稱做試算表公式跳脫。

## 5. 資料與 API

| 資料 | 用途 |
| --- | --- |
| `votingDrafts/{activityId}` | 私有草稿，允許尚未綁定表單 |
| `votingConfigs/{activityId}` | 固定規則、入口、收票期望、公開方式、revision／mappingVersion／finalVersion |
| `voteSources/{activityId}` | 私有來源 ID、控制網址、schemaVerified、收票確認、健康狀態 |
| `voteSummaries/{activityId}` | 最新完整彙總、來源版本／生成時間／同步時間 |
| `voteResults/{activityId}/versions/{n}` | 固定結算、來源版本、確認者、原因 |
| `voteSyncJobs/{jobId}`、`auditLogs/{ownerUid}-{operationId}` | 同步作業與管理重試收據、稽核，不存原始回覆 |

| API | 權限 |
| --- | --- |
| `GET /api/admin/voting`、`POST /api/admin/vote-mutate` | owner 管理與健康資料 |
| `GET /api/admin/vote-template?file=script或manifest` | owner 範本下載，檔案有專屬 Function included_files |
| `POST /api/admin/vote-connection` | owner＋同源，特意下載此活動的私密派生設定 |
| `GET /api/admin/vote-export?id=…&version=n` | owner 指定固定版本 CSV |
| `GET /api/voting/<活動代號>` | 僅明確公開欄位，草稿或未公開活動回 voting:null |
| `POST /api/vote-sync` | HMAC 的設定請求、完整統計或失敗回報；沒有公開 GET |

沿用 Firestore 客戶端全部拒絕、伺服器 IAM。管理寫入驗證撤銷狀態的 ID token、enabled owner、Origin、64 KB 本文、欄位、版本與收據。所有管理／設定／錯誤回覆 no-store。

各活動同步與控制金鑰不同；請求／回覆的簽章用途不同，簽章涵蓋時間與原始 JSON 字串，有效五分鐘。完整統計需數字與總數一致、來源／題目／名單一致；相同 job 同內容重試不加票，舊版本／舊時間不能覆寫新值，同版本不同內容拒絕。

ScriptLock 序列化重算與控制，控制重試沿用快照。控制網址只允許 Google /exec；ContentService 的回覆跳轉只允許 `script.googleusercontent.com` 的 GET，絕不轉送含簽章的 POST。來源失敗保留最後票數；逾 30 分鐘標記延遲並暫停網站入口，不能將空白當零票。

## 6. 驗證與正式切換

```powershell
npm run test:voting
npm run verify:local
node scripts/test-firebase-voting.mjs --run --project=scratch-gallery-c0e33
node scripts/test-voting-browser.mjs --run --project=scratch-gallery-c0e33
```

一般測試不連 Google、不寫正式投票。手動 Firestore 在 `voteValidationRuns/<隨機 UUID>/` 驗證並清除。Chrome 使用既有站主短期登入，所有投票 API 寫入在記憶體；`.packages/voting-stage3/` 截圖是模擬驗收資料。這些測試不能代替 Google OAuth、帳號限制與實際觸發器。

2026-10-08 已通過 14 項投票測試、verify／verify:local、真實 Firestore 隔離交易與 Chrome 投票操作／指南下載／未綁定草稿／手機畫面／登出清除。另只讀核對真實本機 owner 投票 API 與未登入下載的 401。一般回歸涵蓋原有 15 款遊戲，弱點掃描為 0；雲端測試隔離資料已清除，版本維持 1.4.0。

日後實際 Google 驗收：同帳號第二次受阻、不同帳號可投、沒有姓名／Email、投稿不受影響、單／複選限制、來源開關、手動／觸發器同步、逾時票排除、故障狀態、結算與 CSV 同版本。

正式發布前核對 Firebase／Functions 設定與環境變數總大小、HTTPS URL、預覽隔離；重新查當期 Firestore 用量與 Netlify credits／帳期／剩餘額度。完整 Form 掃描適合小型活動，實際票量需測 Google 配額與重算時間；大量票數改分批背景作業。管理清單上限 500 筆，同步作業與收據另訂保留期，不任意刪仍可能重試的收據或固定結算。

取得站主當次發布核准後，核對待發布作品與兩段資源流程，以正式設定 verify／部署並 check:live。`verify:local` 的 noindex dist 不直接發布。日常開關與公開方式不需要網站重部署，首次新增 API／連接及 Script 改版仍需部署。

若來源版本低於後台，核對後把 Script Properties 的 SOURCE_REVISION 恢復至最新來源版本再重算，不清空它。同步失敗檢查 Script /exec 部署、Properties、根值是否重啟載入、ID／網址／選項、公開 SYNC_URL、觸發器與 Google 執行記錄。結算 409 則先關閉、重新同步與核對版本。

官方依據：[Google Form 方法](https://developers.google.com/apps-script/reference/forms/form)、[可安裝觸發器](https://developers.google.com/apps-script/guides/triggers/installable)、[ContentService GET 跳轉](https://developers.google.com/apps-script/guides/content)、[Apps Script 配額](https://developers.google.com/apps-script/guides/services/quotas)。
