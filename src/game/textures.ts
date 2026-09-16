/**
 * Phaser 引擎纹理生成
 *
 * 从高清雪碧图（public/sprites/luxe_flux_v2_12tiles_sprite.png）切割 12 个品牌 tile
 * 作为 Phaser 纹理（768x1024，4 行 x 3 列，每 tile 256x256，透明背景）。
 *
 * ⚠️ 清晰度关键处理（消除「模糊 + 白边」三件套）：
 *  1. **按设备像素生成纹理**：纹理尺寸跟随实际显示尺寸（设备像素，见 ensureTokenTexture），
 *     256px 源图不再被运行时大幅缩放，避免 WebGL 线性缩小产生的锯齿与糊边。
 *  2. **高质量逐级降采样**：256 → 目标尺寸采用逐级折半，等效 box filter，
 *     避免一次性大比例缩放的采样丢失。
 *  3. **边缘色彩扩散（alpha bleed）**：把完全透明像素的 RGB 染成邻近 logo 的颜色，
 *     根除缩放 / 过滤 / 旋转时从透明区透出的白色光晕（白边）。
 *  4. **透明占位纹理**：素材未就绪时用全透明占位，而不是 Phaser 内置的
 *     `__MISSING` 黑白棋盘格（否则会看到白方块）。
 *
 * 加载策略：模块级缓存一张 HTMLImageElement，全局唯一（兼容 React StrictMode
 * 双挂载与 Capacitor file:// 等复杂场景）。
 */
import type { TokenType } from '../types/game';

/** 雪碧图资源路径（相对路径，兼容 Capacitor file:// WebView 与 H5 部署） */
export const SPRITE_URL = 'sprites/luxe_flux_v2_12tiles_sprite.png';

/** 雪碧图切割配置（与 luxe_flux_v2_12tiles.json 一致） */
export const TILE_SIZE = 256;
export const SPRITE_COLS = 3;

/** 雪碧图纹理 key */
export const SPRITE_KEY = 'luxe-spritesheet';

/** 素材未就绪时的透明占位纹理 key（避免 Phaser __MISSING 棋盘格） */
export const PLACEHOLDER_KEY = 'token-placeholder';

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

/** 纹理 key（size 为空时使用 256 原尺寸纹理） */
export function tokenTextureKey(type: TokenType, size?: number): string {
  return size ? `token-${type}@${size}` : `token-${type}`;
}

/** 模块级雪碧图加载缓存（全局唯一 Promise） */
let spritePromise: Promise<HTMLImageElement> | null = null;
let spriteImg: HTMLImageElement | null = null;

/** 已加载的雪碧图（未就绪返回 null） */
function spriteImage(): HTMLImageElement | null {
  return spriteImg && spriteImg.width > 0 ? spriteImg : null;
}

/** 加载雪碧图为 HTMLImageElement（模块级缓存，幂等） */
export function loadTileImage(): Promise<HTMLImageElement> {
  if (spritePromise) return spritePromise;
  spritePromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      spriteImg = img;
      resolve(img);
    };
    img.onerror = () => {
      spritePromise = null; // 允许重试
      reject(new Error('sprite sheet load failed: ' + SPRITE_URL));
    };
    img.src = SPRITE_URL;
  });
  return spritePromise;
}

/* ------------------------------------------------------------------ */
/* 纹理加工：降采样 + 边缘扩散                                          */
/* ------------------------------------------------------------------ */

/** 逐级折半降采样（等效 box filter，比一次性缩放更干净） */
function drawScaled(
  source: CanvasImageSource,
  srcSize: number,
  dstSize: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = dstSize;
  canvas.height = dstSize;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, srcSize, srcSize, 0, 0, dstSize, dstSize);
  }
  return canvas;
}

/**
 * 边缘色彩扩散（alpha bleed）：把 alpha=0 像素的 RGB 替换为邻近有色像素的均值。
 * 这是消除「白边 / 亮边」的关键 —— 纹理被线性过滤或旋转时，透明区不再混入白色。
 */
function bleedTransparentEdges(canvas: HTMLCanvasElement, passes = 3): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) return;

  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  let src = new Uint8ClampedArray(data);

  for (let p = 0; p < passes; p++) {
    const next = new Uint8ClampedArray(src);
    let changed = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (src[i + 3] !== 0) continue; // 只处理完全透明像素
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            const j = (ny * w + nx) * 4;
            if (src[j + 3] === 0) continue;
            r += src[j];
            g += src[j + 1];
            b += src[j + 2];
            n++;
          }
        }
        if (n > 0) {
          next[i] = r / n;
          next[i + 1] = g / n;
          next[i + 2] = b / n;
          changed = true;
        }
      }
    }
    if (!changed) break;
    src = next;
  }

  data.set(src);
  ctx.putImageData(image, 0, 0);
}

