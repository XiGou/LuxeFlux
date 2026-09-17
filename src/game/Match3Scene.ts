/**
 * Match3Scene — Phaser 3 游戏场景（Canvas / WebGL 渲染核心）
 *
 * 职责：
 *  - 纯引擎渲染 8×8 棋盘与品牌方块（不再走 React DOM 重绘）
 *  - Tween 驱动的交换滑动、失败回弹、消除 pop、重力下落弹性
 *  - 粒子系统（消除闪光爆破，连消段位越高爆得越猛）
 *  - 指针手势：拖拽滑动交换（跟手）+ 点按
 *  - 对外只暴露命令式 API（syncBoard / playSwap / playClear / playFall ...），
 *    React 侧仅负责逻辑状态机（计分 / 连消 / 道具），渲染彻底解耦。
 */
import Phaser from 'phaser';
import type { Board, Cell } from '../types/game';
import { ROWS, COLS } from '../utils/gameLogic';
import {
  ensureTokenTexture,
  registerSparkTexture,
  registerLimitedTextures,
  LIMIT_HALO_KEY,
  LIMIT_GLOSS_KEY,
  LIMIT_SWEEP_KEY,
  LIMIT_TWINKLE_KEY,
  LIMIT_SHAFT_KEY,
  registerCoinTexture,
  registerBillTexture,
  loadTiles,
  COIN_KEY,
  BILL_KEY,
  TILE_SIZE,
  SPRITE_ORDER
} from './textures';

export interface Match3SceneConfig {
  rows?: number;
  cols?: number;
  onSwap: (from: number, to: number) => void;
  onTap: (index: number) => void;
}

/** 限量版标记色（金色，与 UI 强调色一致） */
// 限量版「深金」：奶白底上浅金（0xffd977）会泛白糊掉，改用高饱和深金
const LIMITED_GOLD = 0xd9a72c;

/** 场景配置持有者：GameBoardBridge 在创建 Phaser.Game 前写入 */
export const SCENE_CONFIG: { current: Match3SceneConfig | null } = { current: null };

/** 场景就绪回调（引擎 + 品牌素材就绪后触发，用于关闭 loading） */
export const SCENE_READY: { callbacks: Set<() => void>; done: boolean } = {
  callbacks: new Set(),
  done: false
};

/**
 * 每个方块的运行期展示对象。
 *
 * 限量版方块 = 一组「同一容器内的多层显示对象」，而不是往场景里撒一堆散件：
 * 这样交换 / 下落 / 消除时只需同步容器坐标，装饰天然跟随，
 * 也不会在下落过程中出现「光晕还在原地」的错位。
 *
 * 层级（container 内 depth）：
 *   -10  halo     柔性径向光晕（ADD）
 *    -6  shaft    柱状光柱（ADD，从卡面向上打的射灯）
 *     2  swept    贯穿卡面的斜向流光（ADD，切在同一容器的 mask 内）
 *     1  sprite   卡面贴图
 *     6  gloss    玻璃高光切面（ADD）
 *     7  frame    金环（Graphics）
 */
interface TokenView {
  cell: Cell;
  sprite: Phaser.GameObjects.Image;
  /** 限量版 / 爆破 / 炸弹的金色描边容器 */
  frame?: Phaser.GameObjects.Graphics;
  /** 限量版专属：柔性光晕 + 光柱 + 玻璃高光 + 流动流光 的容器 */
  fx?: Phaser.GameObjects.Container;
  /** 限量版专属：柔和径向光晕（呼吸 + 缓慢旋转） */
  halo?: Phaser.GameObjects.Image;
  /** 限量版专属：柱状射灯光柱 */
  shaft?: Phaser.GameObjects.Image;
  /** 限量版专属：斜向流光带（持续扫过卡面） */
  sweep?: Phaser.GameObjects.Image;
  /** 限量版专属：玻璃高光切面 */
  gloss?: Phaser.GameObjects.Image;
  /** 限量版专属：持续闪星 emitter（四芒星，限量版方块周围不断闪烁） */
  twinkle?: Phaser.GameObjects.Particles.ParticleEmitter;
  /** 限量版专属：呼吸脉冲 Tween（光晕 / 金环 / 高光同步） */
  pulse?: Phaser.Tweens.Tween;
  /** 限量版专属：持续循环的装饰 Tween（自转 / 呼吸 / 流光扫动 / 星芒） */
  twinkles?: Phaser.Tweens.Tween[];
}

/** 场景可交互开关（组件卸载时关闭） */
export const INTERACTIVE = { value: true } as { value: boolean };

export const SCENE_KEY = 'Match3Scene';

const CELL_RATIO = 0.9; // 实心方块 tile 相对格子占比（雪碧图 tile 本身即完整方块，占格子 90%，留出间隙）
const SWAP_MS = 190; // 交换滑动时长
const CLEAR_MS = 250; // 消除 pop 时长
const FALL_MS = 260; // 下落时长（单格）
const MAX_FLY_MONEY = 12; // 单次消除最多几格「飞钱进账」（性能上限）

export default class Match3Scene extends Phaser.Scene {
  private rows = ROWS;
  private cols = COLS;
  private onSwap!: (from: number, to: number) => void;
  private onTap!: (index: number) => void;

  private views = new Map<string, TokenView>();
  private images: Phaser.GameObjects.Image[] = [];
  private board: Board = [];
  private cellSize = 0;
  private boardX = 0;
  private boardY = 0;
  /** 当前纹理尺寸（设备像素）：与 tile 实际显示尺寸一致，保证 1:1 采样不模糊 */
  private textureSize = 128;
  private backing!: Phaser.GameObjects.Graphics;
  private emitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** 金币粒子（消除时向上喷） */
  private coinEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** 美金大钞粒子（飘落感，连消越高越多） */
  private billEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** 拖拽「撒钱」拖尾粒子 */
  private trailEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** 限量版「金字招牌」：沿高亮方块边框缓慢流动的金色光点（每帧重绘） */
  private limelight!: Phaser.GameObjects.Graphics;
  /** 上次拖尾发射时间（节流） */
  private trailAt = 0;

