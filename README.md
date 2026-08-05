# Luxe Flux — The $29,980 Match-3

> 一款諷刺消費主義的奢華黑金風格 H5 消消樂遊戲。
> Mobile-First 設計，從第一天就為 Capacitor（iOS & Android）跨平台 App 構建做好準備。

![Tech](https://img.shields.io/badge/React-18-61DAFB) ![Vite](https://img.shields.io/badge/Vite-5-646CFF) ![TS](https://img.shields.io/badge/TypeScript-5-3178C6) ![Capacitor](https://img.shields.io/badge/Capacitor-6-119EFF) ![Tailwind](https://img.shields.io/badge/Tailwind-3-38BDF8)

---

## 🎮 遊戲介紹

在 8×8 的棋盤上匹配奢侈品牌 Logo，累積你的 **Prespend（配貨額度）**。
消除越多，配貨越高 —— 但小心，消費主義的深淵等著你：

- **Match-3** → 每格 +$1,980
- **Match-4** → 生成行/列爆破符號（×2 倍率）
- **Match-5** → 生成「全配貨炸彈」，整盤同色清空（×3 倍率 + $2,980 紅利）
- **Cascade 連消** → 連鎖加分，最高連消紀錄在案

配貨達到門檻，解鎖諷刺評語：

| 配貨總額 | 評語 |
| --- | --- |
| < $10,000 | SA 對你冷笑了下：「抱歉，本店不單賣配貨配件。」 |
| $10,000 – $30,000 | 恭喜！您已成功配貨，獲得等候 Birkin 25 包包的名單資格（預計等待 3 年）。 |
| > $50,000 | 尊貴的 VIP，品牌 CEO 親自為您開門！您已擊敗全球 99% 的消費主義受害者！ |

### 💎 VIP 配貨特權（道具）

1. **配貨綠色通道 (Green Channel)** — 點擊棋盤任意格，直接消除 3×3 範圍。
2. **溢價轉售 (Markup Resale)** — 隨機將一種普通 Logo 升級為高分「限量版」（消除 ×3）。
3. **二手配貨 (Resell Market)** — 重新打亂盤面，保證無初始匹配且有解。

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
│   └── generate-icons.cjs     # 生成佔位圖示的腳本
└── src/
    ├── types/game.ts          # 型別定義（格子/道具/狀態）
    ├── utils/
    │   ├── gameLogic.ts       # 完整消消樂演算法（生成/匹配/交換/消除/重力/道具）
    │   └── soundAndHaptics.ts # Capacitor Haptics + Howler 音效封裝
    ├── components/
    │   ├── GameBoard.tsx      # 8×8 棋盤（Framer Motion + Touch/Drag 手勢）
    │   ├── TokenFace.tsx      # 符號視覺（佔位 Icon，可替換真實品牌素材）
    │   ├── Header.tsx         # 步數 / Logo / Prespend
    │   ├── PowerUps.tsx       # 道具欄
    │   └── GameOverModal.tsx  # 結算彈窗 + canvas-confetti 禮花
    └── App.tsx                # 主頁面狀態整合
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
| 計分 | 每格 `$1,980`，4 連 ×2、5 連 ×3 |

### 跨平台 / 原生適配重點

- ✅ **安全區域**：頂欄 `padding-top: env(safe-area-inset-top)`、底欄 `env(safe-area-inset-bottom)`，完整覆蓋 iPhone 劉海與 Android 手勢條。
- ✅ **無全域滾動條**：`html/body { overflow: hidden }`，遊戲區域獨立。
- ✅ **原生震動**：消除 / 道具 / 結算透過 `@capacitor/haptics` 呼叫（Web 端降級 `navigator.vibrate`）。
- ✅ **離線 PWA**：`vite-plugin-pwa` 自動註冊 Service Worker，離線可玩。
- ✅ **WebView 優化**：`base: './'` 相對路徑 + 依賴分包，Android WebView 開啟 `allowMixedContent: false`、深色背景防白閃。

---

## 🧩 替換真實品牌素材

目前棋盤符號使用 **Lucide 圖示**作為佔位原型（`src/components/TokenFace.tsx`）。

要換成真實素材：

1. 把你的 Logo SVG/PNG 放進 `public/assets/brands/`。
2. 修改 `TokenFace.tsx` 的 `ICONS` 映射，改用 `<img>` 或內聯 SVG。
3. 重新執行 `npm run build && npx cap sync`。

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
