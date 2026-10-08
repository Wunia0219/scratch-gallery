# Firebase 活動後台：第一階段設定與操作

更新日期：2026-10-08。網站程式版本：1.4.0（第三階段保留版本待驗收）。第二階段作品管理見 [作品操作指南](FIREBASE-WORKS-SETUP.md)，第三階段投票與後台串接指南見 [投票操作指南](FIREBASE-VOTING-SETUP.md)。

## 已實作的功能與目前狀態

- `/admin/`：Google 登入、站主權限檢查、活動清單、新增活動、儲存草稿、草稿預覽、確認發布與關閉。
- 活動沿用已製作的萬聖節樣式；可修改中英文名稱與介紹、提醒／開始／截止時間、Google 表單及已部署示範。獎項、作品規格、視覺樣式仍屬程式模板；製作新模板需要另一次部署。
- 公開首頁由 Netlify Function 渲染最新活動 HTML；瀏覽器另每 30 秒更新活動、提醒與導覽新內容提示。第二階段已加入作品庫／作品頁與 sitemap 的動態渲染。
- Firestore 草稿、公開版本、設定與稽核分開儲存；管理 API 驗證 Google 登入 token 與啟用的 owner，瀏覽器不能直接讀寫資料庫。
- 本機打包、作品目錄管理已接上第二階段；第三階段投票管理與內建串接指南已實作，本次按站主要求先不建立 Google 表單，來源授權／部署與實票驗收尚未完成。

本機 `.env.local` 已設定公開 Web 應用程式參數、`ACTIVITY_DATA_MODE=firebase` 與私密金鑰路徑。Google 登入、站主權限、既有活動初始化與真實 Firestore 交易檢查均已通過。本機驗收不代表 Netlify 連線或正式發布已完成。

專案：`scratch-gallery-c0e33`。站主帳號：`nini900219@gmail.com`。Web 應用程式：`Scratch Gallery Web`。Firebase Authentication 已啟用 Google；授權網域已包含 `localhost`、`127.0.0.1`、`giraffegallery.com` 與專案原有 Firebase 網域。Firestore 已建立於 `asia-east1`，未登入的 REST 讀取已驗證回傳 403。站主已成功在本機使用 Google 登入，Firebase 使用者與 owner 權限已建立。服務帳號、以下兩項 IAM 角色與本機憑證均已連接；Netlify 正式環境設定與部署待站主核准。

## 1. Firebase 主控台準備

1. 確認正在操作網站新專案，避免改到另一款使用 Firebase 的專案。
2. Firestore 使用 **Standard 版、`(default)` 資料庫、`asia-east1` 台灣區域**。區域建立後不能更換。
3. 以正式版模式初始化規則，保持 `allow read, write: if false;`，與根目錄 `firestore.rules` 一致。不要改成 30 天開放的測試模式。
4. Google 登入的公開名稱使用「東勢長頸鹿 Scratch 創作館」，支援帳號使用站主帳號。此名稱與支援資訊可在登入畫面顯示。
5. 不需要 Firebase Hosting、Cloud Storage、Firebase Functions 或 Analytics SDK；這些功能不會由本次網站程式啟動。付費升級與備份服務另行評估。

