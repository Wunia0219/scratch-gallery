# Netlify 日常維護指南

此文件供站主與後續 Codex 任務選擇查詢入口及工具。2026-09-21 已透過 Netlify 外掛成功讀取帳號、專案與正式部署資料；連線、權限及部署狀態日後仍須重新確認。

## 專案識別

- 正式網站：[giraffegallery.com](https://giraffegallery.com)
- Netlify 專案：[scratch-gallery](https://app.netlify.com/projects/scratch-gallery)
- 團隊帳務入口使用的 slug：`wunia0219`
- Netlify Site ID：`17741d69-bc86-43b0-974c-095ccf8a9b21`
- GitHub：[Wunia0219/scratch-gallery](https://github.com/Wunia0219/scratch-gallery)，正式分支 `main`。
- 本機架構：Vue 3／Vite、Node.js 24；靜態輸出 `dist/`，後端為 Functions／Blobs。部署設定依 `netlify.toml` 與 [README](../README.md)。
- 已確認部署的函式：`play-counts`、`word-alchemy-leaderboard`。這是查核日期的快照，不作為未來狀態保證。

## 常用資訊與何時查看

| 資訊／入口 | 適合查看的時機 | 要確認的內容與後續用途 |
| --- | --- | --- |
| [每月 Credit usage](https://app.netlify.com/teams/wunia0219/billing/general#credit-usage-breakdown) | 每個帳期、密集發布前、活動前後、收到用量通知時 | 帳期起訖、方案額度、已用／剩餘 credits、各分項、額外購買或自動加購設定；據此評估發布頻率與優化優先順序。帳期未必從每月 1 日開始。 |
| [Netlify 專案](https://app.netlify.com/projects/scratch-gallery) → Deploys | 發布前後、畫面仍是舊版、建置失敗 | 正式／預覽環境、分支、commit、發布時間、狀態、錯誤及建置日誌；確認真正上線的是哪一版。 |
| [Functions 日誌](https://app.netlify.com/projects/scratch-gallery/logs/functions) | 遊玩次數不更新、排行榜儲存失敗、API 緩慢 | 對照出錯時間與函式，檢查錯誤及執行狀況；部署成功不代表功能實測成功。 |
| 專案 → 網域／HTTPS 設定 | 自訂網域無法開啟、憑證或轉址異常 | DNS、主要網域、HTTPS、舊網址轉址；修改後依專案規定執行正式站檢查。 |
| 專案 → 建置／環境變數設定 | 本機正常但部署失敗、預覽與正式行為不同 | 建置命令、輸出目錄、Node 版本、變數適用環境、`SITE_URL`／`URL`；不把密鑰值寫進文件。 |
| 專案 → Blobs（若帳號介面提供） | 計數／排行榜資料疑似遺失、需要規劃備份或資料修復 | 先核對 Function 使用的 store 與資料格式、正式／測試環境；資料修復另行界定範圍。 |
| 專案 → 存取控制 | 預覽連結無法分享或要求登入 | 確認非正式環境限制；2026-09-21 工具回報 non-production 需要團隊登入。`noindex` 不等於存取控制。 |
| [GitHub Actions](https://github.com/Wunia0219/scratch-gallery/actions) | PR 合併前、套件更新、CI 失敗 | 配合 Netlify 部署檢查確認必要驗證通過；細節見 SECURITY.md。 |

除已列出的直接入口，其餘從專案管理頁進入，避免依賴可能變更的子頁網址。控制台登入權限與外掛可讀欄位可能不同；不得宣稱所有日誌或帳務資料都可由外掛取得。

## Credits 判讀與紀錄

- 將觀察記入 [netlify-usage-log.md](netlify-usage-log.md)：查詢時間（台灣時間）、billing period、方案額度、各項用量、總 credits、剩餘額度，以及期間的發布／活動。
- 優先檢查控制台實際列出的 production deploys、web requests、bandwidth、compute、AI inference 等分項；計價與配額以當期方案與帳務頁為準，不從舊紀錄推定固定費率。
- 比較增量前確認同帳期。Requests 不等於訪客或遊玩次數，累積用量不能直接證明某項優化的節省比例。
- 部署佔增量較高：建議先在本機／預覽完成驗證，再集中正式發布；不要未查方案便保證預覽不計費。
- 頻寬增長較快：先查大型影片、遊戲素材、按需載入及快取；compute／requests 增長較快：先查 Functions 呼叫、重試與快取。
- 只有確認當期額度、已用量及帳期時間後才估算餘額或耗盡風險，並註明流量變化造成的不確定性。
- 本次無法透過可用工具讀取 Credit usage 登入頁，因此未記入即時餘額或方案配額。歷史紀錄不代表目前剩餘額度。

## 何時使用 Netlify 外掛與技能

- 查帳號、專案、指定部署：優先使用 Netlify 外掛的唯讀工具。查詢不到的帳務／日誌改由已授權的瀏覽器操作或請站主提供所需數值，清楚標示來源與時間。
- 建置失敗、預覽或部署工作：使用 `netlify-cli-and-deploy`／`netlify-deploy`；設定問題使用 `netlify-config`。
- 計數／排行榜後端：使用 `netlify-functions`、`netlify-blobs`；快取／頻寬問題使用 `netlify-caching`，需要時再評估 Image CDN。
- 未來提出 AI、表單或登入需求時，才評估對應技能與費用；不因外掛包含技能便自動新增功能。
- 以上是未來相關任務中的建議規則，不是已設定的每月自動監控或通知。
- 正式發布仍遵守 [AGENTS.md](../AGENTS.md) 的當次核准、待發布作品與 `release:mark` 流程；本文件不授權推送 main、正式發布、付費升級或自動加購。