/** 已做边缘扩散的 tile 缓存：key = `${type}@${bleedSize}` */
const bleedCache = new Map<string, HTMLCanvasElement>();

/** 取得「已扩散边缘」的 tile（按需生成，尺寸 128 或 256） */
function getBledTile(img: HTMLImageElement, type: TokenType, size: number): HTMLCanvasElement | null {
  const idx = FRAME_INDEX[type];
  if (idx === undefined) return null;
  const bleedSize = size > 128 ? TILE_SIZE : 128;
  const key = `${type}@${bleedSize}`;
  const cached = bleedCache.get(key);
  if (cached) return cached;

  const r = Math.floor(idx / SPRITE_COLS);
  const c = idx % SPRITE_COLS;
  const tile = document.createElement('canvas');
  tile.width = TILE_SIZE;
  tile.height = TILE_SIZE;
  const ctx = tile.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    img,
    c * TILE_SIZE,
    r * TILE_SIZE,
    TILE_SIZE,
    TILE_SIZE,
    0,
    0,
    TILE_SIZE,
    TILE_SIZE
  );
  const out = bleedSize === TILE_SIZE ? tile : drawScaled(tile, TILE_SIZE, bleedSize);
  bleedTransparentEdges(out);
  bleedCache.set(key, tile);
  return tile;
}

/** 已生成的目标尺寸纹理缓存：key = `${type}@${size}` */
const sizedCache = new Map<string, HTMLCanvasElement>();

/** 取得指定尺寸的 tile（高质量降采样 + 边缘已扩散） */
function getSizedTile(img: HTMLImageElement, type: TokenType, size: number): HTMLCanvasElement | null {
  const key = `${type}@${size}`;
  const cached = sizedCache.get(key);
  if (cached) return cached;

  const bled = getBledTile(img, type, size);
  if (!bled) return null;

  let cur: CanvasImageSource = bled;
  let curSize = bled.width;
  while (curSize > size * 2) {
    const nextSize = Math.max(size, Math.round(curSize / 2));
    cur = drawScaled(cur, curSize, nextSize);
    curSize = nextSize;
  }
  const out = curSize === size ? (cur as HTMLCanvasElement) : drawScaled(cur, curSize, size);

  // 缓存上限保护（旋转 / 反复 resize 时不无限增长）
  if (sizedCache.size > 64) sizedCache.clear();
  sizedCache.set(key, out);
  return out;
}

/* ------------------------------------------------------------------ */
/* 纹理注册                                                            */
/* ------------------------------------------------------------------ */

/** 透明占位纹理（素材未就绪 / 生成失败时兜底，绝不出现白格） */
export function ensurePlaceholder(scene: Phaser.Scene): string {
  if (!scene.textures.exists(PLACEHOLDER_KEY)) {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    scene.textures.addCanvas(PLACEHOLDER_KEY, canvas);
  }
  return PLACEHOLDER_KEY;
}

/**
 * 确保「指定品牌 + 指定尺寸（设备像素）」的纹理已注册，返回纹理 key。
 * 素材未就绪时返回透明占位纹理 key（后续素材加载完成会重建视图）。
 */
export function ensureTokenTexture(scene: Phaser.Scene, type: TokenType, size: number): string {
  const key = tokenTextureKey(type, size);
  if (scene.textures.exists(key)) return key;
  const img = spriteImage();
  if (!img) return ensurePlaceholder(scene);
  const canvas = getSizedTile(img, type, size);
  if (!canvas) return ensurePlaceholder(scene);
  scene.textures.addCanvas(key, canvas);
  return key;
}

/** 确保雪碧图已加载并注册到指定场景的纹理管理器。 */
export function ensureSpriteReady(scene: Phaser.Scene): Promise<void> {
  return loadTileImage().then((img) => {
    // 场景可能已被销毁（StrictMode 双挂载），此时跳过注册
    try {
      const game = (scene.sys as { game?: Phaser.Game | null } | null)?.game;
      if (!game) return;
      if (scene.textures.exists(SPRITE_KEY)) {
        scene.textures.get(SPRITE_KEY).setDataSource(img);
      } else {
        scene.textures.addImage(SPRITE_KEY, img);
      }
    } catch (e) {
      // 场景已销毁等场景，静默跳过（活跃实例会自行注册）
    }
  });
}

/**
 * 启动雪碧图加载（幂等）。加载完成后回调 onReady（失败也会回调，避免 loading 卡死）。
 */
export function loadSpriteSheet(scene: Phaser.Scene, onReady?: () => void): void {
  if (scene.textures.exists(SPRITE_KEY) && scene.textures.get(SPRITE_KEY).getSourceImage()?.width) {
    onReady?.();
    return;
  }
  ensureSpriteReady(scene)
    .then(() => onReady?.())
    .catch((e) => {
      console.error('[LuxeFlux] sprite sheet error:', e);
      onReady?.();
    });
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
