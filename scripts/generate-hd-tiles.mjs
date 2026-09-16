#!/usr/bin/env node
/**
 * Luxe Flux — 12 品牌 tile 雪碧图生成器（8K 素材切割 + 程序化补齐）
 *
 * 目标：
 *  1. **棋盘格背景 → 真透明**：8K 源图 `assets/luxury_tiles_8k_source.png`
 *     的卡片间隙/外边距是「白（255）+ 浅灰（约 201）棋盘格」，属于表示透明度的
 *     视觉占位。本脚本把它识别为背景并置为 alpha=0，输出真透明雪碧图。
 *  2. **自动检测切割网格**：不再硬编码手调坐标 —— 按「整列/整行背景占比」
 *     检测出 4 条竖向 + 4 条横向背景带（外边距 + 卡片间隙），
 *     9 张卡片即背景带之间的 9 个格子，切割不再带进邻卡的边缘/棋盘格。
 *  3. **无视觉干扰的瓦片**：每个格子内再做「圆角外背景」洪泛清除（面积过大则回滚，
 *     避免误伤 Chanel 这类白色卡片），随后按内容包围盒居中放进正方形画布
 *     （绝不拉伸变形），最后缩放到 tile 尺寸并保留 3px 透明留白，
 *     使相邻 tile 之间不会互相串色。
 *
 * 输出：
 *  - public/sprites/luxe_flux_v2_12tiles_sprite.png  透明背景雪碧图
 *  - public/sprites/luxe_flux_v2_12tiles.json        同份切割配置（外部工具用）
 *  - src/game/sprite-sheet.json                      运行时唯一数据源（被 textures.ts 引入）
 *
 * 用法：node scripts/generate-hd-tiles.mjs
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SRC_IMG = path.join(ROOT, 'assets/luxury_tiles_8k_source.png');
const OUT_PNG = path.join(ROOT, 'public/sprites/luxe_flux_v2_12tiles_sprite.png');
const OUT_JSON_PUBLIC = path.join(ROOT, 'public/sprites/luxe_flux_v2_12tiles.json');
const OUT_JSON_SRC = path.join(ROOT, 'src/game/sprite-sheet.json');

/* ---------------- 输出规格 ---------------- */
const TILE = 256; // 每个格子尺寸
const COLS = 3;
const ROWS = 4;
const INSET = 3; // tile 内容四周透明留白（防相邻 tile 采样串色）
const CONTENT = TILE - INSET * 2; // 卡片实际渲染尺寸 250

/** 12 品牌顺序（前 9 来自 8K 源图，后 3 程序化补齐），行主序 */
const ORDER = [
  'gucci', 'celine', 'hermes',
  'ysl', 'prada', 'chanel',
  'louisvuitton', 'dior', 'fendi',
  'burberry', 'bvlgari', 'tiffany'
];

/** 兜底：源图结构异常时使用的手工坐标（旧版配置） */
const FALLBACK_CARDS = {
  gucci: { left: 25, top: 42, width: 641, height: 676 },
  celine: { left: 702, top: 42, width: 607, height: 676 },
  hermes: { left: 1342, top: 42, width: 610, height: 676 },
  ysl: { left: 25, top: 751, width: 641, height: 643 },
  prada: { left: 702, top: 751, width: 607, height: 643 },
  chanel: { left: 1342, top: 751, width: 610, height: 643 },
  louisvuitton: { left: 25, top: 1426, width: 641, height: 611 },
  dior: { left: 702, top: 1426, width: 607, height: 611 },
  fendi: { left: 1342, top: 1426, width: 610, height: 611 }
};

/* ------------------------------------------------------------------ */
/* 背景（棋盘格 / 白色间隙）识别                                        */
/* ------------------------------------------------------------------ */

/** 采样顶部外边距，自动识别棋盘格的两个颜色（白 / 浅灰） */
function detectCheckerColors(data, W) {
  let lightSum = 0, lightN = 0, darkSum = 0, darkN = 0;
  for (let y = 2; y < 32; y++) {
    for (let x = 0; x < W; x += 3) {
      const o = (y * W + x) * 4;
      const v = (data[o] + data[o + 1] + data[o + 2]) / 3;
      if (v > 228) { lightSum += v; lightN++; }
      else if (v < 220) { darkSum += v; darkN++; }
    }
  }
  if (!lightN || !darkN) return { light: 255, dark: 201 };
  return { light: lightSum / lightN, dark: darkSum / darkN };
}