主控台：[Firestore](https://console.firebase.google.com/project/scratch-gallery-c0e33/firestore)、[Google 登入](https://console.firebase.google.com/project/scratch-gallery-c0e33/authentication/providers)、[專案設定](https://console.firebase.google.com/project/scratch-gallery-c0e33/settings/general)。

## 2. 後端憑證與本機連接

建議建立網站專用的服務帳號 `gallery-activity-runtime`，限定在本專案使用：

| IAM 角色 | 用途 |
| --- | --- |
| [Cloud Datastore User](https://firebase.google.com/docs/firestore/security/iam) (`roles/datastore.user`) | 讀寫活動、草稿、站主權限與稽核交易 |
| [Firebase Authentication Viewer](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaseauth) (`roles/firebaseauth.viewer`) | 確認登入 token 撤銷狀態及讀取站主帳號 |

不要直接給 Owner／Editor，也不要將服務帳號金鑰交給瀏覽器。上述 Datastore 角色仍可讀寫專案資料庫的所有文件；本專案應只存此網站資料。部署規則及 IAM 管理使用站主的管理身分，不由執行網站的服務帳號負責。

服務帳號 JSON 金鑰現存於 `.packages/firebase-local/service-account.json`（Git 忽略）；Windows 存取權限已限定為站主、SYSTEM 與 Administrators。本機開發／連線檢查需以站主身分執行。勿放 `public/`、`src/`、`dist/`，不要貼到聊天或文件。`.packages/` 不可整批清空，金鑰也不屬一般驗證暫存。

金鑰只能在建立當下下載一次，金鑰列表不能重新下載。2026-10-08 內建瀏覽器未取得下載檔案，站主已改用一般 Chrome 保存新的 JSON，並已驗證連接成功；經站主核准，未使用的舊金鑰已撤銷，目前僅保留正在使用的新金鑰。不要反覆建立多把金鑰。[Google 官方說明](https://docs.cloud.google.com/iam/docs/keys-create-delete)。

`.env.local` 填入路徑後，確認以下設定：

```dotenv
ACTIVITY_DATA_MODE=firebase
FIREBASE_PROJECT_ID=scratch-gallery-c0e33
FIREBASE_ENVIRONMENT=production
FIREBASE_WEB_API_KEY=<主控台 Web 設定 apiKey>
FIREBASE_WEB_APP_ID=<主控台 Web 設定 appId>
GOOGLE_APPLICATION_CREDENTIALS=C:/path/to/service-account.json
```

Web 的 `apiKey`／`appId` 是公開識別參數；真正權限由伺服器 token 驗證、Firestore 規則與 IAM 控制。不要用 `VITE_` 環境變數存私鑰。更換環境或憑證後重新啟動本機服務。

```powershell
npm run dev
```

開啟 `http://127.0.0.1:3000/admin/`，使用站主 Google 帳號登入一次。第一次尚未建立 `admins/{uid}` 時，管理 API 會拒絕編輯，此時介面會顯示管理員識別碼。

接著執行：

```powershell
npm run firebase:initialize -- --initialize
```

初始化程式只接受本網站專案與指定站主的已驗證 Google 帳號，建立 owner、現有活動與 `siteSettings/public`；重跑不覆寫已存在活動／設定，也不會重新啟用已停用的 owner。站主需要先在本網站登入，Firebase 主控台已登入不等於網站登入已建立使用者。

回到後台選「重新確認權限」，即可管理活動。初始化前的 Firebase 模式首頁可能回傳 503，並隱藏活動；此期間不切換正式站。

## 3. 管理操作

1. 選活動，編輯文字、日期與表單。全部日期在編輯器使用台灣時間，資料庫使用 Timestamp，API 使用 ISO UTC。
2. 「儲存草稿」只更新私有草稿，訪客繼續看到已發布版本。
3. 「預覽活動」可查看本機表單內容；預覽沒有公開網址，也不會自動發布。
4. 先儲存再選「確認發布」，介面要求再次確認。發布後此活動成為首頁主打活動。
5. 「關閉活動」需確認，會將公開版本改為 archived 並清除已存草稿。公開 API 不再回傳此活動，首頁呈現敬請期待。
6. 發生分頁版本衝突時，先保留需要的文字，再重新載入；不提供強制覆寫。成功操作紀錄放在 `auditLogs`，目前尚無稽核瀏覽／回復按鈕。

發布成功通常在約 30 秒內同步，CDN 快取為 15 秒，成功寫入另嘗試清除活動快取；若清除失敗，快取到期後自行更新。依快取碰到的時機，既有分頁最長約 45 秒，另加網路／伺服器延遲。這不是嚴格即時系統。

關閉活動不會刪除已部署的示範檔案；已公開、被下載或快取的內容無法收回。活動開關用於網站呈現，不能保護機密文件。伺服器正式讀取失敗時不回復舊活動；背景頁面停止輪詢，回到頁面時重新讀取。

目前管理清單各集合最多讀取 500 筆，超過會明確拒絕以免顯示不完整資料；增加規模前需加入後台分頁。活動 `sortOrder` 暫留於資料結構，前台目前只顯示一個主打活動。

## 4. Netlify 連接與正式切換

**本次本機實作不代表已正式發布。** 取得站主當次明確核准後，再設定正式環境、標記待發布作品並完成正式建置。

| 變數 | 值／範圍 |
| --- | --- |
| `ACTIVITY_DATA_MODE` | 正式 Build 與 Functions 使用 `firebase`；切換前維持 `legacy` |
| `FIREBASE_PROJECT_ID` | `scratch-gallery-c0e33`，Build 與 Functions |
| `FIREBASE_ENVIRONMENT` | `production`，Functions |
| `FIREBASE_WEB_API_KEY` | Web 設定公開 apiKey，Functions |
| `FIREBASE_WEB_APP_ID` | Web 設定公開 appId，Functions |
| `FIREBASE_CLIENT_EMAIL` | 專用服務帳號 email，Functions 的秘密設定 |
| `FIREBASE_PRIVATE_KEY` | 專用服務帳號 private_key，Functions 的秘密設定；支援真正換行或 `\n` |

本機 `GOOGLE_APPLICATION_CREDENTIALS` 指向本機檔案，不可照搬到 Netlify；不要將整份金鑰 JSON 當環境變數。Netlify Functions 環境變數總大小有限，正式配置前檢查現有變數與私鑰總大小。建置產出的 `.netlify/server/` 僅作為 `home` Function 隨附檔案，不放在公開 `dist/`。

預覽／分支部署不能連本網站正式專案。使用獨立 Firebase 測試專案並設定 `FIREBASE_ENVIRONMENT=test`，或在預覽維持 `legacy` 並關閉管理功能；不要繼承正式私鑰。沒有獨立測試設定時，Firebase API 明確拒絕服務。

`legacy` 只用於首次遷移，會公開程式內舊活動設定。正式切到 Firebase 後，不能隨意將其當故障備援，否則可能重新公開已關閉活動。需要回復功能時，仍以 Firebase 中的有效公開版本進行管理。

首次切換需要部署一次程式與設定；之後修改已完成活動模板的文字、日期、開關不需再部署。新增遊戲檔案、新的活動模板、API 或安全來源仍需正常部署。

正式切換前主動查詢 Netlify 當期 credits、帳期及剩餘額度（見 [維護指南](netlify-maintenance.md)）；首頁改由 Function 產生會增加後端呼叫與資料庫讀取，不能以舊截圖估算目前餘額。

## 5. 驗證與故障判讀

```powershell
npm ci
npm run verify:local
```

已涵蓋資料驗證、私有草稿、發布／關閉、版本衝突、相同操作重試、owner 與 token 拒絕、正式／預覽隔離、後台未登入狀態、手機寬度、原有 15 款遊戲及弱點掃描。單元測試使用可回復的記憶體資料庫，不能代替真實 Firestore 交易驗收。Google 登入已在本機實測成功；首頁伺服器產物也驗證可在獨立暫存目錄載入，Vue 依賴包含於產物內。

2026-10-08 另在本專案的 `integrationChecks/<隨機 UUID>/` 私有隔離區驗證了真實 Firestore 的 Timestamp 轉換、草稿不公開、發布／關閉、相同操作重試及同時修改；測試資料已清理，公開活動設定未改動。公開 API 與首頁初始 HTML 均回傳 200 並讀取 Firebase 活動；未登入管理 API 回傳 401。弱點掃描為 0。

需重新檢查雲端交易時，先確認目的地與少量資料庫讀寫額度，再明確執行以下指令。它不屬一般 CI／`verify:local`，不會修改正式活動，完成後清除該次隔離資料；若中斷，應核對該次隔離區後再清理。

```powershell
node scripts/test-firebase-connection.mjs --run --project=scratch-gallery-c0e33
```

在獨立測試專案或模擬器完成：Google 登入／非 owner 拒絕、草稿不公開、發布與關閉、兩分頁衝突、首頁關閉時無 JavaScript 的 HTML、資料庫異常 503、正式域 CSP、Netlify 包裝及快取更新。正式專案首次上線只讀取與核對已核准活動，不用實際公開內容做任意測試。

Firebase 模擬器設定見 `firebase.json`，需 Firebase CLI 與其支援的 Java 執行環境。測試專案 ID 使用 `demo-scratch-gallery`，Auth 與 Firestore 必須成對配置；正式環境拒絕模擬器。

```dotenv
ACTIVITY_DATA_MODE=firebase
FIREBASE_PROJECT_ID=demo-scratch-gallery
FIREBASE_ENVIRONMENT=test
FIREBASE_WEB_API_KEY=emulator
FIREBASE_WEB_APP_ID=emulator
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
```

CLI 以 `firebase emulators:start --project demo-scratch-gallery --only auth,firestore` 啟動，另一個終端可用 `npm run firebase:initialize -- --initialize --emulator` 初始化。不要把模擬器設定寫入正式 Netlify 環境。

| 現象 | 檢查入口 |
| --- | --- |
| 後台等待連接 | 本機／Functions 是否配置 Web 參數與 Firebase 模式 |
| Google 彈出視窗遭封鎖 | 允許本站登入彈出視窗，再按登入 |
| 登入後沒有管理權限 | Firebase 使用者 UID、初始化、`admins/{uid}` 的 role／enabled |
| API 回傳 401 | 帳號或 token 過期／撤銷，重新登入；另確認伺服器可讀取 Firebase Auth |
| API 回傳 409 | 草稿或公開版本已改變，重新載入並核對文字 |
| API 回傳 503 | 專案／IAM／憑證／初始化／環境隔離／Firestore 可用性 |
| 首頁仍顯示舊版本 | 最長快取與輪詢時間、Netlify Function 記錄、Build 與 Functions 模式一致性 |

官方參考：[Google 登入](https://firebase.google.com/docs/auth/web/google-signin)、[ID token 驗證](https://firebase.google.com/docs/auth/admin/verify-id-tokens)、[Firestore 安全規則與伺服器權限](https://firebase.google.com/docs/firestore/security/get-started)、[Firestore 區域](https://firebase.google.com/docs/firestore/locations)。
