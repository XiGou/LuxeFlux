/**
 * Phaser 引擎纹理生成（12 张独立 tile 贴图版）
 *
 * 素材已从「一张 768x1024 雪碧图」改为 **12 张独立 PNG**：
 *   public/tiles/<brand>@<scale>x.png（256 / 512 / 768px，透明背景，sRGB）
 * 每张图片由 scripts/generate-tile-textures.mjs 按旧的雪碧图单个元素 1:1 生成，
 * 内容与旧素材完全一致，但不再需要运行时切割雪碧图（棋盘与结算界面共用同一批图片）。
 *
 * ⚠️ 清晰度关键处理：
 *  1. **不缩放**：图片本身就按 1x / 2x / 3x 三档导出，直接取 ≥ 目标设备像素
 *     的那一档，Phaser 只需轻微缩小甚至 1:1 采样，杜绝「放大糊」。
 *  2. **边缘色彩扩散（alpha bleed）**：在生成阶段已把透明像素的 RGB 染成邻近色，
 *     运行时缩放 / 旋转不会再从透明区透出白色光晕（白边）。
 *  3. **透明占位纹理**：素材未就绪时用全透明占位，而不是 Phaser 内置的
 *     `__MISSING` 黑白棋盘格（否则会看到白方块）。
 *
 * 加载策略：按品牌懒加载（首次用到才请求），模块级缓存 HTMLImageElement，
 * 兼容 React StrictMode 双挂载与 Capacitor file:// 等复杂场景。
 */
import type { TokenType } from '../types/game';

/** 独立 tile 贴图目录（相对路径，兼容 Capacitor file:// WebView 与 H5 部署） */
export const TILES_DIR = 'tiles';

/** 独立贴图的原始尺寸（1x），2x/3x 为 512 / 768 */
export const TILE_SIZE = 256;

/** 支持的贴图倍率（生成脚本与运行时必须一致） */
export const TILE_SCALES = [1, 2, 3] as const;

/** 素材未就绪时的透明占位纹理 key（避免 Phaser __MISSING 棋盘格） */
export const PLACEHOLDER_KEY = 'token-placeholder';

/** 品牌顺序（与生成脚本一致，用于预热加载） */
export const SPRITE_ORDER: TokenType[] = [
  'gucci', 'celine', 'hermes',
  'ysl', 'prada', 'chanel',
  'louisvuitton', 'dior', 'fendi',
  'burberry', 'bvlgari', 'tiffany'
];

/** 品牌 → 独立贴图相对路径（品牌名即文件名，无需切图配置） */
export function tileUrl(type: TokenType, scale: number = 1): string {
  return `${TILES_DIR}/${type}@${scale}x.png`;
}

/** 纹理 key（size 为空时使用 256 原尺寸纹理） */
export function tokenTextureKey(type: TokenType, size?: number): string {
  return size ? `token-${type}@${size}` : `token-${type}`;
}

/** 模块级雪碧图加载缓存（全局唯一 Promise） */
/* ------------------------------------------------------------------ */
/* 独立 tile 图片加载                                                  */
/* ------------------------------------------------------------------ */

/** 每档倍率的加载 Promise（幂等，失败可重试） */
const imageLoads = new Map<string, Promise<HTMLImageElement>>();
/** 已就绪的图片（key = `${type}@${scale}`） */
const imageCache = new Map<string, HTMLImageElement>();

/** 取得「已就绪」的图片（未加载完成返回 null） */
export function loadedTileImage(type: TokenType, scale: number): HTMLImageElement | null {
  const img = imageCache.get(`${type}@${scale}`);
  return img && img.width > 0 ? img : null;
}

/** 加载指定品牌 + 倍率的贴图（模块级缓存，幂等） */
export function loadTileImage(type: TokenType, scale: number = 1): Promise<HTMLImageElement> {
  const key = `${type}@${scale}`;
  const cached = imageLoads.get(key);
  if (cached) return cached;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(key, img);
      resolve(img);
    };
    img.onerror = () => {
      imageLoads.delete(key); // 允许重试
      reject(new Error(`tile image load failed: ${tileUrl(type, scale)}`));
    };
    img.src = tileUrl(type, scale);
  });
  imageLoads.set(key, p);
  return p;
}

