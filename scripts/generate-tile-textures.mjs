#!/usr/bin/env node
/**
 * Luxe Flux — 12 品牌独立 tile 贴图生成器（雪碧图 → 单图）
 *
 * 背景：
 *   旧方案把 12 个品牌塞进一张 768x1024 雪碧图，棋盘（Phaser）与结算界面
 *   （React）都要自己按行列切割，既耦合又难维护。现改为 **12 张独立 PNG**，
 *   每张图片按现有雪碧图里的单个元素 1:1 生成（内容完全一致，仅改变载体）。
 *
 * 处理要点（消除「糊 + 白边」）：
 *  1. 逐 tile 从雪碧图裁出 256x256，再按 1x / 2x / 3x 用 lanczos3 高质量重采样；
 *  2. **边缘色彩扩散（alpha bleed）**：把 alpha=0 像素的 RGB 染成邻近颜色，
 *     根除缩放 / 过滤 / 旋转时从透明区透出的白色光晕；
 *  3. 输出标准 sRGB PNG，文件名即品牌 slug，运行时直接当普通图片加载。
 *
 * 特例：bvlgari（宝格丽）**不再从旧雪碧图取图**。旧素材里宝格丽 tile 只有一条
 *   金色细横线 + 肉眼不可辨的微小文字，在棋盘上没有可识别符号（Issue 反馈
 *   「图标看不清楚」）。故改为按品牌识别元素**程序化重绘**：墨绿卡面 + 金色
 *   BVLGARI-BVLGARI 经典同心圆/方框宝石符号 + 大号 BVLGARI 字标，
 *   由 buildBvlgariSvg() 生成，再做 4x 超采样降采样，风格与其余 11 张一致。
 *
 * 输出：public/tiles/<brand>@<scale>x.png（共 12 品牌 x 3 档 = 36 张）
 * 用法：node scripts/generate-tile-textures.mjs
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/**
 * 源雪碧图（12 tile，4 行 x 3 列）。
 * 保留在 assets/source/ 只作为**素材来源/历史归档**，不再参与运行时加载 ——
 * 应用只读 public/tiles/ 下的 12 张独立贴图。
 */
const SRC = path.join(ROOT, 'assets/source/luxe_flux_v2_12tiles_sprite.png');
const OUT_DIR = path.join(ROOT, 'public/tiles');

/** 与雪碧图一致的切割配置（4 行 x 3 列，tile 256） */
const TILE = 256;
const COLS = 3;

/**
 * 行主序品牌顺序（必须与雪碧图 / brands.ts 保持一致）。
 * 注意：`bvlgari` 仅用于保持序位/文件命名一致，其贴图由
 * buildBvlgariTiles() 程序化重绘，不再从雪碧图裁切（见文件头说明）。
 */
const ORDER = [
  'gucci', 'celine', 'hermes',
  'ysl', 'prada', 'chanel',
  'louisvuitton', 'dior', 'fendi',
  'burberry', 'bvlgari', 'tiffany'
];

/** 输出倍率（棋盘在设备像素下按 1x/2x/3x 取图，避免运行时缩放糊边） */
const SCALES = [1, 2, 3];

/**
 * 1x 输出用 4 倍超采样渲染后再缩小：
 * 旧图在圆角处是「硬边锯齿 + 半透明白像素」，直接 1:1 复制会让白噪声原样保留；
 * 先在 4x 上做一次平滑，再 lanczos 缩到 256，抗锯齿和白色杂点一起被抹平。
 * 2x / 3x 本身分辨率更高，直接从原图重采样即可。
 */
const SUPERSAMPLE_FOR_1X = 4;

/* ------------------------------------------------------------------ */
/* 边缘色彩扩散                                                        */
/* ------------------------------------------------------------------ */

/**
 * 把 alpha=0 像素的 RGB 替换为邻近有色像素的均值（多趟扩散）。
 * 目的：纹理被线性过滤 / 旋转时，透明区不再混入白色，消除白边。
 */
function bleedTransparentEdges(rgba, size, passes = 3) {
  let src = rgba;
  for (let p = 0; p < passes; p++) {
    const next = Buffer.from(src);
    let changed = false;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        if (src[i + 3] !== 0) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= size) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= size) continue;
            const j = (ny * size + nx) * 4;
            if (src[j + 3] === 0) continue;
            r += src[j]; g += src[j + 1]; b += src[j + 2]; n++;
          }
        }
        if (n > 0) {
          next[i] = Math.round(r / n);
          next[i + 1] = Math.round(g / n);
          next[i + 2] = Math.round(b / n);
          changed = true;
        }
      }
    }
    if (!changed) break;
    src = next;
  }
  return src;
}


