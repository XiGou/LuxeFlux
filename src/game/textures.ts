/**
 * Phaser 引擎纹理生成
 *
 * 从高清雪碧图（public/sprites/luxe_flux_v2_12tiles_sprite.png）切割 12 个品牌 tile
 * 作为 Phaser 纹理（384x512，4 行 x 3 列，每 tile 128x128，透明背景）。
 * 雪碧图已通过 EDSR x4 超分辨率重建，logo 高清清晰。
 *
 * 加载策略：模块级缓存一张 HTMLImageElement，全局唯一（兼容 React StrictMode
 * 双挂载与 Capacitor file:// 等复杂场景）。场景 create() 时确保雪碧图就绪后
 * 切割注册 12 个 token 纹理并回调通知场景重绘。
 */
import type { TokenType } from '../types/game';

/** 雪碧图资源路径（相对路径，兼容 Capacitor file:// WebView 与 H5 部署） */
export const SPRITE_URL = 'sprites/luxe_flux_v2_12tiles_sprite.png';

/** 雪碧图切割配置（与 luxe_flux_v2_12tiles.json 一致） */
export const TILE_SIZE = 128;
export const SPRITE_COLS = 3;

/** 雪碧图纹理 key */
export const SPRITE_KEY = 'luxe-spritesheet';

/** 雪碧图行序：12 tile 的品牌（行主序，4 行 x 3 列） */
export const SPRITE_ORDER: TokenType[] = [
  'gucci', 'celine', 'hermes',
  'ysl', 'prada', 'chanel',
  'louisvuitton', 'dior', 'fendi',
  'burberry', 'bvlgari', 'tiffany'
];

/** 品牌 → 雪碧图帧序号 */
const FRAME_INDEX: Record<TokenType, number> = Object.fromEntries(
  SPRITE_ORDER.map((t, i) => [t, i])
) as Record<TokenType, number>;

/** 纹理 key */
export function tokenTextureKey(type: TokenType): string {
  return `token-${type}`;
}

/** 模块级雪碧图加载缓存（全局唯一 Promise） */
let spritePromise: Promise<HTMLImageElement> | null = null;

/** 加载雪碧图为 HTMLImageElement（模块级缓存，幂等） */
function loadSpriteImage(): Promise<HTMLImageElement> {
  if (spritePromise) return spritePromise;
  spritePromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      spritePromise = null; // 允许重试
      reject(new Error('sprite sheet load failed: ' + SPRITE_URL));
    };
    img.src = SPRITE_URL;
  });
  return spritePromise;
}

/**
 * 确保雪碧图已加载并注册到指定场景的纹理管理器。
 * 返回 Promise，resolve 后即可使用 token-* 纹理。
 */
export function ensureSpriteReady(scene: Phaser.Scene): Promise<void> {
  return loadSpriteImage().then((img) => {
    // 场景可能已被销毁（StrictMode 双挂载），此时跳过注册
    try {
      const game = (scene.sys as { game?: Phaser.Game | null } | null)?.game;
      if (!game) return;
      if (scene.textures.exists(SPRITE_KEY)) {
        scene.textures.get(SPRITE_KEY).setDataSource(img);
      } else {
        scene.textures.addImage(SPRITE_KEY, img);
      }
      registerAllTokenTextures(scene);
    } catch (e) {
      // 场景已销毁等场景，静默跳过（活跃实例会自行注册）
    }
  });
}

/**
 * 启动雪碧图加载（幂等）。加载完成后注册 12 个品牌 token 纹理并回调 onReady。
 * 若已就绪则立即回调。
 */
export function loadSpriteSheet(scene: Phaser.Scene, onReady?: () => void): void {
  if (scene.textures.exists(SPRITE_KEY) && scene.textures.get(SPRITE_KEY).getSourceImage()?.width) {
    registerAllTokenTextures(scene);
    onReady?.();
    return;
  }
  ensureSpriteReady(scene)
    .then(() => {
      onReady?.();
    })
    .catch((e) => {
      console.error('[LuxeFlux] sprite sheet error:', e);
    });
}

/** 注册全部 12 个品牌 token 纹理（雪碧图已就绪时有效） */
export function registerAllTokenTextures(scene: Phaser.Scene): void {
  for (const t of SPRITE_ORDER) {
    const key = tokenTextureKey(t);
    if (scene.textures.exists(key)) continue;
    const frame = getSpriteFrame(scene, FRAME_INDEX[t]);
    if (frame) scene.textures.addCanvas(key, frame);
  }
}

/** 将雪碧图注册为 Phaser 纹理（幂等，供 registerTokenTextures 兼容调用） */
export function registerTokenTextures(scene: Phaser.Scene, types: TokenType[]): void {
  // 若雪碧图尚未就绪，触发一次加载（onReady 会注册全部 token）
  if (!scene.textures.exists(SPRITE_KEY) || !scene.textures.get(SPRITE_KEY).getSourceImage()?.width) {
    loadSpriteSheet(scene);
    return;
  }
  for (const t of types) {
    const key = tokenTextureKey(t);
    if (scene.textures.exists(key)) continue;
    const idx = FRAME_INDEX[t];
    if (idx === undefined) continue;
    const frame = getSpriteFrame(scene, idx);
    if (frame) scene.textures.addCanvas(key, frame);
  }
}

/** 从雪碧图截取第 idx 帧（行主序）为独立 Canvas */
function getSpriteFrame(scene: Phaser.Scene, idx: number): HTMLCanvasElement | null {
  if (!scene.textures.exists(SPRITE_KEY)) return null;
  const base = scene.textures.get(SPRITE_KEY).getSourceImage() as HTMLImageElement;
  if (!base || base.width === 0) return null;

  const r = Math.floor(idx / SPRITE_COLS);
  const c = idx % SPRITE_COLS;
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(base, c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE, 0, 0, TILE_SIZE, TILE_SIZE);
  return canvas;
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