/**
 * 挑选贴图倍率：取「≥ 目标设备像素」的最小档，避免运行时放大导致糊边。
 * 例：目标 98 设备像素 → 2x（512 源图缩到 98，采样比例 5:1，清晰且省内存）。
 */
export function pickTileScale(targetDevicePx: number): number {
  for (const s of TILE_SCALES) {
    if (TILE_SIZE * s >= targetDevicePx) return s;
  }
  return TILE_SCALES[TILE_SCALES.length - 1];
}

/** 预热加载全部 12 个品牌（用于 loading 阶段 / 结算界面图标） */
export function preloadAllTiles(scale: number = 1): Promise<HTMLImageElement[]> {
  return Promise.all(SPRITE_ORDER.map((t) => loadTileImage(t, scale)));
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

/** 裁掉四周完全透明的边并放到正方形画布，使 tile 内容与格子等比居中 */
function normalizeTile(img: HTMLImageElement): CanvasImageSource {
  const size = img.width;
  if (!size) return img;
  const src = document.createElement('canvas');
  src.width = size;
  src.height = size;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  if (!sctx) return img;
  sctx.drawImage(img, 0, 0, size, size);

  const { data } = sctx.getImageData(0, 0, size, size);
  let minX = size, minY = size, maxX = -1, maxY = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[(y * size + x) * 4 + 3] <= 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return img;

  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const octx = out.getContext('2d');
  if (!octx) return img;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(
    src,
    minX,
    minY,
    maxX - minX + 1,
    maxY - minY + 1,
    0,
    0,
    size,
    size
  );
  return out;
}

/**
 * 确保「指定品牌 + 指定尺寸（设备像素）」的纹理已注册，返回纹理 key。
 * 自动挑选倍率；素材未就绪时返回透明占位纹理 key（后续素材加载完成会重建视图）。
 */
export function ensureTokenTexture(scene: Phaser.Scene, type: TokenType, size: number): string {
  const scale = pickTileScale(size);
  const key = tokenTextureKey(type, size);
  if (scene.textures.exists(key)) return key;
  const img = loadedTileImage(type, scale);
  if (!img) {
    void loadTileImage(type, scale).catch(() => {});
    return ensurePlaceholder(scene);
  }
  scene.textures.addCanvas(key, normalizeTile(img) as HTMLCanvasElement);
  return key;
}

/**
 * 启动 tile 素材加载（幂等）。加载完成后回调 onReady（失败也会回调，避免 loading 卡死）。
 *
 * @param types 需要加载的品牌（默认仅当前局用到的品牌；预热可传全部）
 * @param size  目标设备像素（决定加载哪一档倍率）
 */
export function loadTiles(
  scene: Phaser.Scene,
  types: TokenType[],
  size: number,
  onReady?: () => void
): void {
  // scene 仅用于保持与其它纹理 API 一致的调用签名（加载不依赖场景）
  void scene;
  const scale = pickTileScale(size);
  Promise.all(types.map((t) => loadTileImage(t, scale)))
    .then(() => onReady?.())
    .catch((e) => {
      console.error('[LuxeFlux] tile images error:', e);
      onReady?.();
    });
}


/* ------------------------------------------------------------------ */
/* 限量版（限量配货）强化高亮素材                                       */
/* ------------------------------------------------------------------ */

/** 限量版底光纹理 key */
export const LIMIT_GLOW_KEY = 'limited-glow';
/** 限量版斜向流光纹理 key */
export const LIMIT_SHINE_KEY = 'limited-shine';

/** 金色径向光晕（限量版底光，加色混合后自带「打光」感） */
export function registerLimitedGlowTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(LIMIT_GLOW_KEY)) return LIMIT_GLOW_KEY;
  const S = 128;
  const c = S / 2;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, 'rgba(255,236,170,0.95)');
  grad.addColorStop(0.34, 'rgba(255,208,110,0.62)');
  grad.addColorStop(0.68, 'rgba(212,175,55,0.26)');
  grad.addColorStop(1, 'rgba(212,175,55,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();
  scene.textures.addCanvas(LIMIT_GLOW_KEY, canvas);
  return LIMIT_GLOW_KEY;
}