/* ------------------------------------------------------------------ */
/* 白色接缝清除（渲染级修复）                                           */
/* ------------------------------------------------------------------ */

/**
 * 旧雪碧图是「合成产物」：每张原图四个方向残留一圈**纯白像素** ——
 * 卡片的白色圆角描边在导图时被裁掉一半，同时相邻 tile 边界（1x 图 y=5 / 250）
 * 也留下整行近白像素。在浅色 / 深色棋盘上都表现为「白边 / 发光边框」。
 *
 * 判定：某像素若「近白」（RGB 全 > 248 且彼此差 < 8）**且**其 7x7 邻域内
 * 存在「明显更暗」的像素，说明它只是贴着内容的一条亮边 —— 直接抹成透明；
 * 卡片本体是连续白面的（如 Chanel）邻域内找不到暗像素，会被完整保留。
 */
function isNearWhite(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mn > 248 && mx - mn < 8;
}

function denoiseWhiteHalo(rgba, size, radius = 3) {
  const src = Uint8Array.from(rgba);
  const at = (x, y) => (y * size + x) * 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = at(x, y);
      if (src[i + 3] === 0) continue;
      if (!isNearWhite(src[i], src[i + 1], src[i + 2])) continue;
      // 邻域内是否存在明显更暗的像素（说明当前像素是贴在内容外的亮边）
      let hasDarker = false;
      for (let dy = -radius; dy <= radius && !hasDarker; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= size) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= size) continue;
          const j = at(nx, ny);
          if (src[j + 3] === 0) continue;
          if (src[j] < 240 || src[j + 1] < 240 || src[j + 2] < 240) { hasDarker = true; break; }
        }
      }
      if (hasDarker) {
        rgba[i] = 0; rgba[i + 1] = 0; rgba[i + 2] = 0; rgba[i + 3] = 0;
      }
    }
  }
  return rgba;
}

/* ------------------------------------------------------------------ */
/* 宝格丽程序化重绘                                                     */
/* ------------------------------------------------------------------ */

/** 宝格丽品牌色：墨绿卡面 + 金色符号/字标（高对比，远距离可辨） */
const BVLGARI_GREEN = '#0E5236';
const BVLGARI_GREEN_DARK = '#0A3C28';
const BVLGARI_GOLD = '#D4AF37';
const BVLGARI_GOLD_LIGHT = '#F0D98C';

/**
 * 生成宝格丽 tile 的矢量源图（以 256px 为设计基准，按 size 等比放大）。
 *
 * 辨识度设计：
 *  - 卡面：墨绿渐变圆角矩形 + 金色内描边，与其余品牌卡片的圆角/描边规格一致；
 *  - 符号：BVLGARI-BVLGARI 经典「方框套同心圆 + 中心圆点」宝石符号，居中偏上；
 *  - 字标：大号 Georgia 衬线 BVLGARI（占卡面宽度约 80%）+ 底部 ROMA 副标。
 * 三者叠加后即便缩到 48px，也能靠「墨绿 + 金环」配色和字标轮廓认出来。
 */
