#!/usr/bin/env node
/**
 * Luxe Flux — 12 品牌 tile 雪碧图生成器
 *
 * 用 SVG 程序化绘制各品牌的「标志性图案 / 商标近似」tile，替代纯色 + 大字母：
 *   - Gucci      GG 帆布（米底棕 GG 对角花）
 *   - Celine     黑底白 CÉLINE wordmark（极简）
 *   - Hermès     爱马仕橙 + 白 H 马车标
 *   - YSL        藏蓝底金字 YSL
 *   - Prada      黑底白 PRADA + 倒三角标
 *   - Chanel     米白底黑双 C 对扣
 *   - Louis Vuitton  老花 Monogram（LV + 四瓣花 + 菱形）
 *   - Dior       黑底白 CD + Oblique 斜纹
 *   - Fendi      米黄底棕双 F 对扣
 *   - Burberry   经典 Nova 格纹
 *   - Bvlgari    祖母绿底金字 BVLGARI
 *   - Tiffany    蒂芙尼蓝 + 白丝带
 *
 * 所有图案均为讽刺消费主义的艺术化近似，不隶属任何品牌。
 * 输出 384x512 雪碧图（4 行 x 3 列，每 tile 128x128），保持与
 * luxe_flux_v2_12tiles.json 切割配置兼容。
 *
 * 用法：node scripts/generate-brand-tiles.mjs
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_PNG = path.join(ROOT, 'public/sprites/luxe_flux_v2_12tiles_sprite.png');

const SS = 512; // 超采样渲染尺寸（4x）
const TILE = 128;
const COLS = 3;
const ROWS = 4;
const R = 84; // 圆角（512 坐标系）

/* ------------------------------------------------------------------ */
/* 通用 SVG 片段                                                        */
/* ------------------------------------------------------------------ */

function frame(bg, inner, opts = {}) {
  const stroke = opts.stroke ?? null;
  const sw = opts.strokeWidth ?? 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SS}" height="${SS}" viewBox="0 0 ${SS} ${SS}">
  <rect width="${SS}" height="${SS}" rx="${R}" fill="${bg}"/>
  ${stroke ? `<rect width="${SS}" height="${SS}" rx="${R}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>` : ''}
  ${inner}
