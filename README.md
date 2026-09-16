# Luxe Flux — The $29,980 Match-3

> 一款諷刺消費主義的奢華黑金風格 H5 消消樂遊戲。
> Mobile-First 設計，從第一天就為 Capacitor（iOS & Android）跨平台 App 構建做好準備。

![Tech](https://img.shields.io/badge/React-18-61DAFB) ![Vite](https://img.shields.io/badge/Vite-5-646CFF) ![TS](https://img.shields.io/badge/TypeScript-5-3178C6) ![Capacitor](https://img.shields.io/badge/Capacitor-6-119EFF) ![Tailwind](https://img.shields.io/badge/Tailwind-3-38BDF8)

---

## 🎮 遊戲介紹

在 8×8 的棋盤上匹配奢侈品牌 Logo，累積你的 **Prespend（消費額度）**。

核心設定：**消除 = 買下該品牌的一件單品**，全場統一單價 `$1,980 / 件`，
最終帳單 = **採購件數 × 單價**。買得越多，消費越高 —— 消費主義的深淵等著你：

- **Match-3** → 一次買下 3 件
- **Match-4** → 生成行/列爆破符號，整行 / 整列一次買下
- **Match-5** → 生成「全柜同清炸弹」，整盘同色清空（一次買空整個專櫃）
- **Cascade 連消** → 連鎖採購，件數疊加，最高連消紀錄在案

> 價格不因品牌、連消、爆破而不同 —— 連消 / 爆破 / 炸彈的價值只體現在「一次買下更多件」。
> 唯一例外是限量版的「買一配一」潛規則：成交時計 **2 件**（見道具 2）。

採購件數達到門檻，解鎖諷刺評語：

| 採購件數 | 消費總額 | 評語 |
| --- | --- | --- |
| < 60 件 | < $118,800 | SA 對你冷笑了下：「抱歉，本店不單賣配件。」 |
| 60 – 119 件 | $118,800 – $235,620 | 恭喜！您已成功入手，獲得等候 Birkin 25 包包的名單資格（預計等待 3 年）。 |
| ≥ 120 件 | ≥ $237,600 | 尊貴的 VIP，品牌 CEO 親自為您開門！您已擊敗全球 99% 的消費主義受害者！ |

### 💎 VIP 消費特權（道具）

1. **綠色通道 (Green Channel)** — 點擊棋盤任意格，把 3×3 範圍「整櫃打包」買下（最多 9 件），不消耗步數。
2. **限量配貨 (Allocation)** — 隨機將一種普通 Logo 升級為「限量版」；限量版不加價，但按專櫃「買一配一」規則，成交時計 2 件。
3. **二手同款 (Resell Market)** — 重新打亂盤面，保證無初始匹配且有解。

---

## 🚀 一分鐘快速開始

### 1. 安裝依賴

```bash
npm install
```

### 2. 本地開發（H5）

```bash
npm run dev
# 開啟 http://localhost:5173 （手機可用同一 Wi-Fi 連線測試）
```

### 3. 建置 + 同步原生專案

```bash
# 一次性添加原生平台（會生成 ios/ 與 android/ 資料夾）
npx cap add ios
npx cap add android

# 建置 Web 並同步到原生殼
npm run sync

# 用 Xcode 開啟 iOS 專案
npx cap open ios

# 用 Android Studio 開啟 Android 專案
npx cap open android
```

> 就這麼簡單。`npm run sync` = `vite build` + `cap sync`，之後直接 Run 即可。

### 4. 常用腳本

| 指令 | 說明 |
| --- | --- |
| `npm run dev` | H5 開發伺服器 |
| `npm run build` | 型別檢查 + 建置到 `dist/` |
| `npm run preview` | 預覽建置結果 |
| `npm run lint` | 僅型別檢查 |
| `npm run sync` | 建置並同步原生 |
| `npm run ios` / `npm run android` | 建置 + 同步 + 開啟原生 IDE |

---

## 📁 專案結構

```
├── capacitor.config.json      # Capacitor 配置 (appId: com.luxeflux.app)
├── vite.config.ts             # Vite + PWA + 分包優化
├── tailwind.config.js         # 奢華黑金配色 / Playfair+Montserrat
├── tsconfig.json              # 嚴格型別檢查
├── public/
│   ├── favicon.svg            # Logo（佔位）
│   ├── manifest.webmanifest   # PWA 清單
│   └── icons/                 # PWA 圖示（可替換真實素材）
├── scripts/
│   ├── generate-icons.cjs     # 生成佔位圖示的腳本
│   └── smoke-test.ts          # 邏輯冒煙測試
└── src/
    ├── types/game.ts          # 型別定義（格子/道具/狀態/品牌統計）
    ├── utils/
    │   ├── brands.ts          # 品牌素材池（10 個經典包袋品牌，每局抽 6 種）
    │   ├── gameLogic.ts       # 完整消消樂演算法（生成/匹配/交換/消除/重力/道具/動畫階段）
    │   └── soundAndHaptics.ts # Capacitor Haptics + Howler 音效封裝
    ├── game/
    │   ├── Match3Scene.ts     # Phaser 3 場景：棋盤渲染 / Tween 動畫 / 粒子 / 手勢（Canvas/WebGL）
    │   └── textures.ts        # 品牌徽章 Canvas 紋理 + 金色粒子紋理生成
    ├── components/
    │   ├── GameBoardBridge.tsx# Phaser.Game 掛載橋：把引擎場景接入 React（ref 命令式 API）
    │   ├── BrandMark.tsx      # 品牌徽章 SVG（結算彈窗 / 統計用，棋盤改用引擎紋理）
    │   ├── Header.tsx         # 步數 / Logo / Prespend
    │   ├── PowerUps.tsx       # 道具欄
    │   └── GameOverModal.tsx  # 結算彈窗 + 品牌採購統計 + 禮花
    └── App.tsx                # 主頁面狀態整合 + 邏輯狀態機（驅動引擎動畫）
```

---

## 🎨 設計系統

| 屬性 | 值 |
| --- | --- |
| 高冷黑 | `#0A0A0A` / `#121212` |
| 香檳金 | `#D4AF37` / 高光 `#F0D68A` / 深金 `#9A7B2D` |
| 象牙白 | `#F5F5F7` |
| 標題字體 | Playfair Display (Serif) — VOGUE / ELLE 時尚感 |
| 數字/按鈕 | Montserrat (Sans-serif) |
| 計分 | 統一單價 `$1,980 / 件`，按採購件數積分（限量版買一配一計 2 件） |

### 跨平台 / 原生適配重點

- ✅ **安全區域**：頂欄 `padding-top: env(safe-area-inset-top)`、底欄 `env(safe-area-inset-bottom)`，完整覆蓋 iPhone 劉海與 Android 手勢條。
- ✅ **無全域滾動條**：`html/body { overflow: hidden }`，遊戲區域獨立。
- ✅ **原生震動**：消除 / 道具 / 結算透過 `@capacitor/haptics` 呼叫（Web 端降級 `navigator.vibrate`）。
- ✅ **離線 PWA**：`vite-plugin-pwa` 自動註冊 Service Worker，離線可玩。
- ✅ **WebView 優化**：`base: './'` 相對路徑 + 依賴分包，Android WebView 開啟 `allowMixedContent: false`、深色背景防白閃。

---

## 🎮 動畫框架（Phaser 3 遊戲引擎）

> 棋盤已從 React DOM 渲染遷移到 **Phaser 3 Canvas/WebGL 引擎**（`src/game/Match3Scene.ts`）。
> React 只負責「邏輯狀態機 + HUD/UI 外殼」，渲染 / 動畫 / 粒子 / 手勢全部由引擎完成，徹底消除 DOM Reflow 與 React Diff 帶來的卡頓。

一次交換按主流消消樂引擎的標準階段播放：

1. **交換 (swapping)** — 引擎 Tween 將兩格平滑滑動換位（`Cubic.easeInOut`）；
2. **消除 (clearing)** — 命中格縮小旋轉淡出（pop），同時觸發 **金色粒子爆破**（連消段位越高粒子越多）；
3. **下落 (falling)** — 既有格保留 id 彈性下落（`Bounce.easeOut`），頂部新格從上方落入；
4. **連消 (cascade)** — 重複「消除→下落」直到盤面穩定，全程 `busy` 鎖防誤觸。

**引擎級手感細節**：

- **拖拽跟手**：手指按下時起點格會輕微放大並跟隨手指移動（Drag & Drop 手感），鬆開後回彈；
- **交換失敗回彈**：兩格 shake 抖動（不消耗步數）；
- **粒子系統**：`Phaser.Particles` 金色閃光爆破，0/120 FPS 級流暢；
- **限量版 / 爆破 / 炸彈**：金色描邊高亮（引擎 Graphics 疊加層）。

**💸 消費主義特效（金錢雨）**：

- **拖拽撒錢**：按下格子先「抓出一把金幣」，拖動時沿手指軌跡持續掉落金幣，被拖的方塊還會**順著方向傾斜**，像拖著一件戰利品穿過商場；
- **消除噴錢**：每一格消除都同時噴出**金幣 + 美金大鈔**，連消段位越高鈔票越多；
- **飛錢進帳**：消除的格子會弹出金幣 / 大鈔，畫弧線飛向右上角 **Prespend** 消費額並縮小消失 —— 把「消除 = 錢進你的帳單」這條因果直接演出來；
- **連消衝擊波**：連消 ≥ 2 時在消除中心擴散一圈金色光環，買得越多場面越誇張。

引擎紋理由品牌徽章 Canvas 程序化生成（`src/game/textures.ts`），與 React 版 BrandMark 視覺一致，無外部圖片、離線可用；金幣 / 美金大鈔同樣是 Canvas 程序化紋理（`registerCoinTexture` / `registerBillTexture`）。

---

## 🎵 消費主義 BGM 與音效（`src/utils/audioEngine.ts`）

> 全部音樂與音效由 **Web Audio API 即時合成**，零外部音頻素材、零下載體積、離線可用。

- **BGM《Mall Lounge》**：96 BPM 黑金 Lo-fi Trap / 精品店 Lounge，
  kick、snare、hi-hat、bass、電鋼和弦與 **bling 鈴音**（FM 合成，像櫥窗反光），
  4 小節循環和聲 `Fmaj7 → Am7 → Dm7 → G7`。採用前瞻式排程（25ms 輪詢 + 0.2s lookahead），節拍不受 JS 抖動影響。
- **收銀機 KA-CHING**：消除時的錢箱悶響 + 雙鈴 + 高頻碎光，**連消每升一級音高升 2 個半音**（聽得見的消費升級）。
- **金幣叮噹** `B5 → E6` 雙響、**刷卡 swipe**（帶通噪聲掃頻）、**道具上行 bling 琶音**、**結算終止和弦 + 長尾 KA-CHING**。

移動端自動播放策略：AudioContext 必須在首次用戶手勢後解鎖，因此 App 在首次 `pointerdown / touchstart / keydown` 時呼叫 `unlockAudio()` 起播。
頂欄左側提供 **聲音總開關**（同時控制 BGM 與音效），狀態持久化在 `localStorage`。

---

## 🧩 品牌素材

棋盤符號為 **10 個經典包袋品牌** 的風格化 SVG 徽章（`src/components/BrandMark.tsx`）：

> 香奈儿 · 爱马仕 · 路易威登 · 古驰 · 迪奥 · 普拉达 · 赛琳 · 圣罗兰 · 葆蝶家 · 博柏利

- 每局**隨機抽取 6 種**（主流消消樂 5~7 種）生成對局，素材池大於局內種類，多局體驗各不相同。
- 素材為內聯矢量 SVG，離線可用、縮放不失真，後續可替換為 World Vector Logo / Iconfont / Freebie Supply 的真實品牌 SVG。
- 結算畫面展示**每個品牌本局採購（消除）數量**，增加收集趣味。

---

## ⚙️ Capacitor 配置摘要

```json
{
  "appId": "com.luxeflux.app",
  "appName": "Luxe Flux",
  "webDir": "dist",
  "server": { "androidScheme": "https", "iosScheme": "capacitor" }
}
```

- iOS 部署：`npx cap add ios` → Xcode 設定 Team & Bundle ID → Run。
- Android 部署：`npx cap add android` → Android Studio 同步 Gradle → Run。

---

## 📜 License

僅供學習與娛樂用途。所有品牌名稱與圖示僅作為諷刺消費主義的藝術引用，不隸屬於任何品牌。