  // 拖拽手势状态
  private dragFrom = -1;
  private dragImage: Phaser.GameObjects.Image | null = null;
  /** 各精灵的基准缩放（由 createSprite 的 setDisplaySize 决定），缩放动画需在此之上叠加 */
  private baseScales = new Map<Phaser.GameObjects.Image, number>();

  constructor() {
    super(SCENE_KEY);
  }

  init(): void {
    const cfg = SCENE_CONFIG.current;
    this.rows = cfg?.rows ?? ROWS;
    this.cols = cfg?.cols ?? COLS;
    this.onSwap = cfg?.onSwap ?? (() => {});
    this.onTap = cfg?.onTap ?? (() => {});
  }

  create(): void {
    // 场景（重）创建：重置就绪状态（回调由等待方注册，不能在此清空）
    SCENE_READY.done = false;
    this.cellSize = 0;
    this.boardX = 0;
    this.boardY = 0;
    this.views.clear();
    this.images = [];
    this.board = [];
    this.dragFrom = -1;
    this.dragImage = null;
    this.baseScales.clear();
    this.trailAt = 0;

    const sparkKey = registerSparkTexture(this);
    // 限量版强化高亮：光晕 / 玻璃高光 / 流光带 / 星芒 四套引擎素材
    registerLimitedTextures(this);

    // 计算格子尺寸（决定贴图倍率），再按当前盘面用到的品牌加载独立贴图
    if (this.cellSize <= 0) this.computeMetrics();
    const usedTypes = Array.from(
      new Set((this.board.length ? this.board : []).filter(Boolean).map((c) => c!.type))
    );
    // 棋盘尚未同步时先预载全部品牌（保证 SCENE_READY 时素材已就绪）
    const types = usedTypes.length ? usedTypes : SPRITE_ORDER;
    loadTiles(this, types, this.textureSize, () => {
      if (this.board.length > 0) {
        // 贴图刚就绪：旧 sprite 可能用了占位纹理，强制重建所有视图
        for (const view of Array.from(this.views.values())) this.destroyView(view);
        this.views.clear();
        this.images = [];
        this.syncBoard(this.board);
      }
      this.markReady();
    });

    // 金属底盘（圆角矩形）
    this.backing = this.add.graphics();
    this.redrawBacking();

    // 粒子发射器：复用同一个，消除时 explode
    this.emitter = this.add.particles(0, 0, sparkKey, {
      speed: { min: 60, max: 190 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 280, max: 540 },
      gravityY: 240,
      emitting: false,
      // 浅色奶白底：ADD 混合会让金色粒子泛白糊掉，改用 NORMAL 保持「金币爆破」的实体感
      blendMode: Phaser.BlendModes.NORMAL
    });

    // 消费主义素材：金币 / 美金大钞
    const coinKey = registerCoinTexture(this);
    const billKey = registerBillTexture(this);

    // 金币：消除时向上喷（钱「炸」出来）
    this.coinEmitter = this.add
      .particles(0, 0, coinKey, {
        speed: { min: 100, max: 230 },
        angle: { min: 205, max: 335 },
        scale: { start: 0.85, end: 0.08 },
        alpha: { start: 1, end: 0 },
        rotate: { start: 0, end: 360 },
        lifespan: { min: 420, max: 780 },
        gravityY: 330,
        emitting: false
      })
      .setDepth(20);

    // 大钞：飘得慢、转得少，像钞票在空中翻飞
    this.billEmitter = this.add
      .particles(0, 0, billKey, {
        speed: { min: 70, max: 180 },
        angle: { min: 235, max: 305 },
        scale: { start: 1, end: 0.22 },
        alpha: { start: 1, end: 0 },
        rotate: { start: -40, end: 40 },
        lifespan: { min: 620, max: 1050 },
        gravityY: 70,
        emitting: false
      })
      .setDepth(20);

    // 拖拽拖尾：跟着手指一路撒钱
    this.trailEmitter = this.add
      .particles(0, 0, coinKey, {
        speed: { min: 12, max: 60 },
        angle: { min: 235, max: 305 },
        scale: { start: 0.55, end: 0.05 },
        alpha: { start: 0.95, end: 0 },
        rotate: { start: 0, end: 240 },
        lifespan: { min: 260, max: 460 },
        gravityY: 170,
        emitting: false
      })
      .setDepth(20);

    // 限量版金字招牌：金色光点沿高亮方块边框流动（below 卡面，作为环境光）
    this.limelight = this.add.graphics().setDepth(-2).setBlendMode(Phaser.BlendModes.NORMAL);

    INTERACTIVE.value = true;
    this.registerInput();


    this.scale.on('resize', this.handleResize, this);
  }