</svg>`;
}

/** 四瓣花（LV 老花元素） */
function quatrefoil(cx, cy, scale = 1, fill = '#D6B36A') {
  return `<g fill="${fill}" transform="translate(${cx},${cy}) scale(${scale})">
    <ellipse cx="0" cy="-32" rx="13" ry="28"/>
    <ellipse cx="32" cy="0" rx="28" ry="13"/>
    <ellipse cx="0" cy="32" rx="13" ry="28"/>
    <ellipse cx="-32" cy="0" rx="28" ry="13"/>
    <circle cx="0" cy="0" r="13"/>
  </g>`;
}

/** 菱形 + 中心点（LV 老花元素） */
function diamond(cx, cy, scale = 1, fill = '#D6B36A', hole = '#5C4025') {
  return `<g transform="translate(${cx},${cy}) scale(${scale})">
    <path d="M0 -36 L28 0 L0 36 L-28 0 Z" fill="${fill}"/>
    <circle cx="0" cy="0" r="10" fill="${hole}"/>
  </g>`;
}

/* ------------------------------------------------------------------ */
/* 12 品牌 tile 定义                                                    */
/* ------------------------------------------------------------------ */

const TILES = {
  gucci: frame('#C9A063', `
    <!-- 对角 GG 帆布花（背景，斜纹重复） -->
    <g font-family="Jost" font-weight="700" fill="#4A3226" opacity="0.3">
      <text x="64" y="120" font-size="60" transform="rotate(45 64 120)">GG</text>
      <text x="320" y="120" font-size="60" transform="rotate(45 320 120)">GG</text>
      <text x="-64" y="344" font-size="60" transform="rotate(45 -64 344)">GG</text>
      <text x="192" y="344" font-size="60" transform="rotate(45 192 344)">GG</text>
      <text x="448" y="344" font-size="60" transform="rotate(45 448 344)">GG</text>
      <text x="64" y="568" font-size="60" transform="rotate(45 64 568)">GG</text>
    </g>
    <!-- 中央 GG（并排，主识别） -->
    <text x="256" y="330" font-family="Jost" font-weight="700" font-size="185" letter-spacing="-6" fill="#4A3226" text-anchor="middle">GG</text>
    <g font-family="Jost" font-weight="600" fill="#4A3226" opacity="0.95">
      <text x="256" y="428" font-size="40" letter-spacing="14" text-anchor="middle">GUCCI</text>
    </g>
  `, { stroke: '#7A5B30' }),

  celine: frame('#0C0C0C', `
    <circle cx="256" cy="126" r="13" fill="#F5F1E8"/>
    <text x="256" y="316" font-family="Cinzel" font-weight="600" font-size="128" letter-spacing="16" fill="#F5F1E8" text-anchor="middle">CÉLINE</text>
    <text x="256" y="398" font-family="Jost" font-weight="400" font-size="30" letter-spacing="18" fill="#8C8C8C" text-anchor="middle">PARIS</text>
  `, { stroke: '#3A3A3A' }),

  hermes: frame('#FF6600', `
    <text x="256" y="306" font-family="Cinzel" font-weight="700" font-size="210" fill="#FFFFFF" text-anchor="middle">H</text>
    <text x="256" y="404" font-family="Jost" font-weight="500" font-size="34" letter-spacing="14" fill="#FFFFFF" text-anchor="middle">PARIS</text>
  `, { stroke: '#D85500' }),

  ysl: frame('#002366', `
    <rect x="176" y="140" width="160" height="9" rx="4.5" fill="#D8B45A"/>
    <text x="256" y="316" font-family="Cinzel" font-weight="700" font-size="172" letter-spacing="8" fill="#D8B45A" text-anchor="middle">YSL</text>
    <text x="256" y="398" font-family="Jost" font-weight="400" font-size="27" letter-spacing="7" fill="#D8B45A" opacity="0.9" text-anchor="middle">SAINT LAURENT</text>
  `, { stroke: '#001A4D' }),

  prada: frame('#101010', `
    <path d="M256 120 L348 262 L164 262 Z" fill="none" stroke="#D8D8D8" stroke-width="12"/>
    <path d="M256 158 L324 266 L188 266 Z" fill="none" stroke="#D8D8D8" stroke-width="6"/>
    <text x="256" y="352" font-family="Jost" font-weight="700" font-size="76" letter-spacing="16" fill="#FFFFFF" text-anchor="middle">PRADA</text>
    <text x="256" y="416" font-family="Jost" font-weight="500" font-size="28" letter-spacing="12" fill="#9A9A9A" text-anchor="middle">MILANO</text>
  `, { stroke: '#333333' }),

  chanel: frame('#F5F1EA', `
    <!-- 双 C 对扣（几何感，非衬线） -->
    <g font-family="Jost" font-weight="700" fill="#0C0C0C">
      <text x="256" y="306" font-size="218" text-anchor="middle" transform="rotate(180 256 250)">C</text>
      <text x="256" y="306" font-size="218" text-anchor="middle">C</text>
    </g>
    <text x="256" y="424" font-family="Jost" font-weight="500" font-size="34" letter-spacing="16" fill="#0C0C0C" text-anchor="middle">CHANEL</text>
  `, { stroke: '#C9C2B4' }),

  louisvuitton: frame('#5C4025', `
    <!-- 老花 Monogram：上/下四瓣花 + 四边菱形 + 中央 LV -->
    ${quatrefoil(128, 108, 0.9)}
    ${quatrefoil(384, 108, 0.9)}
    ${quatrefoil(128, 404, 0.9)}
    ${quatrefoil(384, 404, 0.9)}
    ${diamond(256, 62, 0.8)}
    ${diamond(66, 256, 0.8)}
    ${diamond(446, 256, 0.8)}
    ${diamond(256, 450, 0.8)}
    <!-- 中央 LV（大字，主识别） -->
    <g font-family="Cinzel" font-weight="700" fill="#D6B36A">
      <text x="256" y="346" font-size="246" text-anchor="middle" letter-spacing="-14">LV</text>
    </g>
    <text x="256" y="440" font-family="Jost" font-weight="500" font-size="22" letter-spacing="10" fill="#D6B36A" opacity="0.92" text-anchor="middle">LOUIS VUITTON</text>
  `, { stroke: '#3F2A17' }),

  dior: frame('#111111', `
    <!-- Oblique 斜纹 -->
    <g stroke="#2E2E2E" stroke-width="26">
      <line x1="-80" y1="80" x2="592" y2="752"/>
      <line x1="-80" y1="340" x2="592" y2="1012"/>
      <line x1="160" y1="-80" x2="832" y2="592"/>
      <line x1="420" y1="-80" x2="1092" y2="592"/>
    </g>
    <!-- 中央 CD -->
    <text x="256" y="306" font-family="Cinzel" font-weight="700" font-size="205" fill="#F5F5F5" text-anchor="middle">CD</text>
    <text x="256" y="416" font-family="Jost" font-weight="500" font-size="34" letter-spacing="16" fill="#F5F5F5" text-anchor="middle">DIOR</text>
  `, { stroke: '#333333' }),

  fendi: frame('#E5C87B', `
    <!-- 对角小 FF 背景 -->
    <g font-family="Jost" font-weight="700" fill="#6B4A1E" opacity="0.55">
      <text x="104" y="132" font-size="48" transform="rotate(45 104 132)">FF</text>
      <text x="408" y="132" font-size="48" transform="rotate(45 408 132)">FF</text>
      <text x="104" y="436" font-size="48" transform="rotate(45 104 436)">FF</text>
      <text x="408" y="436" font-size="48" transform="rotate(45 408 436)">FF</text>
    </g>
    <!-- 双 F 对扣（镜像） -->
    <g font-family="Jost" font-weight="700" fill="#6B4A1E">
      <text x="256" y="310" font-size="195" text-anchor="middle">F</text>
      <text x="256" y="310" font-size="195" text-anchor="middle" transform="scale(-1,1) translate(-512,0)">F</text>
    </g>
    <text x="256" y="420" font-family="Jost" font-weight="600" font-size="40" letter-spacing="14" fill="#6B4A1E" text-anchor="middle">FENDI</text>
  `, { stroke: '#A8863F' }),

  burberry: frame('#D9C49A', `
    <!-- Nova 格纹：红条 + 黑细线 + 白细线 -->
    <g>
      <rect x="0" y="96"  width="512" height="46" fill="#A5001E"/>
      <rect x="0" y="232" width="512" height="46" fill="#A5001E"/>
      <rect x="0" y="368" width="512" height="46" fill="#A5001E"/>
      <rect x="96"  y="0" width="46" height="512" fill="#A5001E"/>
      <rect x="232" y="0" width="46" height="512" fill="#A5001E"/>
      <rect x="368" y="0" width="46" height="512" fill="#A5001E"/>
      <rect x="0" y="70"  width="512" height="8" fill="#222222"/>
      <rect x="0" y="206" width="512" height="8" fill="#222222"/>
      <rect x="0" y="342" width="512" height="8" fill="#222222"/>
      <rect x="0" y="478" width="512" height="8" fill="#222222"/>
      <rect x="70"  y="0" width="8" height="512" fill="#222222"/>
      <rect x="206" y="0" width="8" height="512" fill="#222222"/>
      <rect x="342" y="0" width="8" height="512" fill="#222222"/>
      <rect x="478" y="0" width="8" height="512" fill="#222222"/>
      <rect x="0" y="58"  width="512" height="6" fill="#F5F5F0"/>
      <rect x="0" y="194" width="512" height="6" fill="#F5F5F0"/>
      <rect x="0" y="330" width="512" height="6" fill="#F5F5F0"/>
      <rect x="0" y="466" width="512" height="6" fill="#F5F5F0"/>
      <rect x="58"  y="0" width="6" height="512" fill="#F5F5F0"/>
      <rect x="194" y="0" width="6" height="512" fill="#F5F5F0"/>
      <rect x="330" y="0" width="6" height="512" fill="#F5F5F0"/>
      <rect x="466" y="0" width="6" height="512" fill="#F5F5F0"/>
    </g>
  `, { stroke: '#8A6A3F' }),

  bvlgari: frame('#1E5C3F', `
    <rect x="160" y="130" width="192" height="10" rx="5" fill="#E9C96B"/>
    <text x="256" y="322" font-family="Cinzel" font-weight="700" font-size="120" letter-spacing="8" fill="#E9C96B" text-anchor="middle">BVLGARI</text>
    <text x="256" y="398" font-family="Jost" font-weight="500" font-size="28" letter-spacing="16" fill="#E9C96B" text-anchor="middle">ROMA</text>
  `, { stroke: '#14432C' }),

  tiffany: frame('#0ABAB5', `
    <!-- 白丝带蝴蝶结（居中，更大更清晰） -->
    <g fill="#FFFFFF">
      <ellipse cx="174" cy="212" rx="70" ry="50" transform="rotate(-26 174 212)"/>
      <ellipse cx="338" cy="212" rx="70" ry="50" transform="rotate(26 338 212)"/>
      <rect x="228" y="170" width="56" height="86" rx="22"/>
      <path d="M228 250 L256 400 L284 250 Z"/>
      <circle cx="256" cy="228" r="22" fill="#0ABAB5"/>
      <circle cx="256" cy="228" r="13" fill="#FFFFFF"/>
    </g>
    <text x="256" y="438" font-family="Cinzel" font-weight="600" font-size="38" letter-spacing="5" fill="#FFFFFF" text-anchor="middle">TIFFANY</text>
  `, { stroke: '#089A96' })
};

/* ------------------------------------------------------------------ */
/* 生成雪碧图                                                           */
/* ------------------------------------------------------------------ */

async function renderTile(svg) {
  return sharp(Buffer.from(svg))
    .resize(TILE, TILE, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
}

const ORDER = ['gucci', 'celine', 'hermes', 'ysl', 'prada', 'chanel', 'louisvuitton', 'dior', 'fendi', 'burberry', 'bvlgari', 'tiffany'];

async function main() {
  const composites = [];
  for (let i = 0; i < ORDER.length; i++) {
    const name = ORDER[i];
    const buf = await renderTile(TILES[name]);
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    composites.push({ input: buf, left: c * TILE, top: r * TILE });
    console.log(`  ✓ ${name.padEnd(13)} ${buf.length} bytes`);
  }
  await sharp({
    create: { width: COLS * TILE, height: ROWS * TILE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite(composites)
    .png()
    .toFile(OUT_PNG);
  console.log(`\n雪碧图已写入 ${path.relative(ROOT, OUT_PNG)} (${COLS * TILE}x${ROWS * TILE})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
