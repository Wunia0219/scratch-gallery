# Firebase 作品管理：第二階段設計與操作

更新：2026-10-08；程式版本：1.4.0。依站主確認採「先核准部署遊戲檔案，再由後台確認上架」，NEW 自後台首次上架開始 15 天。

## 目前完成與待完成

| 項目 | 狀態 |
| --- | --- |
| 作品後台、草稿預覽、上下架、排序、版本還原 | 本機已實作並驗證 |
| 既有 15 位作者、15 件作品匯入 Firestore | 已完成；UUID、作者、網址、原日期一致 |
| 舊作品缺少日期 | 保留 `null` 與 `hasPublished: true`；不捏造日期，不重新顯示 NEW |
| 本機打包 → 資源清單 → 登錄 → 後台草稿 | 已接通；未新增雲端檔案儲存或公開上傳 |
| 公開分頁 API、作品 HTML、SEO、動態 sitemap、404／503 | 已實作與本機驗證 |
| 真實 Firestore 交易與隔離測試、Chrome 作品後台 | 已通過；隔離資料／測試草稿已清除 |
| Netlify Firebase 環境設定、正式檔案驗證、正式切換 | **尚未進行，需站主當次部署核准** |
| 投票統計 | 第三階段，尚未實作 |

本機 `.env.local` 使用 `CATALOG_DATA_MODE=firebase`、`CATALOG_LOCAL_ASSETS=true`。目前 `workAssets` 僅確認本機資源；這不代表正式網站已部署或新的待上架作品可以發布。活動連線沿用 [第一階段設定](FIREBASE-ADMIN-SETUP.md)。

## 站主使用方式

開啟 `/admin/`，以原 Google 管理帳號登入，選「作品管理」。

1. 以名稱、作者或 UUID 搜尋；可篩選已上架、待上架或已下架。
2. 編輯名稱、作者、介紹、分類、標籤、適用裝置、操作說明、遊戲目標、封面與排序。老師／學生身分依作者的 role 決定。
3. 「儲存草稿」只更新私有版本；前台持續顯示已公開版本。
4. 「預覽作品」顯示草稿卡片與說明，封面可開啟既有遊戲。名稱連結仍指向目前公開介紹頁，並非公開草稿網址。
5. 「確認上架」要求先儲存草稿、確認正確版本檔案已部署，並再次確認。首次上架由伺服器記錄日期；更新、改排序、下架後重新上架均不重算。
6. 「下架作品」會移除公開投影與已存草稿；介紹頁回傳 404，sitemap 不再列出。遊玩計數與排行榜資格也以有效公開作品為準。
7. 「版本紀錄」顯示最近 10 個公開版本；「還原成草稿」只建立私有草稿，再確認上架才生效。若歷史封面檔案已移除，需先保留該檔案或改選有效封面。

排序優先值較小者在前；相同值依首次上架時間由新到舊。沒有歷史日期的舊作品以原來源順序保持穩定。作者 UUID、作品 UUID 與介紹網址不隨排序改動。

兩個分頁同時編輯時，版本不同會拒絕覆寫。請先保存需要的文字，重新載入再編輯。離開或切換時會提醒未儲存修改；登出後清除私有編輯介面。

前台通常約 30 秒更新，成功上架／下架會嘗試清除 `catalog`／`activities` CDN 快取。CDN 期限為 15 秒；既有分頁可能約 45 秒加上網路延遲才更新。背景頁不輪詢，回到前景會重讀。已下載、快取或透過直接網址取得的檔案無法收回。

## 新作品的兩段流程

### A. 本機打包與核准部署檔案

沿用 README 的 `register:creator`、`capture-previews`、`import-game`。新作品保持 `releasePending: true`；更新作品使用原 `--id` 與 `--replace`，不手改打包結果。

建置建立 `dist/game-assets.json` 與 Function 私有副本 `.netlify/catalog/assets.json`，含每個作品的入口、可選封面、資源清單與 SHA-256。版本由實際檔案內容決定，包含共用 runtime 與 Scratch 素材。建置只建立清單，**不寫入「已部署」狀態或上架日期**。

Firebase 模式的建置允許尚未上架的遊戲檔案，但不產生草稿介紹 HTML，也移除公開來源 `games.json`、`creators.json`。資源清單沒有作品介紹、作者姓名、草稿或管理紀錄。遊戲檔案仍公開可直接取得；需保密的作品延後部署。

先完成驗證、列明待部署作品、查當期 Netlify credits／帳期／剩餘額度，再取得站主當次明確同意，才推送／合併／部署。本機、預覽或舊核准不能替代本次正式部署同意。

### B. 驗證正式資源、登錄並確認上架

部署成功後，以同一份打包來源執行預演：

