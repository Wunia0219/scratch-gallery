# Scratch Gallery 安全維護

網站以靜態展示為主，沒有登入、公開上傳或付款介面。遊玩次數使用同站 Netlify Function 與 Netlify Blobs 保存匿名事件，不讀取或保存訪客 IP、定位或姓名。正式部署發佈 `dist/` 與 `netlify/functions/`；不要把原始專案、`.env`、存取權杖或私人 SB3 放入 `public/`。

## 已實作的防護

- 首頁與作品頁使用嚴格 Content Security Policy，禁止行內程式、eval、外部框架與外站嵌入；阻擋表單送出、外部 base URL 及外掛內容。
- 遊戲使用 `sandbox="allow-scripts allow-pointer-lock"`，不允許 same-origin、彈出視窗、表單或上層頁面導向。Netlify 另以 CSP sandbox 保護直接開啟的遊戲頁面。
- TurboWarp 需要的行內 script/eval 僅開放於隔離的 `/games/*`；其連線限定到本網站和該次 Netlify 部署來源。未開放第三方雲端變數或擴充套件服務。
- `/games/*` 是可公開讀取的素材，使用無 credentials 的 `Access-Control-Allow-Origin: *`，讓 opaque-origin 遊戲取得自己的 JSON、圖像和音效。這不是私人資料存放區。
- 停用相機、麥克風、定位、付款與 USB；加上 nosniff、no-referrer、HSTS。需先在 Netlify 確認 HTTPS 憑證與強制 HTTPS 正常。
- 作品與素材 URL 採本機路徑白名單，建置時拒絕不合法路徑、外站網址與重複 ID。
- 遊玩計數的公開 GET 成功結果設定 60 秒 Netlify 快取；寫入與錯誤回應維持 no-store。查詢逐頁累計，不改動歷史資料；實際 CDN 命中需部署後確認。
- 遊玩計數 API 只接受目錄內既有作品 UUID 與合法匿名事件 UUID；正式寫入限定正式站同源請求，預覽部署與 localhost 不會寫入正式計數。
- 部署輸出檢查會拒絕常見秘密檔名、私鑰、ZIP、SB3、source map。這是基本防呆，並非能識別所有秘密內容的掃描器。

## 本機檢查（雲端以外的備援）

在電腦上執行 `npm run verify:local` 即可完成建置、安全回歸、Chrome 遊戲測試與 npm 已知弱點掃描，不需要 GitHub Actions 或綁定信用卡。npm 掃描需要網路；Chrome 須已安裝。任何步驟失敗都會停止並回傳失敗，不會自動升級、推送或部署。

這個指令清除子程序的正式部署網址設定，產生不收錄的本機測試版 `dist/`，不要直接把它上傳為正式站。正式上線沿用 Netlify 依正式環境重新建置；Netlify 的使用仍受帳號原有額度限制。

每次新增遊戲、更新套件或準備上架時可先執行一次。這個本機指令不是背景排程；雲端完整檢查每月兩次，由下述 GitHub Actions 執行。

## 部署檢查與套件更新通知

`npm run verify` 會執行資料關聯、資源預算、型別、防護回歸測試、靜態產生及輸出檢查。Netlify 建置另執行 `npm audit --audit-level=high`；高風險漏洞或掃描服務失敗均會阻止新版本部署，既有上線版本不會自動被移除。

`.github/workflows/quick-check.yml` 在 PR、main 更新及手動觸發時執行，包含資料與資源稽核、型別檢查、安全回歸、正式建置與 SEO 輸出。`.github/workflows/security.yml` 則在每月 1 日與 15 日 02:17 UTC（台灣約 10:17）及手動觸發時，額外執行 npm 弱點掃描與全部遊戲的 Chromium 瀏覽器測試。完整檢查排程需此設定合併至預設分支，且 GitHub Actions 帳號可正常使用；排程可能延遲，失敗通知依 GitHub 帳號設定。

`.github/dependabot.yml` 每週檢查 npm 與 GitHub Actions 更新。npm 的 minor／patch 更新合併成一組，Actions 更新另成一組，減少每個套件各自建立分支；其他 npm major 更新仍獨立審查。更新不會自動合併。TypeScript 7 已重現與目前 vue-tsc 不相容，暫時排除 7.x 更新通知，使用已通過完整 CI 的 6.0.3；升級 Vue 型別檢查工具鏈時，必須重新評估並移除該排除規則。既有版本仍受 npm 弱點掃描檢查。

合併更新前確認 GitHub 的 `verify` 與 Netlify 建置成功；本機通過不等於 GitHub CI 通過。如果帳務鎖定再次阻止雲端工作，可先使用本機備援並解決帳號問題，不要略過失敗檢查。GitHub 與 Netlify 帳號仍建議開啟雙因素驗證。

## 遊戲與上線檢查

```powershell
npm run verify:local
npm run check:live -- https://你的正式網址
```

`test:browser` 需要 Chrome（Windows 預設標準安裝路徑，可用 `CHROME_PATH` 指定），先用未設定 `SITE_URL` 的本機 `npm run build` 產生測試版本。若 4173 被占用，可設定 `BROWSER_TEST_PORT`，但建置與測試必須使用相同值，以維持遊戲 CSP 的來源一致。它預設在 127.0.0.1:4173 模擬產出的 Netlify 標頭，驗證遊戲啟動、父頁面與 localStorage 隔離、關閉釋放、無 JavaScript 的介紹內容及手機寬度。它不等於線上 Netlify 驗證。

`check:live` 是唯讀抽查正式站的安全標頭、canonical、sitemap 與 404；第一次部署、網域更換或標頭修改後都應執行。仍需人工確認遊戲聲音、全螢幕、手機操作與分享預覽。

本機 Vite dev/preview 提供遊戲 CORS 相容性，但不會套用全部 Netlify 安全標頭。以正式部署的實際回應為準。

## 發現問題時

1. 若作品可疑，移除該作品目錄及目錄記錄，執行驗證後重新部署；必要時先在 Netlify 回復到已知安全版本。
2. 若權杖或秘密曾公開，先撤銷與輪替，再清理檔案和 Git 歷史；只刪除檔案不能讓已外洩的秘密失效。
3. 套件漏洞依上游修補版本更新，重跑驗證及所有遊戲測試；不要直接執行不經檢查的 `npm audit fix --force`。
4. 維持 Git 遠端備份，重大變更前保留可回復版本。

學生署名依站主決定保留。上架前由站主確認公開授權；HTML、JSON、搜尋結果及遊戲素材都可能包含公開署名。`noindex` 不是存取控制。

這些是可持續執行的基本防護，並非全天候入侵監控或零漏洞保證；帳號被接管、惡意供應鏈與流量攻擊仍需平台及人員處理。