function buildBvlgariSvg(size) {
  const s = size / 256;
  const P = (v) => v * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="face" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="#127048"/>
      <stop offset="55%" stop-color="${BVLGARI_GREEN}"/>
      <stop offset="100%" stop-color="${BVLGARI_GREEN_DARK}"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BVLGARI_GOLD_LIGHT}"/>
      <stop offset="45%" stop-color="${BVLGARI_GOLD}"/>
      <stop offset="100%" stop-color="#A8811F"/>
    </linearGradient>
  </defs>

  <rect x="${P(6)}" y="${P(6)}" width="${P(244)}" height="${P(244)}" rx="${P(46)}" fill="url(#face)"/>
  <rect x="${P(6)}" y="${P(6)}" width="${P(244)}" height="${P(244)}" rx="${P(46)}"
        fill="none" stroke="url(#gold)" stroke-width="${P(3)}" stroke-opacity="0.95"/>

  <g transform="translate(${P(128)},${P(88)})">
    <rect x="${P(-44)}" y="${P(-44)}" width="${P(88)}" height="${P(88)}" rx="${P(13)}"
          fill="none" stroke="url(#gold)" stroke-width="${P(8.5)}"/>
    <circle r="${P(28)}" fill="none" stroke="url(#gold)" stroke-width="${P(11)}"/>
    <circle r="${P(11)}" fill="url(#gold)"/>
  </g>

  <text x="${P(128)}" y="${P(172)}" text-anchor="middle" dominant-baseline="central"
        font-family="Georgia, 'Times New Roman', serif" font-weight="700"
        font-size="${P(38)}" letter-spacing="${P(2)}"
        fill="url(#gold)">BVLGARI</text>
  <text x="${P(128)}" y="${P(206)}" text-anchor="middle" dominant-baseline="central"
        font-family="Montserrat, Arial, sans-serif" font-weight="600"
        font-size="${P(13)}" letter-spacing="${P(6)}"
        fill="${BVLGARI_GOLD_LIGHT}" fill-opacity="0.9">ROMA</text>
  </svg>`;
}

/** 矢量源图渲染基准（4x 超采样，保证圆角/笔画抗锯齿干净） */
const BVLGARI_RENDER_SIZE = 1024;

/** 输出宝格丽 3 档贴图，返回产物路径列表 */
async function buildBvlgariTiles() {
  const source = Buffer.from(buildBvlgariSvg(BVLGARI_RENDER_SIZE));
  const outs = [];
  for (const scale of SCALES) {
    const size = TILE * scale;
    const out = path.join(OUT_DIR, `bvlgari@${scale}x.png`);
    await sharp(source, { density: 384 })
      .resize(size, size, { kernel: 'lanczos3', fit: 'fill' })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(out);
    outs.push(out);
  }
  return outs;
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`✗ 未找到雪碧源图: ${SRC}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  console.log(`源雪碧图 ${W}x${H}`);

  const report = [];
  for (let i = 0; i < ORDER.length; i++) {
    const name = ORDER[i];

    // 宝格丽改为程序化重绘（旧素材无可识别符号），不走雪碧图裁切分支
    if (name === 'bvlgari') {
      const outs = await buildBvlgariTiles();
      report.push(
        `  ${name.padEnd(13)} → ${name}@{${SCALES.join(',')}}x.png  [${SCALES.map(
          (s) => TILE * s
        ).join(' / ')}px]  (程序化重绘, ${outs.length} 张)`
      );
      continue;
    }

    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x0 = col * TILE;
    const y0 = row * TILE;

    // 1. 裁出单 tile 原始像素
    const tile = Buffer.alloc(TILE * TILE * 4);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const s = ((y0 + y) * W + (x0 + x)) * 4;
        const d = (y * TILE + x) * 4;
        tile[d] = data[s];
        tile[d + 1] = data[s + 1];
        tile[d + 2] = data[s + 2];
        tile[d + 3] = data[s + 3];
      }
    }

    // 2. 清除旧雪碧图残留的白色接缝 / 亮边（白边根源）
    denoiseWhiteHalo(tile, TILE);

    // 3. 边缘扩散（在 256 原始尺寸上做一次，后续缩放都受益）
    const bled = bleedTransparentEdges(tile, TILE);
    const src256 = await sharp(bled, { raw: { width: TILE, height: TILE, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toBuffer();

    // 1x：先 4x 平滑再缩回，抹掉圆角处的半透明白噪点
    const smooth256 = await sharp(src256)
      .resize(TILE * SUPERSAMPLE_FOR_1X, TILE * SUPERSAMPLE_FOR_1X, { kernel: 'lanczos3', fit: 'fill' })
      .resize(TILE, TILE, { kernel: 'lanczos3', fit: 'fill' })
      .png({ compressionLevel: 9 })
      .toBuffer();

    const sizes = [];
    for (const scale of SCALES) {
      const out = path.join(OUT_DIR, `${name}@${scale}x.png`);
      const size = TILE * scale;
      const base = scale === 1 ? smooth256 : src256;
      await sharp(base)
        .resize(size, size, { kernel: 'lanczos3', fit: 'fill' })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toFile(out);
      sizes.push(`${size}`);
    }
    report.push(`  ${name.padEnd(13)} → ${name}@{${SCALES.join(',')}}x.png  [${sizes.join(' / ')}px]`);
  }

  console.log('\n生成结果：');
  console.log(report.join('\n'));
  const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.png'));
  const total = files.reduce((n, f) => n + fs.statSync(path.join(OUT_DIR, f)).size, 0);
  console.log(`\n✓ ${files.length} 个文件 @ public/tiles/（合计 ${(total / 1024).toFixed(0)} KB）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
