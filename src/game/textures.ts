/**
 * Phaser 引擎纹理生成
 *
 * 将品牌徽章以「程序化 Canvas 绘制」生成 Phaser 纹理（与 React 版 BrandMark
 * 视觉一致的离线方案，无外部图片、同步生成、WebGL/Canvas 双兼容）。
 * 另生成金色粒子纹理，用于消除时的闪光爆破。
 */
import type { TokenType } from '../types/game';
import { BRAND_COLORS, BRAND_EN } from '../utils/brands';

/** 品牌缩写（徽章主文字，与 components/BrandMark.tsx 一致） */
const SHORT: Record<TokenType, string> = {
  chanel: 'CC',
  hermes: 'H',
  louisvuitton: 'LV',
  gucci: 'GG',
  dior: 'CD',
  prada: 'PR',
  celine: 'CE',
  ysl: 'YS',
  bottega: 'BV',
  burberry: 'BU'
};

/** 纹理 key */
export function tokenTextureKey(type: TokenType): string {
  return `token-${type}`;
}

const FONT_DISPLAY = '"Playfair Display", Georgia, serif';
const FONT_BODY = 'Montserrat, Arial, sans-serif';

/**
 * 绘制单个品牌徽章 Canvas（参考 BrandMark viewBox=64 的布局等比放大）。
 */
export function drawTokenCanvas(type: TokenType, size = 160): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const color = BRAND_COLORS[type];
  const short = SHORT[type];
  const en = BRAND_EN[type];
  const s = size / 64;

  // 徽章底圆
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 29 * s, 0, Math.PI * 2);
  ctx.fillStyle = '#141414';
  ctx.fill();
  ctx.lineWidth = 1.6 * s;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.stroke();

  // 顶部色带（品牌识别色）
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = color;
  ctx.fillRect(14 * s, 9 * s, 36 * s, 3.2 * s);

  // 中央符号
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${(short.length > 1 ? 21 : 27) * s}px ${FONT_DISPLAY}`;
  ctx.fillText(short, size / 2, 40 * s);

  // 底部品牌名
  ctx.font = `600 ${5.5 * s}px ${FONT_BODY}`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(en, size / 2, 52.5 * s);

  return canvas;
}

/** 将本局使用的品牌注册为 Phaser 纹理（幂等） */
export function registerTokenTextures(scene: Phaser.Scene, types: TokenType[]): void {
  for (const t of types) {
    const key = tokenTextureKey(t);
    if (!scene.textures.exists(key)) {
      scene.textures.addCanvas(key, drawTokenCanvas(t));
    }
  }
}

/** 金色粒子纹理（径向渐变圆点） */
export function registerSparkTexture(scene: Phaser.Scene): string {
  const key = 'spark';
  if (!scene.textures.exists(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,244,200,1)');
    grad.addColorStop(0.45, 'rgba(240,214,138,0.9)');
    grad.addColorStop(1, 'rgba(212,175,55,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    scene.textures.addCanvas(key, canvas);
  }
  return key;
}
