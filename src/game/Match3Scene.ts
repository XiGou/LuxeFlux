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
  registerTokenTextures,
  registerSparkTexture,
  tokenTextureKey
} from './textures';

export interface Match3SceneConfig {
  rows?: number;
  cols?: number;
  onSwap: (from: number, to: number) => void;
  onTap: (index: number) => void;
}

/** 场景配置持有者：GameBoardBridge 在创建 Phaser.Game 前写入 */
export const SCENE_CONFIG: { current: Match3SceneConfig | null } = { current: null };

/** 每个方块的运行期展示对象 */
interface TokenView {
  cell: Cell;
  sprite: Phaser.GameObjects.Image;
  /** 限量版 / 爆破 / 炸弹的金色描边容器 */
  frame?: Phaser.GameObjects.Graphics;
}

/** 场景可交互开关（组件卸载时关闭） */
export const INTERACTIVE = { value: true } as { value: boolean };

export const SCENE_KEY = 'Match3Scene';

const CELL_RATIO = 0.86; // 方块相对格子占比
const SWAP_MS = 190; // 交换滑动时长
const FAIL_MS = 420; // 交换失败回弹总时长
const CLEAR_MS = 250; // 消除 pop 时长
const FALL_MS = 260; // 下落时长（单格）

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
  private backing!: Phaser.GameObjects.Graphics;
  private emitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  // 拖拽手势状态
  private dragFrom = -1;
  private dragImage: Phaser.GameObjects.Image | null = null;

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
    this.cellSize = 0;
    this.boardX = 0;
    this.boardY = 0;
    this.views.clear();
    this.images = [];
    this.board = [];
    this.dragFrom = -1;
    this.dragImage = null;

    const sparkKey = registerSparkTexture(this);

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
      blendMode: Phaser.BlendModes.ADD
    });

    INTERACTIVE.value = true;
    this.registerInput();

    this.scale.on('resize', this.handleResize, this);
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
            this.dragImage.setScale(1.08);
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
        this.resetDragVisual();
        this.dragFrom = -1;
        this.dragImage = null;

        if (validNeighbor) {
          this.onSwap(from, to);
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
        this.dragImage.setScale(1);
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

  private indexOfView(image: Phaser.GameObjects.Image): number {
    for (let i = 0; i < this.board.length; i++) {
      const cell = this.board[i];
      if (cell && this.views.get(cell.id)?.sprite === image) return i;
    }
    return -1;
  }

  private createSprite(cell: Cell, i: number): Phaser.GameObjects.Image {
    const key = tokenTextureKey(cell.type);
    if (!this.textures.exists(key)) {
      registerTokenTextures(this, [cell.type]);
    }
    const size = Math.floor(this.cellSize * CELL_RATIO * 1.6);
    const img = this.add
      .image(this.colCenter(i % this.cols), this.rowCenter(Math.floor(i / this.cols)), key)
      .setDisplaySize(size, size)
      .setDepth(0);
    this.images.push(img);
    return img;
  }

  /** 限量版 / 爆破 / 炸弹：叠加一层金色光晕描边 */
  private addLimitedFrame(view: TokenView): void {
    const size = view.sprite.displayWidth;
    const graphics = this.add.graphics();
    graphics.lineStyle(4, 0xd4af37, 0.85);
    graphics.strokeRoundedRect(-size / 2, -size / 2, size, size, 12);
    graphics.setPosition(view.sprite.x, view.sprite.y);
    graphics.setDepth(1);
    view.frame = graphics;
  }

  private destroyView(view: TokenView): void {
    view.sprite.destroy();
    if (view.frame) view.frame.destroy();
  }

  /** 全量同步棋盘（初始 / 道具 / 重开）。无动画，直接定位。 */
  syncBoard(board: Board): void {
    this.tweens.killAll();
    if (this.cellSize <= 0) this.computeMetrics();
    this.board = board;

    // 确保所有品牌纹理已注册
    const types = Array.from(new Set(board.filter((c): c is Cell => c !== null).map((c) => c.type)));
    registerTokenTextures(this, types);

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
        view.sprite.setScale(1);
        view.sprite.setDepth(0);
        if (view.frame) view.frame.setPosition(view.sprite.x, view.sprite.y);
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
    view.sprite.destroy();
    if (view.frame) view.frame.destroy();
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
        onComplete: () => this.setDepthByIndex(a.sprite, to)
      });
      this.tweens.add({
        targets: b.sprite,
        x: bTo.x,
        y: bTo.y,
        duration: SWAP_MS,
        ease: 'Cubic.easeInOut',
        onComplete: () => {
          this.setDepthByIndex(b.sprite, from);
          resolve();
        }
      });
    });
  }

  /** 交换失败：两格抖动回弹（不消耗步数） */
  playSwapFail(from: number, to: number): Promise<void> {
    return new Promise((resolve) => {
      const a = this.viewAt(from);
      const b = this.viewAt(to);
      const targets: Phaser.GameObjects.Image[] = [];
      if (a) targets.push(a.sprite);
      if (b) targets.push(b.sprite);
      if (targets.length === 0) return resolve();

      this.tweens.add({
        targets,
        x: (t: Phaser.GameObjects.Image) => {
          const i = this.indexOfView(t);
          return i >= 0 ? this.colCenter(i % this.cols) : this.colCenter(0);
        },
        duration: FAIL_MS,
        ease: 'Sine.easeInOut',
        repeat: 2,
        yoyo: true,
        onComplete: () => resolve()
      });
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

      for (const i of indices) {
        const view = this.viewAt(i);
        if (!view) continue;
        pending++;
        const sprite = view.sprite;
        this.emitBurst(sprite.x, sprite.y, cascade);
        this.tweens.add({
          targets: sprite,
          scale: 0.05,
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
        onComplete: () => resolve()
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
      this.tweens.add({
        targets,
        scale: 1.18,
        duration: 90,
        yoyo: true,
        ease: 'Sine.easeOut',
        onComplete: () => resolve()
      });
    });
  }

  private emitBurst(x: number, y: number, cascade: number): void {
    const count = 12 + Math.min(cascade, 4) * 6;
    this.emitter.explode(count, x, y);
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
    this.backing.fillStyle(0x17171a, 1);
    this.backing.fillRoundedRect(pad, pad, width - pad * 2, height - pad * 2, 18);
    this.backing.lineStyle(1.5, 0xd4af37, 0.18);
    this.backing.strokeRoundedRect(pad, pad, width - pad * 2, height - pad * 2, 18);
  }

  private handleResize = (): void => {
    this.computeMetrics();
    this.redrawBacking();
    for (const view of this.views.values()) {
      const i = this.indexOfView(view.sprite);
      if (i < 0) continue;
      const size = Math.floor(this.cellSize * CELL_RATIO * 1.6);
      view.sprite.setDisplaySize(size, size);
      view.sprite.setPosition(this.colCenter(i % this.cols), this.rowCenter(Math.floor(i / this.cols)));
      if (view.frame) view.frame.setPosition(view.sprite.x, view.sprite.y);
    }
  };

  /** 组件卸载时清理 */
  destroyAll(): void {
    this.tweens.killAll();
    this.views.clear();
    this.images = [];
    this.board = [];
    INTERACTIVE.value = false;
  }
}