  /**
   * 每帧：绘制「金字招牌」——金色光点沿每个限量版方块的金环流动。
   *
   * 用 Graphics 每帧重绘（只画少量描边点），成本极低，但视觉上是
   * 「一圈流动的金光在牌子上打转」，这是纯 DOM 动画很难做自然的引擎级效果。
   */
  update(): void {
    const g = this.limelight;
    if (!g) return;
    g.clear();
    if (this.views.size === 0) return;
    const t = this.time.now / 1000;
    for (const view of this.views.values()) {
      if (!view.cell.limited || !view.sprite.active) continue;
      const size = view.sprite.displayWidth;
      const half = size / 2;
      const cx = view.sprite.x;
      const cy = view.sprite.y;
      // 4 颗光点绕行，相位错开 → 看起来是一串流光沿着边框跑
      for (let k = 0; k < 4; k++) {
        const a = ((t * 0.85 + k / 4) % 1) * Math.PI * 2;
        const px = cx + Math.cos(a) * half * 1.18;
        const py = cy + Math.sin(a) * half * 1.18;
        // 光点亮度自身也有呼吸，跑起来更「闪」
        const tw = 0.55 + 0.45 * Math.sin(t * 6 + k * 1.7);
        g.fillStyle(0xfff0be, 0.85 * tw);
        g.fillCircle(px, py, size * 0.075);
        g.fillStyle(0xd9a72c, 0.5 * tw);
        g.fillCircle(px, py, size * 0.15);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* 输入（拖拽滑动交换 + 点按）                                          */
  /* ------------------------------------------------------------------ */

  private registerInput(): void {
    this.input.on(
      'pointerdown',
      (pointer: Phaser.Input.Pointer) => {
        if (!INTERACTIVE.value) return;
        const i = this.indexAt(pointer.x, pointer.y);
        if (i < 0) return;
        this.dragFrom = i;
        const view = this.viewAt(i);
        this.dragImage = view ? view.sprite : null;
        // 按下即反馈：起点格放大 + 置顶 + 抓出一把钱
        if (view) {
          view.sprite.setScale(this.baseScale(view.sprite) * 1.1);
          view.sprite.setDepth(10);
          this.trailEmitter.explode(2, pointer.x, pointer.y);
        }
      },
      this
    );

    this.input.on(
      'pointermove',
      (pointer: Phaser.Input.Pointer) => {
        if (!INTERACTIVE.value || this.dragFrom < 0) return;
        const from = this.dragFrom;
        const threshold = this.cellSize * 0.4;

        // 拖拽跟手：让起点格精灵轻微跟随手指（略带放大，手感更“抓得住”）
        if (this.dragImage) {
          const baseX = this.colCenter(from % this.cols);
          const baseY = this.rowCenter(Math.floor(from / this.cols));
          const dx = Phaser.Math.Clamp(pointer.x - baseX, -this.cellSize * 0.45, this.cellSize * 0.45);
          const dy = Phaser.Math.Clamp(pointer.y - baseY, -this.cellSize * 0.45, this.cellSize * 0.45);
          if (Math.abs(dx) >= threshold || Math.abs(dy) >= threshold) {
            this.dragImage.setPosition(baseX + dx, baseY + dy);
            this.dragImage.setDepth(10);
            this.dragImage.setScale(this.baseScale(this.dragImage) * 1.12);
            // 顺着拖动方向倾斜：像「拖着一件商品走」，手感更黏手
            this.dragImage.setAngle(Phaser.Math.Clamp(dx * 0.07, -14, 14));
            // 拖尾撒钱（节流：约 25fps，避免粒子刷屏）
            const now = this.time.now;
            if (now - this.trailAt > 40) {
              this.trailAt = now;
              this.trailEmitter.explode(1, pointer.x, pointer.y);
            }
          }
        }

        const fromCenter = this.centerOf(from);
        const dx = pointer.x - fromCenter.x;
        const dy = pointer.y - fromCenter.y;
        if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

        let to = -1;
        if (Math.abs(dx) > Math.abs(dy)) {
          to = dx > 0 ? from + 1 : from - 1;
        } else {
          to = dy > 0 ? from + this.cols : from - this.cols;
        }
        const r = Math.floor(to / this.cols);
        const c = to % this.cols;
        const fromR = Math.floor(from / this.cols);
        const fromC = from % this.cols;
        const validNeighbor =
          to >= 0 &&
          to < this.rows * this.cols &&
          Math.abs(r - fromR) + Math.abs(c - fromC) === 1;

        // 无论是否有效交换，都结束本次拖拽（避免被误判为点按）
        const dragged = this.dragImage;
        this.resetDragVisual();
        this.dragFrom = -1;
        this.dragImage = null;

        if (validNeighbor) {
          this.onSwap(from, to);
        } else if (dragged) {
          // 拖到非法位置（非相邻格）：原地抖动提示“不能换”
          this.playDeniedShake(dragged);
        }
      },
      this
    );

    this.input.on(
      'pointerup',
      (pointer: Phaser.Input.Pointer) => {
        if (!INTERACTIVE.value) return;
        // 没有发生拖拽（dragFrom 未被移动判定清空）→ 视为点按
        const tapped = this.dragFrom >= 0;
        const i = this.indexAt(pointer.x, pointer.y);
        this.resetDragVisual();
        this.dragFrom = -1;
        this.dragImage = null;
        if (tapped && i >= 0) {
          this.onTap(i);
        }
      },
      this
    );
  }

  private resetDragVisual(): void {
    if (this.dragImage) {
      const i = this.indexOfView(this.dragImage);
      if (i >= 0) {
        this.dragImage.setPosition(this.colCenter(i % this.cols), this.rowCenter(Math.floor(i / this.cols)));
        this.dragImage.setScale(this.baseScale(this.dragImage));
        this.dragImage.setAngle(0);
        this.dragImage.setDepth(0);
      }
    }
    this.dragImage = null;
  }

  /* ------------------------------------------------------------------ */
  /* 坐标映射                                                            */
  /* ------------------------------------------------------------------ */

  private computeMetrics(): void {
    const { width, height } = this.scale;
    this.cellSize = Math.min(width / this.cols, height / this.rows);
    this.boardX = (width - this.cellSize * this.cols) / 2;
    this.boardY = (height - this.cellSize * this.rows) / 2;
    this.textureSize = this.idealTextureSize();
  }

  /**
   * 纹理目标尺寸（设备像素）：取略大于实际显示尺寸且为 8 的倍数，
   * 使采样比例接近 1:1（宁可轻微缩小，也不要放大导致糊）。
   */
  private idealTextureSize(): number {
    const display = Math.max(32, Math.ceil(this.cellSize * CELL_RATIO));
    return Phaser.Math.Clamp(Math.ceil(display / 8) * 8, 32, TILE_SIZE);
  }

  private colCenter(c: number): number {
    return this.boardX + this.cellSize * (c + 0.5);
  }

  private rowCenter(r: number): number {
    return this.boardY + this.cellSize * (r + 0.5);
  }

  private centerOf(i: number): { x: number; y: number } {
    return { x: this.colCenter(i % this.cols), y: this.rowCenter(Math.floor(i / this.cols)) };
  }

  private indexAt(x: number, y: number): number {
    if (this.cellSize <= 0) return -1;
    const c = Math.floor((x - this.boardX) / this.cellSize);
    const r = Math.floor((y - this.boardY) / this.cellSize);
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  /* ------------------------------------------------------------------ */
  /* 视图管理                                                            */
  /* ------------------------------------------------------------------ */

  private viewAt(i: number): TokenView | undefined {
    const cell = this.board[i];
    if (!cell) return undefined;
    return this.views.get(cell.id);
  }

  /** 获取精灵的基准缩放（未设置时回退到当前 scaleX） */
  private baseScale(img: Phaser.GameObjects.Image): number {
    return this.baseScales.get(img) ?? img.scaleX;
  }

  private indexOfView(image: Phaser.GameObjects.Image): number {
    for (let i = 0; i < this.board.length; i++) {
      const cell = this.board[i];
      if (cell && this.views.get(cell.id)?.sprite === image) return i;
    }
    return -1;
  }

  private createSprite(cell: Cell, i: number): Phaser.GameObjects.Image {
    // 按设备像素取纹理（自动选 1x/2x/3x 贴图）：采样接近 1:1，不再模糊 / 白边
    const key = ensureTokenTexture(this, cell.type, this.textureSize);
    const size = Math.floor(this.cellSize * CELL_RATIO);
    const img = this.add
      .image(this.colCenter(i % this.cols), this.rowCenter(Math.floor(i / this.cols)), key)
      .setDisplaySize(size, size)
      .setDepth(0);
    // 记录基准缩放：后续所有 setScale 均以此为基数（避免绝对值覆盖导致元素被放大）
    this.baseScales.set(img, img.scaleX);
    this.images.push(img);
    return img;
  }

  /**
   * 限量版标记 = 「把游戏引擎的光效全开一遍」。
   *
   * 与旧版（大矩形描边 + 一块方方正正的光晕）完全不同，这里是 7 层叠加：
   *
   *  1. frame    金环：外宽内窄三层圆角描边（暗色卡片上也有对比）
   *  2. halo     柔和径向光晕：ADD 混合 + 缓慢旋转 + 呼吸（真正的「在发光」）
   *  3. shaft    射灯光柱：从卡面向上的锥形光柱，像专柜顶灯打在作品上
   *  4. gloss    玻璃高光切面：左上棱边亮线 + 斜切面，卡片像装在玻璃柜里
   *  5. sweep    斜向流光带：窄而硬的高光带持续扫过卡面（镀金反光）
   *  6. twinkle  星芒粒子：四芒星在卡面周围不断爆闪
   *  7. limelight 金字招牌：金色光点沿方块边框流动（全局 Graphics 绘制）
   *
   * 所有光效挂在同一个 Container 内，随方块移动 / 缩放 / 旋转，
   * 交换、下落、消除全程不会出现「光效留在原地」的穿帮。
   * 非限量（仅爆破 / 炸弹）只保留金环，避免盘面过花。
   */
  private addLimitedFrame(view: TokenView): void {
    const cell = view.cell;
    const isLimited = !!cell.limited;
    const sprite = view.sprite;
    const size = sprite.displayWidth;
    const half = size / 2;
    // 卡面实际渲染圆角（贴图本身是圆角卡片，描边半径需与之贴合）
    const radius = Math.max(6, size * 0.19);

    const graphics = this.add.graphics();
    if (isLimited) {
      // 外发光：宽描边 + 低透明度，做出光晕扩散感（同时充当「暗色卡片」的对比底）
      graphics.lineStyle(Math.max(8, size * 0.11), LIMITED_GOLD, 0.16);
      graphics.strokeRoundedRect(-half - size * 0.05, -half - size * 0.05, size * 1.1, size * 1.1, radius + size * 0.05);
      graphics.lineStyle(Math.max(5, size * 0.07), LIMITED_GOLD, 0.34);
      graphics.strokeRoundedRect(-half - size * 0.025, -half - size * 0.025, size * 1.05, size * 1.05, radius + size * 0.03);
      // 主金环：足够粗，缩到 40px 也还看得见（深金才能在奶白底上「站住」）
      graphics.lineStyle(Math.max(2.5, size * 0.035), 0xd9a72c, 1);
      graphics.strokeRoundedRect(-half, -half, size, size, radius);
      // 内圈亮金细线：给金环一道「金属倒角」（白线在奶白底上会消失）
      graphics.lineStyle(Math.max(1, size * 0.013), 0xffe9a8, 0.95);
      graphics.strokeRoundedRect(-half + size * 0.04, -half + size * 0.04, size * 0.92, size * 0.92, radius * 0.82);
    } else {
      // 爆破 / 炸弹符号：细金边（低调，不与限量配货的「高光主角」抢视线）
      graphics.lineStyle(Math.max(1.6, size * 0.016), 0xb8860b, 0.85);
      graphics.strokeRoundedRect(-half, -half, size, size, radius);
    }
    view.frame = graphics;

    if (!isLimited) {
      // 普通方块（爆破 / 炸弹）：描边直接贴着精灵，无需容器
      graphics.setPosition(sprite.x, sprite.y);
      graphics.setDepth(1);
      return;
    }

    /* ---------- 限量版：多层光效都放进同一个容器 ---------- */

    // 光晕：卡面之外的柔和金色辉光（ADD 混合的径向柔光）。
    // 强度刻意压低：光晕只负责「卡片在发光」的氛围，绝不能把卡面图案糊掉。
    const halo = this.add
      .image(0, 0, LIMIT_HALO_KEY)
      .setDisplaySize(size * 1.85, size * 1.85)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(1)
      .setDepth(-10);
    view.halo = halo;

    // 射灯光柱：从卡面向上的锥形光（专柜顶灯打在作品上）
    const shaft = this.add
      .image(0, -size * 0.52, LIMIT_SHAFT_KEY)
      .setDisplaySize(size * 1.5, size * 1.9)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.48)
      .setDepth(-8);
    view.shaft = shaft;

    // 玻璃高光切面 + 斜向流光带：都用 Graphics 当遮罩，切在「卡面圆角矩形内」，
    // 保证光只出现在卡片上，绝不会溢出到相邻格子上（旧版拖影发糊的根因）。
    const maskShape = this.make.graphics({ x: 0, y: 0 }, false);
    maskShape.fillStyle(0xffffff, 1);
    maskShape.fillRoundedRect(-half, -half, size, size, radius);
    const cardMask = maskShape.createGeometryMask();

    // 玻璃棱边高光：只保留「上/左棱边细亮线 + 右下反光」，不覆盖卡面图案，
    // 目的是把方块衬得更立体（像装在专柜玻璃盒里），而不是盖一层白。
    const gloss = this.add
      .image(0, 0, LIMIT_GLOSS_KEY)
      .setDisplaySize(size, size)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.62)
      .setDepth(6);
    gloss.setMask(cardMask);
    view.gloss = gloss;

    // 流动光带：窄而亮的金色光带斜向扫过卡面（镀金表面的镜面反光）
    const sweep = this.add
      .image(0, 0, LIMIT_SWEEP_KEY)
      .setDisplaySize(size * 0.38, size * 1.7)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(1)
      .setDepth(3);
    sweep.setMask(cardMask);
    view.sweep = sweep;

    // 星芒粒子：贴着卡片上沿不断爆闪（ADD 混合的十字星）
    const twinkle = this.add
      .particles(0, 0, LIMIT_TWINKLE_KEY, {
        speed: { min: 6, max: 30 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.2, end: 0.02, ease: 'Quad.easeIn' },
        alpha: { start: 1, end: 0 },
        rotate: { min: -40, max: 40 },
        lifespan: { min: 460, max: 920 },
        frequency: 300,
        blendMode: Phaser.BlendModes.ADD,
        particleBringToTop: false
      })
      .setDepth(7);
    // 只在卡面「边圈」迸出（用 EdgeZone 沿方框边缘打星，卡面图案不受影响）
    twinkle.addEmitZone({
      type: 'edge',
      source: new Phaser.Geom.Rectangle(-half * 1.02, -half * 1.02, size * 1.02, size * 1.02),
      quantity: 1,
      total: 18
    });
    view.twinkle = twinkle;

    /* ---------- 动效编排 ---------- */

    // 呼吸心跳：金环 + 光晕 + 高光同步脉动，像「活着的」高亮
    view.pulse = this.tweens.add({
      targets: [graphics, gloss],
      scale: { from: 1, to: 1.05 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // 光晕：缓慢自转 + 呼吸（旋转让十字耀斑扫过，明暗不呆板）
    this.trackTween(
      view,
      this.tweens.add({
        targets: halo,
        angle: 360,
        duration: 7200,
        repeat: -1,
        ease: 'Linear'
      })
    );
    this.trackTween(
      view,
      this.tweens.add({
        targets: halo,
        alpha: { from: 0.62, to: 1 },
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      })
    );
    // 光柱轻微摇曳 + 明暗，像射灯有呼吸
    this.trackTween(
      view,
      this.tweens.add({
        targets: shaft,
        alpha: { from: 0.26, to: 0.46 },
        scaleX: { from: 0.92, to: 1.08 },
        duration: 1240,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      })
    );
    // 流光扫过：窄亮带从左上扫到右下，扫完停一拍再来（节奏感 > 常亮）
    this.trackTween(
      view,
      this.tweens.add({
        targets: sweep,
        x: { from: -size * 0.78, to: size * 0.78 },
        y: { from: -size * 0.78, to: size * 0.78 },
        duration: 700,
        repeat: -1,
        repeatDelay: 520,
        ease: 'Cubic.easeInOut',
        onRepeat: () => {
          // 每次重扫随机换一点角度，像不同角度的反光
          sweep.setAngle(Phaser.Math.Between(12, 30));
        }
      })
    );

    // 全部装饰放进容器，随方块一起移动 / 缩放
    const fx = this.add.container(sprite.x, sprite.y, [
      halo,
      shaft,
      sweep,
      gloss,
      graphics
    ]);
    fx.setDepth(1);
    view.fx = fx;

    // 容器内的 Graphics 不再需要世界坐标，位置归零
    graphics.setPosition(0, 0);
    this.refreshTwinklePlacement(view);
  }

  /** 星芒发射器跟随卡面尺寸（resize / 重建时调用） */
  private refreshTwinklePlacement(view: TokenView): void {
    const tw = view.twinkle;
    if (!tw) return;
    const size = view.sprite.displayWidth;
    const half = size / 2;
    const zone = tw.emitZones[0] as Phaser.GameObjects.Particles.Zones.EdgeZone | undefined;
    const src = zone?.source as Phaser.Geom.Rectangle | undefined;
    if (src) src.setTo(-half * 1.04, -half * 1.04, size * 1.04, size * 1.04);
    tw.setFrequency(300);
  }

  /** 登记 Tween 到 view，销毁方块时统一清理（避免 tween 泄漏） */
  private trackTween(view: TokenView, tween: Phaser.Tweens.Tween): void {
    if (!view.twinkles) view.twinkles = [];
    view.twinkles.push(tween);
  }

  private destroyView(view: TokenView): void {
    view.pulse?.remove();
    view.pulse = undefined;
    for (const t of view.twinkles ?? []) t.remove();
    view.twinkles = undefined;
    view.twinkle?.destroy();
    view.twinkle = undefined;
    view.sprite.destroy();
    if (view.fx) {
      view.fx.removeAll(true); // 连同容器内的光晕 / 光柱 / 流光 / 高光 / 金环
      view.fx.destroy();
    }
    view.frame?.destroy();
    view.frame = undefined;
    view.fx = undefined;
    view.halo = undefined;
    view.shaft = undefined;
    view.sweep = undefined;
    view.gloss = undefined;
  }

  /** 限量版装饰跟随精灵（交换 / 下落 / 抖动时需要同步） */
  private syncDecor(view: TokenView): void {
    const x = view.sprite.x;
    const y = view.sprite.y;
    if (view.fx) {
      view.fx.setPosition(x, y);
      // 跟随便携设备的「倾斜手感」：方块被拖动倾斜时，光效一起倾斜
      view.fx.setAngle(view.sprite.angle);
      view.fx.setScale(view.sprite.scaleX / this.baseScale(view.sprite));
      return;
    }
    view.frame?.setPosition(x, y);
  }

  /** 全量同步棋盘（初始 / 道具 / 重开）。无动画，直接定位。 */
  syncBoard(board: Board): void {
    this.tweens.killAll();
    if (this.cellSize <= 0) this.computeMetrics();
    this.board = board;

    const keep = new Set<string>();
    for (let i = 0; i < board.length; i++) {
      const cell = board[i];
      if (!cell) continue;
      keep.add(cell.id);
      let view = this.views.get(cell.id);
      if (!view) {
        view = { cell, sprite: this.createSprite(cell, i) };
        if (cell.limited || cell.bomb || cell.blast) this.addLimitedFrame(view);
        this.views.set(cell.id, view);
      } else if (
        view.cell.type !== cell.type ||
        view.cell.limited !== cell.limited ||
        view.cell.bomb !== cell.bomb ||
        view.cell.blast !== cell.blast
      ) {
        // 类型 / 标记变化（如 markup 升级限量版）→ 重建显示
        this.refreshView(view, cell, i);
      } else {
        view.cell = cell;
        view.sprite.setPosition(this.colCenter(i % this.cols), this.rowCenter(Math.floor(i / this.cols)));
        view.sprite.setScale(this.baseScale(view.sprite));
        view.sprite.setDepth(0);
        this.syncDecor(view);
      }
    }
    // 移除已消失的视图
    for (const [id, view] of Array.from(this.views.entries())) {
      if (!keep.has(id)) {
        this.destroyView(view);
        this.views.delete(id);
      }
    }
    this.images = this.images.filter((img) => img.active);
  }

  /** 类型 / 标记变化时重建一个方块的显示 */
  private refreshView(view: TokenView, cell: Cell, i: number): void {
    this.destroyView(view);
    this.views.delete(cell.id);
    const v = { cell, sprite: this.createSprite(cell, i) };
    if (cell.limited || cell.bomb || cell.blast) this.addLimitedFrame(v);
    this.views.set(cell.id, v);
  }

  /* ------------------------------------------------------------------ */
  /* 动画阶段命令（由 React 逻辑层在合适时机调用）                        */
  /* ------------------------------------------------------------------ */

  /** 交换成功：两格平滑滑动（期间同步内部棋盘为交换后状态） */
  playSwap(from: number, to: number): Promise<void> {
    return new Promise((resolve) => {
      const a = this.viewAt(from);
      const b = this.viewAt(to);
      if (!a || !b) return resolve();

      // 先更新内部棋盘映射：交换后 from 位置的 cell 应被 b 占据（视觉与逻辑对齐）
      const cellA = this.board[from];
      const cellB = this.board[to];
      if (cellA && cellB) {
        const next = this.board.slice();
        next[from] = cellB;
        next[to] = cellA;
        this.board = next;
      }

      const aTo = this.centerOf(to);
      const bTo = this.centerOf(from);
      this.tweens.add({
        targets: a.sprite,
        x: aTo.x,
        y: aTo.y,
        duration: SWAP_MS,
        ease: 'Cubic.easeInOut',
        onUpdate: () => this.syncDecor(a),
        onComplete: () => this.setDepthByIndex(a.sprite, to)
      });
      this.tweens.add({
        targets: b.sprite,
        x: bTo.x,
        y: bTo.y,
        duration: SWAP_MS,
        ease: 'Cubic.easeInOut',
        onUpdate: () => this.syncDecor(b),
        onComplete: () => {
          this.setDepthByIndex(b.sprite, from);
          resolve();
        }
      });
    });
  }

  /**
   * 交换失败（无匹配可消）：模拟交换滑动 → 抖动（拒绝提示）→ 滑回原位。
   * 不消耗步数，内部棋盘不变（视觉上交换后回弹），玩家能明确感知“这步换不成”。
   */
  playSwapFail(from: number, to: number): Promise<void> {
    return new Promise((resolve) => {
      const a = this.viewAt(from);
      const b = this.viewAt(to);
      if (!a || !b) return resolve();

      const aHome = {
        x: this.colCenter(from % this.cols),
        y: this.rowCenter(Math.floor(from / this.cols))
      };
      const bHome = {
        x: this.colCenter(to % this.cols),
        y: this.rowCenter(Math.floor(to / this.cols))
      };

      // 阶段 1：模拟交换滑动（视觉上“先换过去”）
      a.sprite.setDepth(10);
      b.sprite.setDepth(10);
      this.tweens.add({
        targets: a.sprite,
        x: bHome.x,
        y: bHome.y,
        duration: SWAP_MS,
        ease: 'Cubic.easeInOut',
        onUpdate: () => this.syncDecor(a)
      });
      this.tweens.add({
        targets: b.sprite,
        x: aHome.x,
        y: aHome.y,
        duration: SWAP_MS,
        ease: 'Cubic.easeInOut',
        onUpdate: () => this.syncDecor(b),
        onComplete: () => {
          // 阶段 2：在“交换后”的位置抖动，强化“被拒绝”的反馈
          this.tweens.add({
            targets: [a.sprite, b.sprite],
            x: (img: Phaser.GameObjects.Image) => {
              const anchor = img === a.sprite ? bHome : aHome;
              return anchor.x + Phaser.Math.Between(-7, 7);
            },
            y: (img: Phaser.GameObjects.Image) => {
              const anchor = img === a.sprite ? bHome : aHome;
              return anchor.y + Phaser.Math.Between(-5, 5);
            },
            duration: 36,
            repeat: 3,
            yoyo: true,
            ease: 'Sine.easeInOut',
            onComplete: () => {
              // 阶段 3：滑回原位 + 恢复层级
              this.tweens.add({
                targets: a.sprite,
                x: aHome.x,
                y: aHome.y,
                duration: SWAP_MS,
                ease: 'Cubic.easeInOut',
                onUpdate: () => this.syncDecor(a),
                onComplete: () => {
                  this.setDepthByIndex(a.sprite, from);
                  this.syncDecor(a);
                }
              });
              this.tweens.add({
                targets: b.sprite,
                x: bHome.x,
                y: bHome.y,
                duration: SWAP_MS,
                ease: 'Cubic.easeInOut',
                onUpdate: () => this.syncDecor(b),
                onComplete: () => {
                  this.setDepthByIndex(b.sprite, to);
                  this.syncDecor(b);
                  resolve();
                }
              });
            }
          });
        }
      });
    });
  }

  /** 拖到非法方向：原地轻微抖动提示（不可交换，非相邻格） */
  private playDeniedShake(img: Phaser.GameObjects.Image): void {
    const homeX = img.x;
    const homeY = img.y;
    this.tweens.add({
      targets: img,
      x: () => homeX + Phaser.Math.Between(-6, 6),
      y: () => homeY + Phaser.Math.Between(-4, 4),
      duration: 42,
      repeat: 3,
      yoyo: true,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        img.setPosition(homeX, homeY);
        img.setScale(this.baseScale(img));
        img.setDepth(0);
      }
    });
  }

  /** 消除：指定格子 pop 爆破 + 粒子闪光（连消段位越高越华丽） */
  playClear(indices: number[], cascade: number): Promise<void> {
    return new Promise((resolve) => {
      let pending = 0;
      let finished = false;
      const finish = () => {
        pending--;
        if (pending <= 0 && !finished) {
          finished = true;
          resolve();
        }
      };

      // 消除中心（用于连消冲击波）
      let cx = 0;
      let cy = 0;
      let cn = 0;

      for (const i of indices) {
        const view = this.viewAt(i);
        if (!view) continue;
        pending++;
        const sprite = view.sprite;
        this.emitBurst(sprite.x, sprite.y, cascade);
        // 满天飞钱有上限（大炸弹一次清几十格时按概率抽样，防止精灵数暴涨）
        if (cn < MAX_FLY_MONEY || Math.random() < MAX_FLY_MONEY / (cn + 1)) {
          this.flyMoney(sprite.x, sprite.y, cascade);
        }
        cx += sprite.x;
        cy += sprite.y;
        cn++;
        // 限量版：整个光效容器一起 pop（光晕 / 光柱 / 流光 / 高光 / 金环）
        // 非限量：仅金环；容器不存在时回退到 frame
        const extras = [view.fx, view.fx ? undefined : view.frame].filter(
          Boolean
        ) as Phaser.GameObjects.GameObject[];
        view.pulse?.remove();
        view.pulse = undefined;
        for (const t of view.twinkles ?? []) t.remove();
        view.twinkles = undefined;
        view.twinkle?.stop();
        this.tweens.add({
          targets: [sprite, ...extras],
          scale: () => 0.05,
          alpha: 0,
          angle: '+=' + Phaser.Math.Between(-90, 90),
          duration: CLEAR_MS,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            this.destroyView(view);
            this.views.delete(view.cell.id);
            this.board[i] = null;
            finish();
          }
        });
      }
      // 连消 ≥2：在消除中心补一记金色冲击波（买得越多，场面越夸张）
      if (cn > 0 && cascade >= 2) this.moneyRing(cx / cn, cy / cn, cascade);
      if (pending === 0) resolve();
    });
  }

  /** 重力下落：既有方块弹性下落到新位置，顶部新方块从上方落入 */
  playFall(board: Board): Promise<void> {
    this.board = board;

    // 既有视图保留下落；新 id 从顶部生成
    const existing = new Set<string>();
    for (let i = 0; i < board.length; i++) {
      const cell = board[i];
      if (!cell) continue;
      existing.add(cell.id);
      let view = this.views.get(cell.id);
      if (!view) {
        view = { cell, sprite: this.createSprite(cell, i) };
        if (cell.limited || cell.bomb || cell.blast) this.addLimitedFrame(view);
        this.views.set(cell.id, view);
        // 新方块：从棋盘上方落入
        view.sprite.setY(this.boardY - this.cellSize * 0.8);
        view.sprite.setAlpha(0);
      }
    }
    for (const [id, view] of Array.from(this.views.entries())) {
      if (!existing.has(id)) {
        this.destroyView(view);
        this.views.delete(id);
      }
    }
    this.images = this.images.filter((img) => img.active);

    return new Promise((resolve) => {
      const images = this.images.filter((img) => img.active);
      if (images.length === 0) return resolve();
      this.tweens.add({
        targets: images,
        y: (img: Phaser.GameObjects.Image) =>
          this.rowCenter(Math.floor(this.indexOfView(img) / this.cols)),
        alpha: 1,
        duration: FALL_MS,
        ease: 'Bounce.easeOut',
        onUpdate: () => {
          for (const view of this.views.values()) this.syncDecor(view);
        },
        onComplete: () => {
          for (const view of this.views.values()) this.syncDecor(view);
          resolve();
        }
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* 粒子系统                                                            */
  /* ------------------------------------------------------------------ */

  /** 绿色通道：高亮 3×3 范围（脉冲缩放），随后由 playClear 爆破 */
  pulseCells(indices: number[]): Promise<void> {
    return new Promise((resolve) => {
      const targets: Phaser.GameObjects.Image[] = [];
      for (const i of indices) {
        const view = this.viewAt(i);
        if (!view) continue;
        targets.push(view.sprite);
      }
      if (targets.length === 0) return resolve();
      // 目标格整体放大脉冲：限量版的光效容器（含金环 / 光晕 / 流光 / 高光）一并跟随
      const decor = indices
        .map((i) => this.viewAt(i))
        .filter(Boolean)
        .flatMap((v) =>
          (v!.fx ? [v!.fx] : [v!.frame].filter(Boolean)) as Phaser.GameObjects.GameObject[]
        );
      if (decor.length > 0) {
        this.tweens.add({ targets: decor, scale: 1.18, duration: 90, yoyo: true, ease: 'Sine.easeOut' });
      }
      this.tweens.add({
        targets,
        scale: (img: Phaser.GameObjects.Image) => this.baseScale(img) * 1.18,
        duration: 90,
        yoyo: true,
        ease: 'Sine.easeOut',
        onComplete: () => {
          for (const i of indices) {
            const v = this.viewAt(i);
            if (v) this.syncDecor(v);
          }
          resolve();
        }
      });
    });
  }

  private emitBurst(x: number, y: number, cascade: number): void {
    const level = Math.min(cascade, 5);
    // 闪光碎片（原有）
    this.emitter.explode(10 + level * 4, x, y);
    // 金币：每格必喷，连消越高喷越多
    this.coinEmitter.explode(2 + level, x, y);
    // 大钞：连消 ≥1 必出，普通消除 45% 概率来一张
    if (level >= 1 || Math.random() < 0.45) {
      this.billEmitter.explode(level >= 3 ? 2 : 1, x, y);
    }
  }

  /**
   * 金币 / 大钞「飞进账」：从消除格先弹出一下，再划弧线飞向顶栏 Prespend，
   * 边飞边缩小旋转消失 —— 把「消除 = 钱进你的消费额」这条因果画出来。
   */
  private flyMoney(x: number, y: number, cascade: number): void {
    const count = cascade >= 2 ? 2 : 1;
    const tx = this.scale.width * 0.86; // 顶栏 Prespend（右上）
    const ty = -this.cellSize * 0.6;

    for (let k = 0; k < count; k++) {
      const isBill = Math.random() < 0.4;
      const img = this.add.image(x, y, isBill ? BILL_KEY : COIN_KEY).setDepth(30);
      const w = this.cellSize * (isBill ? 0.62 : 0.42);
      img.setDisplaySize(w, isBill ? w * 0.5 : w);
      img.setAngle(Phaser.Math.Between(-25, 25));
      // 分别记住横纵基准缩放：钞票不是正方形，不能共用 scale
      const sx = img.scaleX;
      const sy = img.scaleY;

      const midX = x + Phaser.Math.Between(-this.cellSize * 0.9, this.cellSize * 0.9);
      const midY = y - this.cellSize * Phaser.Math.FloatBetween(0.6, 1.2);

      this.tweens.add({
        targets: img,
        x: midX,
        y: midY,
        scaleX: sx * 1.2,
        scaleY: sy * 1.2,
        duration: 190,
        delay: k * 60,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: img,
            x: tx,
            y: ty,
            scaleX: sx * 0.3,
            scaleY: sy * 0.3,
            alpha: 0,
            angle: img.angle + Phaser.Math.Between(-220, 220),
            duration: 480 + Phaser.Math.Between(0, 140),
            ease: 'Cubic.easeIn',
            onComplete: () => img.destroy()
          });
        }
      });
    }
  }

  /** 连消冲击波：金色圆环从消除中心扩散消失 */
  private moneyRing(x: number, y: number, cascade: number): void {
    const r0 = this.cellSize * 0.34;
    const r1 = this.cellSize * (1.1 + Math.min(cascade, 5) * 0.3);
    const g = this.add.graphics({ x, y }).setDepth(24);
    g.lineStyle(3, 0xb8860b, 0.95);
    g.strokeCircle(0, 0, r0);
    g.lineStyle(1.5, 0xe8c56a, 0.8);
    g.strokeCircle(0, 0, r0 * 0.72);
    this.tweens.add({
      targets: g,
      scale: r1 / r0,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => g.destroy()
    });
  }

  /* ------------------------------------------------------------------ */
  /* 工具 / 生命周期                                                      */
  /* ------------------------------------------------------------------ */

  private setDepthByIndex(sprite: Phaser.GameObjects.Image, i: number): void {
    sprite.setDepth(Math.floor(i / this.cols));
  }

  private redrawBacking(): void {
    if (!this.backing) return;
    this.backing.clear();
    const { width, height } = this.scale;
    const pad = 4;
    // 不透明底盘：tile 贴图是透明的，若底盘半透明（旧版靠父容器颜色）会让
    // 白色卡片（Chanel / Céline）看起来「发灰、洗掉」。这里补回奶白实底，
    // 与 UI 的 cream-panel 一致，浅色下托盘更干净通透。
    this.backing.fillStyle(0xfffdf8, 1);
    this.backing.fillRoundedRect(pad, pad, width - pad * 2, height - pad * 2, 18);
    this.backing.lineStyle(1.5, 0xb8860b, 0.55);
    this.backing.strokeRoundedRect(pad, pad, width - pad * 2, height - pad * 2, 18);
  }

  private handleResize = (): void => {
    const prevTextureSize = this.textureSize;
    this.computeMetrics();
    this.redrawBacking();
    for (const view of this.views.values()) {
      const i = this.indexOfView(view.sprite);
      if (i < 0) continue;
      const size = Math.floor(this.cellSize * CELL_RATIO);
      // 纹理尺寸随显示尺寸变化 → 换用新尺寸纹理，始终保持 1:1 采样
      if (this.textureSize !== prevTextureSize) {
        view.sprite.setTexture(ensureTokenTexture(this, view.cell.type, this.textureSize));
      }
      view.sprite.setDisplaySize(size, size);
      // 尺寸变化后基准缩放也随之变化，需同步记录
      this.baseScales.set(view.sprite, view.sprite.scaleX);
      view.sprite.setPosition(this.colCenter(i % this.cols), this.rowCenter(Math.floor(i / this.cols)));
      view.sprite.setAngle(0);
      this.syncDecor(view);
      if (view.halo) view.halo.setDisplaySize(size * 1.85, size * 1.85);
      if (view.shaft) view.shaft.setDisplaySize(size * 1.5, size * 1.9).setY(-size * 0.52);
      if (view.sweep) view.sweep.setDisplaySize(size * 0.42, size * 1.6);
      if (view.gloss) view.gloss.setDisplaySize(size, size);
      this.refreshTwinklePlacement(view);
    }
  };

  /** 标记场景就绪（引擎 + 素材），通知等待方关闭 loading */
  private markReady(): void {
    if (SCENE_READY.done) return;
    SCENE_READY.done = true;
    for (const cb of SCENE_READY.callbacks) cb();
    SCENE_READY.callbacks.clear();
  }

  /** 组件卸载时清理 */
  destroyAll(): void {
    this.tweens.killAll();
    for (const view of this.views.values()) {
      view.pulse = undefined;
      view.twinkles = undefined;
      view.frame = undefined;
      view.fx = undefined;
      view.halo = undefined;
      view.shaft = undefined;
      view.sweep = undefined;
      view.gloss = undefined;
      view.twinkle?.destroy();
      view.twinkle = undefined;
    }
    this.limelight?.destroy();
    this.limelight = undefined as unknown as Phaser.GameObjects.Graphics;
    // 停掉钱雨粒子：避免卸载瞬间残留粒子继续飞
    this.emitter?.stop(true);
    this.coinEmitter?.stop(true);
    this.billEmitter?.stop(true);
    this.trailEmitter?.stop(true);
    this.views.clear();
    this.images = [];
    this.board = [];
    INTERACTIVE.value = false;
    SCENE_READY.done = false;
  }
}
