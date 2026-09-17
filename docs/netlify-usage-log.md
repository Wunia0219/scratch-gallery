# Netlify 用量觀察紀錄

此表記錄同一個 Netlify billing period 的畫面數據，用來比較網站流量、正式部署與遊玩計數功能造成的 credits 變化。Netlify 顯示可能有數分鐘延遲，`< 1` 代表介面未提供更精確的小數。

| 日期／階段 | Production deploys | Deploy credits | Web requests | Request credits | Compute credits | Bandwidth credits | Total credits |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026-09-17・遊玩計數上線前 | 6 | 90 | 1,414 | 0.3 | 0 | 3.3 | 93.6 |
| 2026-09-17・v1.0.1 上線後 | 7 | 105 | 2,631 | 0.5 | < 1 | 6.8 | 112.4 |

## 第一段變化

- 正式部署：+1 次，+15 credits。
- Web requests：+1,217 次，畫面顯示約 +0.2 credits。
- Bandwidth：約 +3.5 credits；依目前 20 credits/GB 的費率換算，約增加 0.175 GB（約 179 MB）。
- Compute：由 0 變成 `< 1 credit`，符合新增輕量 Netlify Function 後的預期。
- Total：+18.8 credits，其中至少 15 credits 來自本次正式部署。

## 後續記錄方式

每次截圖盡量同時記錄日期、是否仍為同一 billing period、期間內正式部署次數，以及是否有新增遊戲或特殊流量。跨 billing period 時另開小節，不直接用累積值相減。