/** 斜向流光条（中间亮、两端透明，划过卡面时像镀金反光） */
export function registerLimitedShineTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(LIMIT_SHINE_KEY)) return LIMIT_SHINE_KEY;
  const W = 48;
  const H = 192;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,248,214,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  // 上下两端淡出，避免出现生硬的矩形边
  const vgrad = ctx.createLinearGradient(0, 0, 0, H);
  vgrad.addColorStop(0, 'rgba(0,0,0,1)');
  vgrad.addColorStop(0.18, 'rgba(0,0,0,0)');
  vgrad.addColorStop(0.82, 'rgba(0,0,0,0)');
  vgrad.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = vgrad;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = grad;
  ctx.fillRect(W * 0.28, H * 0.18, W * 0.44, H * 0.64);
  scene.textures.addCanvas(LIMIT_SHINE_KEY, canvas);
  return LIMIT_SHINE_KEY;
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

/* ------------------------------------------------------------------ */
/* 消费主义素材：金币 / 美金大钞                                        */
/* ------------------------------------------------------------------ */

/** 金币纹理 key */
export const COIN_KEY = 'money-coin';
/** 美金钞票纹理 key */
export const BILL_KEY = 'money-bill';

/** 圆角矩形路径（不依赖 ctx.roundRect，兼容旧 WebView） */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/** 金币：金属渐变圆盘 + 内圈 + `$`（消除 / 拖拽时撒出的钱） */
export function registerCoinTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(COIN_KEY)) return COIN_KEY;
  const S = 64;
  const c = S / 2;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;

  // 盘面：偏心金属渐变（左上高光 → 右下暗金）
  const grad = ctx.createRadialGradient(c * 0.72, c * 0.66, 2, c, c, c);
  grad.addColorStop(0, '#fff8d8');
  grad.addColorStop(0.4, '#f5df9b');
  grad.addColorStop(0.78, '#d4af37');
  grad.addColorStop(1, '#9c7415');
  ctx.beginPath();
  ctx.arc(c, c, c - 1, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // 外缘高光 + 内圈刻线
  ctx.beginPath();
  ctx.arc(c, c, c - 4.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c, c, c - 10, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(122,92,16,0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 币面 `$`
  ctx.font = 'bold 34px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(90,66,8,0.95)';
  ctx.fillText('$', c, c + 1);

  scene.textures.addCanvas(COIN_KEY, canvas);
  return COIN_KEY;
}

/** 美金大钞：绿色票面 + 中央椭圆 + `$100` */
export function registerBillTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(BILL_KEY)) return BILL_KEY;
  const W = 96;
  const H = 48;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // 票面底
  roundRectPath(ctx, 0.5, 0.5, W - 1, H - 1, 6);
  ctx.fillStyle = '#5f7a45';
  ctx.fill();
  // 内框（浅绿）
  roundRectPath(ctx, 4, 4, W - 8, H - 8, 4);
  ctx.fillStyle = '#c6d6aa';
  ctx.fill();
  // 内框细线
  roundRectPath(ctx, 6.5, 6.5, W - 13, H - 13, 3);
  ctx.strokeStyle = 'rgba(61,86,40,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 中央椭圆 + `$`
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2, 17, 12, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(61,86,40,0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = 'bold 19px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#3d5628';
  ctx.fillText('$', W / 2, H / 2 + 1);

  // 四角 100
  ctx.font = 'bold 9px Arial, Helvetica, sans-serif';
  ctx.fillStyle = 'rgba(61,86,40,0.85)';
  ctx.fillText('100', 13, 13);
  ctx.fillText('100', W - 13, 13);
  ctx.fillText('100', 13, H - 10);
  ctx.fillText('100', W - 13, H - 10);

  scene.textures.addCanvas(BILL_KEY, canvas);
  return BILL_KEY;
}