```powershell
npm run firebase:catalog -- --origin https://giraffegallery.com --deploy-id <Netlify部署代號>
```

核對結果後登錄：

```powershell
npm run firebase:catalog -- --origin https://giraffegallery.com --deploy-id <Netlify部署代號> --apply
```

可加 `--id <UUID>` 只處理一件作品。正式登錄會讀取正式網站資源清單，與本機逐項核對，再下載相應檔案驗證 SHA-256；下載失敗、重新導向或版本不同即停止。不是單靠人手填寫 `assetsReady: true` 或部署代號判斷。

登錄前建立私有備份。新作品進入草稿；既有作品的後台文字、作者選擇、排序、首次上架日期不被來源 JSON 覆寫。資源更新只更新可信任資源版本及公開資源投影。更新已上架遊戲的程式／素材會隨檔案部署與登錄生效，若需同步審稿，先於後台下架，核對後重新上架。

最後到後台儲存並預覽草稿，再「確認上架」。這一步才記錄新作品的首次公開日期。來源 JSON 的 `releasePending` 保留為打包來源標記；Firebase 的實際狀態以資料庫為準，不再靠 Git 改日期。

```powershell
npm run release:mark -- <UUID>
```

此指令在 Firebase 模式呼叫相同發布交易，需已有草稿與正式資源證明；不能繞過驗證，也不能重設日期。它是發布操作，需站主已授權該作品上架。legacy 模式保留原先修改 JSON 的行為，正式切換後不能當故障備援。

## 正式環境第一次切換

在 Netlify 正式 Build 與 Functions 設定 `CATALOG_DATA_MODE=firebase`，活動模式也按第一階段文件設定。Firebase 專案與金鑰設定沿用原有專用服務帳號，不新增 IAM 角色或額外 SDK。

`CATALOG_LOCAL_ASSETS` 僅本機開發使用，**不得設於 Netlify**。正式資源登錄後，將本機的此值改成 `false`，本機管理讀取已建置的可信任資源清單。正式 Functions 使用部署所附清單。正式資料庫已登錄正式資源後，CLI 禁止再以 `--local` 覆寫資源；後續測試應改用獨立測試 Firebase／模擬器。

第一次切換會出現短暫服務不可用的可能：新 Function 上線後，尚未完成正式資源登錄時，作品無有效正式資源證明，將不公開；作品庫回傳 503，避免顯示件數與內容不一致的半份目錄。安排維護時間並立即完成同版本登錄／API 抽查；不要把本機資源標記假冒為正式證明。必要時先核准並部署資源準備版本、登錄後再核准切換資料模式。

若預覽使用 Firebase，必須獨立測試專案，`FIREBASE_ENVIRONMENT=test`，不能連 `scratch-gallery-c0e33` 或繼承正式私鑰。沒有測試專案時預覽保留 legacy；不會自動回退正式已下架作品。初次正式連線、Function 打包、正式 CSP、CDN 更新與線上分享預覽仍需部署後驗收：

```powershell
npm run check:live -- https://giraffegallery.com
```

## 資料模型與 API

| 路徑／集合 | 用途 |
| --- | --- |
| `creators/{creatorId}` | 永久作者關聯、姓名、班級、role |
| `works/{workId}` | 管理版本、status、hasPublished、首次日期、revision |
| `workDrafts/{workId}` | 私有草稿、baseRevision、draft revision、修改者 |
| `workAssets/{workId}` | 資源雜湊、驗證環境、正式網址、部署代號、確認時間 |
| `publicWorks/{workId}` | 僅已公開作品的安全欄位投影與 sortKey |
| `workRevisions/{workId}/entries/{revision}` | 私有歷史內容、狀態、操作者、時間 |
| `siteSettings/catalog` | 作品版本、師生件數、學生班級件數、正式資源登錄狀態 |
| `siteSettings/public` | 活動設定、catalogRevision、導覽更新版本 |
| `auditLogs/{operation}` | 交易操作紀錄、重試指紋與回應 |

發布與下架在 Firestore 交易內同步修改管理版本、公開投影、班級／件數、全站版本、歷史與稽核；同操作識別碼重試回傳原結果。伺服器不接受客戶端指定首次日期、playUrl、資源版本或師生身分。封面只能選已打包選項。

公開 API：

- `GET /api/works?role=student|teacher&q=...&className=...&device=all|desktop|mobile&cursor=...`：每批最多 9 件，回傳 items、下一頁 cursor、revision、total、classes。
- `GET /api/works/<UUID>`：有效公開作品與最多 3 件同分類推薦。未知、草稿、下架或無有效資源證明回傳 404；資料庫故障 503，不回退舊 JSON。
- `/students/`、`/teachers/`、`/works/<UUID>/`、`/sitemap.xml` 由 Function 產生有效公開內容；SEO 網址採建置時已確認的正式網址，避免依賴 Functions 不一定收到的 Build 變數。沒有 SPA catch-all。

