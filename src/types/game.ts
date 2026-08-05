/**
 * Luxe Flux — 核心游戏类型定义
 * Game board cells, tokens, power-ups and global state.
 */

/** 奢侈品品牌 Logo 方块（本局从素材池随机抽取，见 utils/brands.ts） */
export type TokenType =
  | 'chanel'
  | 'hermes'
  | 'louisvuitton'
  | 'gucci'
  | 'dior'
  | 'prada'
  | 'celine'
  | 'ysl'
  | 'bottega'
  | 'burberry';

/** 棋盘上的单个格子 */
export interface Cell {
  /** 全局唯一 id（Framer Motion layout 动画需要稳定 key） */
  id: string;
  /** 符号类型 */
  type: TokenType;
  /** 是否「限量版」高价值符号（由道具 2 升级，消除时加价） */
  limited: boolean;
  /** 由 Match-5 生成的「全柜同清炸弹」（整盘同色消除） */
  bomb: boolean;
  /** 由 Match-4 生成的爆破符号：'row' = 整列消除 / 'col' = 整行消除 */
  blast?: 'row' | 'col';
  /** 品牌（始终等于 type；冗余字段便于结算统计与展示） */
  brand: TokenType;
}

/** 内部使用的棋盘表示：消除后含空位（null），重力填充后恢复完整 */
export type Board = (Cell | null)[];

/** 道具（VIP 特权） */
export type PowerUpType = 'greenChannel' | 'markup' | 'resell';

export interface PowerUp {
  type: PowerUpType;
  name: string;
  tagline: string;
  icon: 'layoutGrid' | 'gem' | 'shuffle';
  /** 每局可用次数 */
  uses: number;
}

export type GameStatus = 'idle' | 'playing' | 'checkout' | 'gameover';

/** 一次消除事件（用于连消计分与结算统计） */
export interface MatchEvent {
  cells: Cell[];
  matched: number;
  points: number;
  combo: number;
}

/** 结算统计：每个品牌的采购数量 */
export interface BrandStat {
  type: TokenType;
  name: string;
  /** 该品牌在整局中被消除的格子数（等同“采购”数量） */
  count: number;
}

/** 完整游戏状态 */
export interface GameState {
  board: Board;
  rows: number;
  cols: number;
  moves: number;
  score: number;
  status: GameStatus;
  /** 本局最高连消数 */
  maxCombo: number;
  /** 连消动画锁：防止动画期间重复操作 */
  busy: boolean;
  /** 本局使用的方块种类 */
  tokenTypes: TokenType[];
  /** 各品牌累计采购（消除）数量，用于结算展示 */
  brandStats: Record<TokenType, number>;
  /** 阶段动画队列（交换→消除→下落→连消） */
  animation: GameAnimation;
}

/** 动画阶段：'idle' 等待输入 / 'swapping' 交换中 / 'swapfail' 交换失败 / 'clearing' 消除中 / 'falling' 下落中 */
export type AnimationPhase = 'idle' | 'swapping' | 'swapfail' | 'clearing' | 'falling';

/** 阶段动画状态机 */
export interface GameAnimation {
  phase: AnimationPhase;
  /** 正在被交换的两个格子 index */
  swapping: number[];
  /** 正在被消除的格子 index 集合 */
  clearing: number[];
  /** 当前连消段数 */
  cascade: number;
}

/** 道具使用的返回结果 */
export interface PowerUpResult {
  board: Board;
  score: number;
  moves: number;
  /** 若为消除型道具，返回被消除的格子（用于动画与计分） */
  cleared?: Cell[];
  cascades?: number;
}

/** 结算 Modal 用的评语档位 */
export type VerdictTier = 'cold' | 'waitlist' | 'vip';
