# Netlify 用量觀察紀錄

保留使用者提供的歷史顯示值。比較增量須確認同一 billing period；web requests 不是訪客／遊玩人次，`< 1` 不是精確數字。

| 日期／階段 | Production deploys | Deploy credits | Web requests | Request credits | Compute credits | Bandwidth credits | Total credits |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026-09-17・計數上線前 | 6 | 90 | 1,414 | 0.3 | 0 | 3.3 | 93.6 |
| 2026-09-17・v1.0.1 上線後 | 7 | 105 | 2,631 | 0.5 | < 1 | 6.8 | 112.4 |
| 2026-09-20・使用者圖一 | 7 | 105 | 8,760 | 1.8 | 0.1 | 14.1 | 120.9 |

圖一另顯示 AI inference 0 credits，未提供帳期、方案額度或截圖時間；日期以提供日記錄。分項總和 121.0 與總計 120.9 差 0.1，保留原值。

若屬同帳期，最後兩列增加 6,129 requests、7.3 bandwidth credits、8.5 total credits，部署數未變；前次 compute 為 `< 1`，不能算精確增量。不能據此把頻寬歸因於影片、拆分爬蟲／真人或推估剩餘額度。

## 已做的本機優化

- 首頁完整版 7,554,499 bytes，改由 1,109,754-byte 預覽與 39,148-byte poster 作為初始媒體，檔案大小少約 84.8%；完整版點開才載入。實際流量仍受快取、播放時間及 Range 請求影響。
- 計數成功 GET 設定 Netlify 60 秒快取，逐頁處理事件；POST／錯誤 no-store，保留既有事件資料。
- 以上尚未正式部署，圖一不是優化後成效；實際 CDN 命中需上線後確認。

後續每次記錄日期、帳期、部署數、requests、bandwidth、compute、總 credits，以及新增作品／特殊流量；不同帳期分開記錄。操作與發布流程見 [README.md](../README.md)。