/** 宽松背景判定：近白 / 近浅灰（用于整列整行占比统计） */
function makeBgColorTest(data, colors) {
  const { light, dark } = colors;
  const lightMin = Math.max(light - 6, 248);
  const darkTol = 8;
  return (i4) => {
    const r = data[i4], g = data[i4 + 1], b = data[i4 + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 10) return false;
    const v = (r + g + b) / 3;
    return v >= lightMin || Math.abs(v - dark) <= darkTol;
  };
}
function makeCheckerMask(data, colors, W, H) {
  const { light, dark } = colors;
  const lightMin = Math.max(light - 12, 245); // 白色档下限（含棋盘白格）
  const darkMin = Math.max(dark - 14, 185);
  const darkMax = Math.min(dark + 14, 225);
  const grayTol = 12;
  const radius = 12;
  const n = W * H;
  const lightMask = new Uint8Array(n);
  const darkMask = new Uint8Array(n);
  for (let i = 0, i4 = 0; i < n; i++, i4 += 4) {
    const r = data[i4], g = data[i4 + 1], b = data[i4 + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > grayTol) continue; // 有色彩 → 卡片
    const v = (r + g + b) / 3;
    if (v >= lightMin) lightMask[i] = 1;
    else if (v >= darkMin && v <= darkMax) darkMask[i] = 1;
  }
  // 积分图：O(1) 查矩形内 light/dark 数量
  function buildPS(mask) {
    const ps = new Uint32Array((H + 1) * (W + 1));
    for (let y = 1; y <= H; y++) {
      let rowSum = 0;
      for (let x = 1; x <= W; x++) {
        rowSum += mask[(y - 1) * W + (x - 1)];
        ps[y * (W + 1) + x] = rowSum + ps[(y - 1) * (W + 1) + x];
      }
    }
    return ps;
  }
  function rectSum(ps, x0, y0, x1, y1) {
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 >= W) x1 = W - 1;
    if (y1 >= H) y1 = H - 1;
    if (x0 > x1 || y0 > y1) return 0;
    x0++; y0++; x1++; y1++;
    return ps[y1 * (W + 1) + x1] - ps[y0 * (W + 1) + x1] -
      ps[y1 * (W + 1) + x0] + ps[y0 * (W + 1) + x0];
  }
  const lightPS = buildPS(lightMask);
  const darkPS = buildPS(darkMask);
  const checker = new Uint8Array(n);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (lightMask[i]) {
        if (rectSum(darkPS, x - radius, y - radius, x + radius, y + radius) > 0) checker[i] = 1;
      } else if (darkMask[i]) {
        if (rectSum(lightPS, x - radius, y - radius, x + radius, y + radius) > 0) checker[i] = 1;
      }
    }
  }
  return checker;
}

/**
 * 找出「整列 / 整行都是背景」的连续带（外边距 + 卡片间隙）。
 * 棋盘格里偶尔会混入 1px 的卡片描边/抗锯齿像素把带子切断，
 * 因此对结果做一次「闭运算」：间隔 ≤ maxGap 的相邻带合并，再过滤掉过短的带。
 */
function findBands(frac, threshold, minLen, maxGap = 12) {
  const raw = [];
  let start = -1;
  for (let i = 0; i < frac.length; i++) {
    const inBand = frac[i] >= threshold;
    if (inBand && start < 0) start = i;
    if (!inBand && start >= 0) {
      raw.push([start, i - 1]);
      start = -1;
    }
  }
  if (start >= 0) raw.push([start, frac.length - 1]);

  const merged = [];
  for (const band of raw) {
    const last = merged[merged.length - 1];
    if (last && band[0] - last[1] - 1 <= maxGap) last[1] = band[1];
    else merged.push([band[0], band[1]]);
  }
  return merged.filter((b) => b[1] - b[0] + 1 >= minLen);
}

/* ------------------------------------------------------------------ */
/* 单张卡片处理                                                        */
/* ------------------------------------------------------------------ */

/**
 * 在格子内洪泛清除「连到格子边缘的背景」（卡片圆角外的棋盘格）。
 * 若清除面积超过格子的 maxRatio，判定为误伤（如 Chanel 白色卡片）并回滚。
 */
