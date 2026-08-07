#!/usr/bin/env node
/**
 * Luxe Flux — 12 品牌 tile 高清雪碧图生成器（8K 素材切割 + 程序化补齐）
 *
 * 数据来源：
 *  - 用户提供的 8K 高清品牌 tile 图 `assets/luxury_tiles_8k_source.png`
 *    （3x3 网格，9 个品牌：Gucci / Celine / Hermès / YSL / Prada / Chanel / LV / Dior / Fendi）
 *  - Burberry / Bvlgari / Tiffany 三个品牌用 SVG 程序化绘制补齐
 *    （与 generate-brand-tiles.mjs 的图案风格一致，但按 8K 卡片风格重绘）
 *
 * 输出：public/sprites/luxe_flux_v2_12tiles_sprite.png（768x1024，4 行 x 3 列，每 tile 256x256）
 * 切割配置与 luxe_flux_v2_12tiles.json 保持一致（TILE_SIZE 256）。
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

const TILE = 256;
const COLS = 3;
const ROWS = 4;

/** 12 品牌顺序（前 9 来自 8K 源图，后 3 程序化补齐） */
const ORDER = [
  'gucci', 'celine', 'hermes',
  'ysl', 'prada', 'chanel',
  'louisvuitton', 'dior', 'fendi',
  'burberry', 'bvlgari', 'tiffany'
];

/**
 * 8K 源图中 9 张卡片的精确切割坐标（卡片灰边矩形，含圆角边框）。
 * 基于对源图白色间隙与灰边边框的像素级检测得出。
 */
const SRC_CARDS = {
  gucci:        { left: 25,  top: 42,  width: 641, height: 676 },
  celine:       { left: 702, top: 42,  width: 607, height: 676 },
  hermes:       { left: 1342,top: 42,  width: 610, height: 676 },
  ysl:          { left: 25,  top: 751, width: 641, height: 643 },
  prada:        { left: 702, top: 751, width: 607, height: 643 },
  chanel:       { left: 1342,top: 751, width: 610, height: 643 },
  louisvuitton: { left: 25,  top: 1426, width: 641, height: 611 },
  dior:         { left: 702, top: 1426, width: 607, height: 611 },
  fendi:        { left: 1342,top: 1426, width: 610, height: 611 }
};

/* ------------------------------------------------------------------ */
/* 程序化补齐品牌（SVG，1024 超采样，卡片风格与 8K 素材一致）            */
/* ------------------------------------------------------------------ */

const SS = 1024;
const R = 168;

function frame(bg, inner, stroke) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SS}" height="${SS}" viewBox="0 0 ${SS} ${SS}">
  <rect width="${SS}" height="${SS}" rx="${R}" fill="${bg}"/>
  <rect width="${SS}" height="${SS}" rx="${R}" fill="none" stroke="${stroke}" stroke-width="30"/>
  ${inner}
</svg>`;
}

const SVG_TILES = {
  // 经典 Nova 格纹（米底红黑格）
  burberry: frame('#D9C49A', `
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
  bvlgari: frame('#145A38', `
    <rect x="300" y="200" width="424" height="22" rx="11" fill="#E8C96A"/>
    <text x="512" y="600" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="196" letter-spacing="14" fill="#E8C96A" text-anchor="middle">BVLGARI</text>
    <text x="512" y="706" font-family="Georgia, serif" font-weight="600" font-size="70" letter-spacing="36" fill="#E8C96A" text-anchor="middle">ROMA</text>
  `, '#0E3D26'),

  // 蒂芙尼蓝 + 白色丝带蝴蝶结
  tiffany: frame('#0ABAB5', `
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
/* 生成                                                                */
/* ------------------------------------------------------------------ */

async function renderSvgTile(name) {
  const svg = SVG_TILES[name];
  if (!svg) throw new Error('unknown svg tile: ' + name);
  return sharp(Buffer.from(svg))
    .resize(TILE, TILE, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
}

async function cutSourceTile(name) {
  const rect = SRC_CARDS[name];
  if (!rect) throw new Error('unknown source card: ' + name);
  return sharp(SRC_IMG)
    .extract(rect)
    .resize(TILE, TILE, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
}

async function main() {
  if (!fs.existsSync(SRC_IMG)) {
    console.error(`✗ 未找到 8K 源图: ${SRC_IMG}`);
    console.error('  请将用户提供的 8K 品牌 tile 图保存为 assets/luxury_tiles_8k_source.png');
    process.exit(1);
  }

  const composites = [];
  for (let i = 0; i < ORDER.length; i++) {
    const name = ORDER[i];
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    const buf = SRC_CARDS[name] ? await cutSourceTile(name) : await renderSvgTile(name);
    composites.push({ input: buf, left: c * TILE, top: r * TILE });
    console.log(`  ✓ ${name.padEnd(13)} ${(buf.length / 1024).toFixed(0)} KB`);
  }

  await sharp({
    create: { width: COLS * TILE, height: ROWS * TILE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite(composites)
    .png({ palette: true, compressionLevel: 9, adaptiveFiltering: true })
    .toFile(OUT_PNG);

  const stat = fs.statSync(OUT_PNG);
  console.log(`\n雪碧图已写入 ${path.relative(ROOT, OUT_PNG)} (${COLS * TILE}x${ROWS * TILE}, ${(stat.size / 1024).toFixed(0)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
