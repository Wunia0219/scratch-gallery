# 字根煉金塔維護筆記

目前已有 Scratch 遊戲、像素素材、網站排行榜 Function 與本機模擬；已取得本次正式發布核准並標記上架時間，日期以 `public/games.json` 的 `publishedAt` 為準。

## 來源與更新

- 作品 UUID：`24871579-c8c8-48e1-a6da-474433f1c16e`。
- `字根煉金塔.sb3`：可獨立開啟的原版，保留遊戲內排行榜。
- `字根煉金塔-排行榜橋接.sb3`：網站匯入版，增加排行榜更新／送出請求變數及積木；兩份不是重複檔。
- `girrafe.json`：100 題詞綴配方與繁體中文翻譯的來源；目前不在網站執行時讀取。修改題庫後須同步遊戲並重新匯入。
- `.packages/word-alchemy-tower/`：本機生成腳本、母片、音訊與編輯素材，未納入 Git；勿與暫存 ZIP 一起整批刪除。

```powershell
npm run import-game -- "字根煉金塔-排行榜橋接.sb3" --id 24871579-c8c8-48e1-a6da-474433f1c16e --replace --leaderboard
npm run verify:local
```

保留封面時不用再傳 `--thumbnail`；若換封面，先依 README 擷取候選並目視選擇。不可手改 `public/games/` 的打包結果。

## 遊戲與素材

主選單提供開始挑戰及前五名排行榜；命名後依英文語意提示組合詞綴與字根，答題、戰鬥、爬塔、結算。答案與中文翻譯在作答後顯示；連擊提高得分。題庫用完才重新洗牌。

維持明亮的 480×360 像素奇幻、藍／黃／橘配色、透明安全邊界與最近鄰縮放。中文文字本機排版，避免生成假字。戰鬥右側四個資訊框對齊，狀態列避開輸入列；主選單保留「連擊越高，得分越多！」，不顯示計分公式等維護資訊。

2026-09-20 盤點：56 張 PNG 共 1,522,457 bytes，最大 573,899 bytes；4 個 WAV 共 2,357,284 bytes，最大 2,304,032 bytes。封面已為 WebP。內部圖片未超過素材預算，保留 Scratch 原生格式；未來縮減體積先評估較大的音樂與背景，從來源修改並重新打包、驗證。

## 排行榜實作

- `src/lib/leaderboardRules.js` 共用名稱、成績驗證及排序；1–8 個英數字名稱，NFKC 正規化後不分大小寫。同名保留最佳，樓層優先、分數次之，同分保留較早紀錄，回傳前五名。
- `scripts/lib/leaderboard-bridge.cjs` 注入 `scratch-gallery-leaderboard-v1` 通道，讀取隱藏請求變數並回寫排行列表。
- `GamePlayerDialog.vue` 驗證目前 iframe 的 `event.source`、通道及作品 ID，再透過 `leaderboardClient.js` 呼叫同源 API；維持 sandbox，不加 `allow-same-origin`。
- `word-alchemy-leaderboard` Function 使用獨立 Blobs，以作品 UUID／正規化名稱 SHA-256 為 key，儲存成績及時間；只允許正式站同源寫入，目前 GET／POST 均為 no-store。
- localhost 使用 localStorage，不碰正式榜；直接開啟原版 SB3 的榜單則只在當次遊戲期間保留。

這是無帳號的友善排行。名稱不是身分認證，分數上下限不能證明真實遊玩；目前儲存為讀取後比較再寫入，同名併發提交仍有競爭限制。不要宣稱完全防作弊或原子更新最佳紀錄。安全界線與驗證見 [SECURITY.md](../SECURITY.md)。
