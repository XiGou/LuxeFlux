/**
 * Luxe Flux — 核心遊戲型別定義
 * Game board cells, tokens, power-ups and global state.
 */

/** 奢侈品 Logo 符號（佔位素材，後續可替換為真實品牌 SVG/PNG） */
export type TokenType =
  | 'bag'
  | 'heels'
  | 'watch'
  | 'perfume'
  | 'sunglasses'
  | 'champagne';

/** 棋盤上的單個格子 */
export interface Cell {
  /** 全域唯一 id（Framer Motion layout 動畫需要穩定 key） */
  id: string;
  /** 符號類型 */
  type: TokenType;
  /** 是否為「限量版」高價值符號（由道具 2 升級，消除時加價） */
  limited: boolean;
  /** 由 Match-5 生成的「全配貨炸彈」（整盤同色消除） */
  bomb: boolean;
  /** 由 Match-4 生成的爆破符號：'row' = 整列消除 / 'col' = 整行消除 */
  blast?: 'row' | 'col';
}

/** 內部使用的棋盤表示：消除後可含空位（null），重力填充後恢復完整 */
export type Board = (Cell | null)[];

/** 道具（VIP 配貨特權） */
export type PowerUpType = 'greenChannel' | 'markup' | 'resell';

export interface PowerUp {
  type: PowerUpType;
  name: string;
  tagline: string;
  icon: 'layoutGrid' | 'gem' | 'shuffle';
  /** 每局可用次數 */
  uses: number;
}

export type GameStatus = 'idle' | 'playing' | 'checkout' | 'gameover';

/** 一次消除事件的回報記錄（用於連消計分） */
export interface MatchEvent {
  cells: Cell[];
  matched: number;
  points: number;
  combo: number;
}

/** 完整遊戲狀態 */
export interface GameState {
  board: Cell[];
  rows: number;
  cols: number;
  moves: number;
  score: number;
  status: GameStatus;
  /** 本局最高連消數 */
  maxCombo: number;
  /** 連消動畫鎖：防止動畫期間重複操作 */
  busy: boolean;
}

/** 道具使用的回傳結果 */
export interface PowerUpResult {
  board: Board;
  score: number;
  moves: number;
  /** 若為消除型道具，返回被消除的格子（用於動畫與計分） */
  cleared?: Cell[];
  cascades?: number;
}

/** 結算 Modal 用的評語檔位 */
export type VerdictTier = 'cold' | 'waitlist' | 'vip';