管理 API：`GET /api/admin/works`、`GET /api/admin/work-history?id=<UUID>`、`POST /api/admin/work-mutate`。先驗證 ID token 撤銷狀態、email_verified 與啟用 owner；寫入另驗同源、JSON ≤16,000 bytes、資料白名單、版本。管理回應與錯誤 no-store，Firestore 用戶端全部拒絕讀寫。

管理清單目前各集合最多 500 件，超過明確拒絕，不默默截斷。作者由本機註冊流程管理，本階段後台可選作者，未提供修改作者姓名／班級的連動編輯器，也未做任意檔案上傳。

## 搜尋、分頁與用量取捨

公開作品以單一索引 `sortKey` 排序，role 放在前綴，避免需要手動建立多種複合索引。cursor 綁定師生分類、搜尋條件與 catalog revision；作品更新後舊 cursor 回傳 409，前端重新載入，避免跨版本漏件或重複。

目前 Firestore 沒有內建任意子字串搜尋，因此採分批掃描，每次最多掃描 120 筆公開投影；符合條件後驗證資源。若掃描上限內沒有找到作品但仍有下一頁，前台會提示繼續載入。無篩選時顯示公開件數；搜尋時顯示已載入件數，不冒稱精確搜尋總數。最後一頁剛好 9 件時可能再有一個空的結束頁。

一般 9 件頁面約讀取一筆統計、最多 12 筆投影與相應資源證明；搜尋最壞會讀較多。首頁沒有載入作品目錄，瀏覽器不對全目錄使用 onSnapshot，也不預載全部遊戲。公開 API／HTML 快取 15 秒，計數 60 秒。作品達數百件、搜尋流量上升時，再評估索引式搜尋與後台分頁，不在這階段引入搜尋服務與額外費用。

這是架構上的讀取估算，不能取代 Firebase／Netlify 當期用量頁。公開流量仍消耗 Function 與資料庫額度；正式切換前依 Netlify 維護指南查當期 credits，不以過去截圖推定餘額。

## 遷移、備份與驗證

本次先 dry-run、備份、試匯入一件並核對，再匯入其餘 14 件。舊作品均保持原始已公開狀態；原本沒有 publishedAt 的作品保持未知日期，`hasPublished` 防止重新上架當作新作品。活動示範不列入師生目錄。

本機首次遷移工具（正式資源登錄後不可再對同庫執行）：

```powershell
npm run firebase:catalog -- --local                  # 預演
npm run firebase:catalog -- --local --id <UUID> --apply
npm run firebase:catalog -- --local --apply
```

備份放在 Git 忽略的 `.packages/firebase-backups/catalog-<時間>.json`；Windows 限定目前使用者、SYSTEM、Administrators，其他系統使用私有權限。備份含管理與公開資料，不能放入 public 或貼到聊天。保留首次遷移前及完整匯入後備份；要回復大量資料時先核對版本，再針對需要的記錄還原，不直接全庫覆寫。

```powershell
npm run verify:local
# 下列為明確啟動的雲端驗證，不在 CI／一般 verify 中執行：
node scripts/test-firebase-works.mjs --run --project=scratch-gallery-c0e33
node scripts/test-work-admin-browser.mjs --run --project=scratch-gallery-c0e33
```

雲端交易測試放在 `catalogValidationRuns/<隨機 UUID>/`，完成後清除；UI 驗證使用既有授權金鑰在記憶體簽署短效登入，在隔離 Chrome 驗證 owner 後台，僅建立可識別的私有測試草稿，取消上架並清除。不建立長期新金鑰、不新增 IAM API 權限、不修改公開作品。原 Google 登入流程仍保留。

一般驗證包含版本／草稿隔離、首次日期、重試、並行衝突、資源環境、本機不能啟動新作品上架、伺服器 HTML／SEO／sitemap、404／503、原有遊戲、手機版面及弱點掃描。`verify:local` 使用 legacy 公開測試資料，不連站主資料庫，產生 noindex 測試版。另執行 `npm run verify` 可檢查本機 Firebase 建置輸出；此時也不會自動登錄資源或發布作品。

目前尚無排程上架、作者後台編輯、公開投稿或投票功能；第三階段將另設計投票來源、統計同步與後台管理，不把匿名遊玩計數當成投票數。

規格參考：[Netlify Functions 自訂路徑](https://docs.netlify.com/build/functions/configuration/)、[Firestore 游標分頁](https://firebase.google.com/docs/firestore/query-data/query-cursors)。實際正式部署仍需依本次環境驗收。