function clearOuterBackground(data, W, rect, isBg, maxRatio = 0.3) {
  const { left, top, width, height } = rect;
  const clear = new Uint8Array(width * height);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (clear[i]) return;
    if (!isBg(((y + top) * W + (x + left)) * 4)) return;
    clear[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }
  while (stack.length) {
    const p = stack.pop();
    const px = p % width, py = (p / width) | 0;
    push(px - 1, py);
    push(px + 1, py);
    push(px, py - 1);
    push(px, py + 1);
  }
  let n = 0;
  for (let i = 0; i < clear.length; i++) if (clear[i]) n++;
  const ok = n / clear.length <= maxRatio;
  return { clear, removed: n, applied: ok };
}

/** 取出格子内容（已去背）并居中放进正方形画布，返回 RGBA raw buffer */
function extractSquare(data, W, rect, clear) {
  const { left, top, width, height } = rect;
  // 内容包围盒（未被清除的像素）
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (clear[y * width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const side = Math.max(cw, ch);
  const out = new Uint8Array(side * side * 4); // 默认全 0 = 透明
  const ox = ((side - cw) / 2) | 0;
  const oy = ((side - ch) / 2) | 0;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (clear[(y + minY) * width + (x + minX)]) continue;
      const s = ((y + minY + top) * W + (x + minX + left)) * 4;
      const d = ((y + oy) * side + (x + ox)) * 4;
      out[d] = data[s];
      out[d + 1] = data[s + 1];
      out[d + 2] = data[s + 2];
      out[d + 3] = 255;
    }
  }
  return { buffer: out, side, content: { w: cw, h: ch } };
}

/* ------------------------------------------------------------------ */
/* 程序化补齐品牌（SVG，1024 超采样，卡片风格与 8K 素材一致）            */
/* ------------------------------------------------------------------ */

const SS = 1024;
const SS_R = 168;

function svgFrame(bg, inner, stroke) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SS}" height="${SS}" viewBox="0 0 ${SS} ${SS}">
  <rect width="${SS}" height="${SS}" rx="${SS_R}" fill="${bg}"/>
  <rect width="${SS}" height="${SS}" rx="${SS_R}" fill="none" stroke="${stroke}" stroke-width="30"/>
  ${inner}
