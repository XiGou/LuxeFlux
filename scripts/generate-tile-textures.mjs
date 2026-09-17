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

/** 行主序品牌顺序（必须与雪碧图 / brands.ts 保持一致） */
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