</svg>`;
}

const SVG_TILES = {
  // 经典 Nova 格纹（米底红黑格）
  burberry: svgFrame('#D9C49A', `
    <g>
      <rect x="0" y="192"  width="1024" height="92" fill="#A5001E"/>
      <rect x="0" y="464" width="1024" height="92" fill="#A5001E"/>
      <rect x="0" y="736" width="1024" height="92" fill="#A5001E"/>
      <rect x="192"  y="0" width="92" height="1024" fill="#A5001E"/>
      <rect x="464" y="0" width="92" height="1024" fill="#A5001E"/>
      <rect x="736" y="0" width="92" height="1024" fill="#A5001E"/>
      <rect x="0" y="140"  width="1024" height="16" fill="#222222"/>
      <rect x="0" y="412" width="1024" height="16" fill="#222222"/>
      <rect x="0" y="684" width="1024" height="16" fill="#222222"/>
      <rect x="0" y="956" width="1024" height="16" fill="#222222"/>
      <rect x="140"  y="0" width="16" height="1024" fill="#222222"/>
      <rect x="412" y="0" width="16" height="1024" fill="#222222"/>
      <rect x="684" y="0" width="16" height="1024" fill="#222222"/>
      <rect x="956" y="0" width="16" height="1024" fill="#222222"/>
      <rect x="0" y="116"  width="1024" height="12" fill="#F5F5F0"/>
      <rect x="0" y="388" width="1024" height="12" fill="#F5F5F0"/>
      <rect x="0" y="660" width="1024" height="12" fill="#F5F5F0"/>
      <rect x="0" y="932" width="1024" height="12" fill="#F5F5F0"/>
      <rect x="116"  y="0" width="12" height="1024" fill="#F5F5F0"/>
      <rect x="388" y="0" width="12" height="1024" fill="#F5F5F0"/>
      <rect x="660" y="0" width="12" height="1024" fill="#F5F5F0"/>
      <rect x="932" y="0" width="12" height="1024" fill="#F5F5F0"/>
    </g>
  `, '#8A6A3F'),

  // 祖母绿 + 金色 BVLGARI 字样
  bvlgari: svgFrame('#145A38', `
    <rect x="300" y="200" width="424" height="22" rx="11" fill="#E8C96A"/>
    <text x="512" y="600" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="196" letter-spacing="14" fill="#E8C96A" text-anchor="middle">BVLGARI</text>
    <text x="512" y="706" font-family="Georgia, serif" font-weight="600" font-size="70" letter-spacing="36" fill="#E8C96A" text-anchor="middle">ROMA</text>
  `, '#0E3D26'),

  // 蒂芙尼蓝 + 白色丝带蝴蝶结
  tiffany: svgFrame('#0ABAB5', `
    <g fill="#FFFFFF">
      <ellipse cx="296" cy="430" rx="168" ry="118" transform="rotate(-24 296 430)"/>
      <ellipse cx="728" cy="430" rx="168" ry="118" transform="rotate(24 728 430)"/>
      <rect x="438" y="310" width="148" height="200" rx="55"/>
      <path d="M438 490 L512 880 L586 490 Z"/>
      <circle cx="512" cy="450" r="54" fill="#0ABAB5"/>
      <circle cx="512" cy="450" r="30" fill="#FFFFFF"/>
    </g>
    <text x="512" y="952" font-family="Georgia, serif" font-weight="600" font-size="84" letter-spacing="8" fill="#FFFFFF" text-anchor="middle">TIFFANY</text>
  `, '#089A96')
};

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

async function main() {
  if (!fs.existsSync(SRC_IMG)) {
    console.error(`✗ 未找到 8K 源图: ${SRC_IMG}`);
    process.exit(1);
  }

  const { data, info } = await sharp(SRC_IMG).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  console.log(`源图 ${W}x${H}`);

  /* 1. 识别棋盘格背景色 */
  const colors = detectCheckerColors(data, W);
  const checker = makeCheckerMask(data, colors, W, H);
  const isBg = (i4) => checker[i4 / 4] === 1;
  // 宽松版（只看颜色）：用于整列/整行背景占比检测，避免严格掩码漏判
  const isBgColor = makeBgColorTest(data, colors);
  console.log(`棋盘格背景色: 白 ${colors.light.toFixed(1)} / 浅灰 ${colors.dark.toFixed(1)}`);

  /* 2. 整列 / 整行背景占比 → 背景带（外边距 + 间隙） */
  const colFrac = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    let n = 0;
    for (let y = 0; y < H; y++) if (isBgColor((y * W + x) * 4)) n++;
    colFrac[x] = n / H;
  }
  const rowFrac = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) if (isBgColor((y * W + x) * 4)) n++;
    rowFrac[y] = n / W;
  }
  const vBands = findBands(colFrac, 0.9, 12);
  const hBands = findBands(rowFrac, 0.9, 12);
  console.log(`检测到竖向背景带 ${vBands.length} 条: ${vBands.map((b) => `[${b[0]},${b[1]}]`).join(' ')}`);
  console.log(`检测到横向背景带 ${hBands.length} 条: ${hBands.map((b) => `[${b[0]},${b[1]}]`).join(' ')}`);

  /* 3. 9 张卡片的格子（背景带之间） */
  const cards = {};
  let usedFallback = false;
  if (vBands.length === 4 && hBands.length === 4) {
    const names = ORDER.slice(0, 9);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const left = vBands[c][1] + 1;
        const right = vBands[c + 1][0] - 1;
        const top = hBands[r][1] + 1;
        const bottom = hBands[r + 1][0] - 1;
        cards[names[r * 3 + c]] = { left, top, width: right - left + 1, height: bottom - top + 1 };
      }
    }
  } else {
    usedFallback = true;
    Object.assign(cards, FALLBACK_CARDS);
    console.warn('⚠ 背景带检测数量异常，回退到手工坐标（旧配置）');
  }

  /* 4. 合成雪碧图 */
  const sheet = new Uint8Array(COLS * TILE * ROWS * TILE * 4);
  const sheetW = COLS * TILE;
  const frames = {};
  const sources = {};
  const report = [];

  for (let i = 0; i < ORDER.length; i++) {
    const name = ORDER[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    let squareBuf;
    let side;

    if (cards[name]) {
      const rect = cards[name];
      const { clear, removed, applied } = clearOuterBackground(data, W, rect, isBg);
      const sq = extractSquare(data, W, rect, applied ? clear : new Uint8Array(rect.width * rect.height));
      if (!sq) throw new Error('empty card: ' + name);
      squareBuf = sq.buffer;
      side = sq.side;
      sources[name] = {
        kind: 'cut',
        rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
        content: { w: sq.content.w, h: sq.content.h },
        square: side,
        cornerBgRemoved: applied ? removed : 0
      };
      report.push(
        `  ${name.padEnd(13)} 格子 ${rect.width}x${rect.height} → 内容 ${sq.content.w}x${sq.content.h} → 方 ${side}` +
        `  圆角背景清除 ${((removed / (rect.width * rect.height)) * 100).toFixed(1)}%${applied ? '' : '（超阈值已回滚）'}`
      );
    } else {
      const svg = SVG_TILES[name];
      if (!svg) throw new Error('unknown tile: ' + name);
      squareBuf = await sharp(Buffer.from(svg))
        .resize(CONTENT, CONTENT, { kernel: 'lanczos3' })
        .ensureAlpha()
        .raw()
        .toBuffer();
      side = CONTENT;
      sources[name] = { kind: 'svg', square: CONTENT };
      report.push(`  ${name.padEnd(13)} SVG 程序化生成 → ${CONTENT}`);
    }

    // 缩放到 tile 内容尺寸（保持 1:1 不拉伸，四周留 INSET 透明边）
    const resized = await sharp(Buffer.from(squareBuf), {
      raw: { width: side, height: side, channels: 4 }
    })
      .resize(CONTENT, CONTENT, { kernel: 'lanczos3' })
      .ensureAlpha()
      .raw()
      .toBuffer();

    // 写入雪碧图
    const dx = col * TILE + INSET;
    const dy = row * TILE + INSET;
    for (let y = 0; y < CONTENT; y++) {
      for (let x = 0; x < CONTENT; x++) {
        const s = (y * CONTENT + x) * 4;
        const d = ((y + dy) * sheetW + (x + dx)) * 4;
        sheet[d] = resized[s];
        sheet[d + 1] = resized[s + 1];
        sheet[d + 2] = resized[s + 2];
        sheet[d + 3] = resized[s + 3];
      }
    }
    frames[name] = { x: col * TILE, y: row * TILE, w: TILE, h: TILE };
  }

  await sharp(Buffer.from(sheet), { raw: { width: sheetW, height: ROWS * TILE, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false, effort: 8 })
    .toFile(OUT_PNG);

  /* 5. 写出切割配置（供运行时 / 外部工具使用） */
  const config = {
    url: 'sprites/luxe_flux_v2_12tiles_sprite.png',
    image: 'luxe_flux_v2_12tiles_sprite.png',
    size: { w: sheetW, h: ROWS * TILE },
    tile: { w: TILE, h: TILE },
    content: { size: CONTENT, inset: INSET },
    grid: { cols: COLS, rows: ROWS, spacing: 0, margin: 0 },
    background: 'transparent',
    order: ORDER,
    frames,
    sources,
    meta: {
      app: 'LuxeFlux Sprite Builder',
      version: '4.0',
      format: 'RGBA8888',
      scale: '1',
      source: {
        image: 'assets/luxury_tiles_8k_source.png',
        size: { w: W, h: H },
        checkerColors: { light: +colors.light.toFixed(1), dark: +colors.dark.toFixed(1) },
        bands: { vertical: vBands, horizontal: hBands },
        autoDetected: !usedFallback
      }
    }
  };
  const json = JSON.stringify(config, null, 2) + '\n';
  fs.writeFileSync(OUT_JSON_PUBLIC, json);
  fs.writeFileSync(OUT_JSON_SRC, json);

  /* 6. 报告 */
  console.log('\n切割结果：');
  console.log(report.join('\n'));
  const stat = fs.statSync(OUT_PNG);
  console.log(`\n✓ 雪碧图 ${path.relative(ROOT, OUT_PNG)} (${sheetW}x${ROWS * TILE}, ${(stat.size / 1024).toFixed(0)} KB)`);
  console.log(`✓ 切割配置 ${path.relative(ROOT, OUT_JSON_SRC)}（同步 ${path.relative(ROOT, OUT_JSON_PUBLIC)}）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
