/**
 * Luxe Flux — 完整 8x8 消消樂演算法
 *
 * 功能:
 *  1. 生成無初始匹配的棋盤
 *  2. 檢查 / 交換相鄰格子（交換後需形成匹配，否則回退）
 *  3. 檢測 Match-3 / Match-4 / Match-5 並生成爆破符號與全配貨炸彈
 *  4. 重力下落 + 頂部補充（可連續 Cascade）
 *  5. 道具邏輯：Green Channel / Markup Resale / Resell Market
 *
 * 計分: 每消除 1 個符號 +$1,980；4 連消 ×2、5 連消 ×3、炸彈附加。
 * 棋盤始終保持 rows×cols 個槽位，消除階段以 null 標記空位，重力後補滿。
 */
import type { Cell, TokenType, GameState, MatchEvent, PowerUpResult, Board } from '../types/game';

export const ROWS = 8;
export const COLS = 8;
export const BASE_POINTS = 1980; // $1,980 / 個
export const START_MOVES = 15;

/** 佔位素材符號集（後續替換為真實品牌 Logo 素材） */
export const TOKEN_TYPES: TokenType[] = [
  'bag',
  'heels',
  'watch',
  'perfume',
  'sunglasses',
  'champagne'
];

/** 產生唯一 id（Framer Motion layout key 用） */
export function cellId(r: number, c: number, salt: number): string {
  return `${r}-${c}-${salt}`;
}

let saltCounter = 0;
export function nextSalt(): number {
  return ++saltCounter;
}

/** 將 (row, col) 轉為一維 index */
export function idx(r: number, c: number): number {
  return r * COLS + c;
}

export function rowOf(i: number): number {
  return Math.floor(i / COLS);
}

export function colOf(i: number): number {
  return i % COLS;
}

/** 隨機符號（可排除指定類型） */
function randomToken(exclude?: Set<TokenType>): TokenType {
  const pool =
    exclude && exclude.size < TOKEN_TYPES.length
      ? TOKEN_TYPES.filter((t) => !exclude.has(t))
      : TOKEN_TYPES;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 隨機正則化值（用於洗牌多樣性） */
function randomJitter(): number {
  return Math.floor(Math.random() * 1000);
}

/* ------------------------------------------------------------------ */
/* 生成                                                                */
/* ------------------------------------------------------------------ */

/**
 * 生成一個「保證無初始匹配」的棋盤。
 * 逐格填充 + 回溯排除：若填入後會形成三連，改用其他符號。
 */
export function generateBoard(rows = ROWS, cols = COLS): Cell[] {
  const board: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const banned = new Set<TokenType>();
      // 左邊兩個相同 → 不能再用
      if (c >= 2 && board[idx(r, c - 1)].type === board[idx(r, c - 2)].type) {
        banned.add(board[idx(r, c - 1)].type);
      }
      // 上面兩個相同 → 不能再用
      if (r >= 2 && board[idx(r - 1, c)].type === board[idx(r - 2, c)].type) {
        banned.add(board[idx(r - 1, c)].type);
      }
      board.push({
        id: cellId(r, c, nextSalt()),
        type: randomToken(banned),
        limited: false,
        bomb: false
      });
    }
  }
  return board;
}

/* ------------------------------------------------------------------ */
/* 匹配檢測                                                            */
/* ------------------------------------------------------------------ */

/** 找到盤面所有「匹配段」（連續 ≥3 個同型、非空、非炸彈符號） */
export function findMatches(board: Board, rows = ROWS, cols = COLS): number[][] {
  const matches: number[][] = [];

  // 水平
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      const cell = board[idx(r, c)];
      if (!cell || cell.bomb) {
        c++;
        continue;
      }
      const type = cell.type;
      let end = c + 1;
      while (
        end < cols &&
        board[idx(r, end)] &&
        !board[idx(r, end)]!.bomb &&
        board[idx(r, end)]!.type === type
      ) {
        end++;
      }
      if (end - c >= 3) {
        const seg: number[] = [];
        for (let i = c; i < end; i++) seg.push(idx(r, i));
        matches.push(seg);
      }
      c = end;
    }
  }

  // 垂直
  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < rows) {
      const cell = board[idx(r, c)];
      if (!cell || cell.bomb) {
        r++;
        continue;
      }
      const type = cell.type;
      let end = r + 1;
      while (
        end < rows &&
        board[idx(end, c)] &&
        !board[idx(end, c)]!.bomb &&
        board[idx(end, c)]!.type === type
      ) {
        end++;
      }
      if (end - r >= 3) {
        const seg: number[] = [];
        for (let i = r; i < end; i++) seg.push(idx(i, c));
        matches.push(seg);
      }
      r = end;
    }
  }

  return matches;
}

/** 將匹配段轉為「要消除的格子集合」 */
function collectMatchedSet(matches: number[][]): Set<number> {
  const set = new Set<number>();
  for (const seg of matches) for (const i of seg) set.add(i);
  return set;
}

/** 是否有任何匹配存在 */
export function hasMatches(board: Board, rows = ROWS, cols = COLS): boolean {
  return findMatches(board, rows, cols).length > 0;
}

/** 盤面是否有空位（消除後、重力前） */
export function hasHoles(board: Board): boolean {
  return board.some((c) => c === null);
}

/* ------------------------------------------------------------------ */
/* 交換                                                                */
/* ------------------------------------------------------------------ */

/** 交換兩格；若未形成匹配則回退並回傳 null */
export function trySwap(board: Board, a: number, b: number): Board | null {
  const dr = Math.abs(rowOf(a) - rowOf(b));
  const dc = Math.abs(colOf(a) - colOf(b));
  // 僅允許正交相鄰
  if (dr + dc !== 1) return null;

  // 炸彈可與任意相鄰格子交換（交換即觸發）
  if (board[a]?.bomb || board[b]?.bomb) {
    return swapCells(board, a, b);
  }

  const swapped = swapCells(board, a, b);
  if (hasMatches(swapped)) return swapped;
  return null;
}

function swapCells(board: Board, a: number, b: number): Board {
  const next = board.slice();
  const tmp = next[a];
  next[a] = next[b];
  next[b] = tmp;
  return next;
}

/* ------------------------------------------------------------------ */
/* 消除 + 爆破符號生成                                                 */
/* ------------------------------------------------------------------ */

/**
 * 對匹配段做「升級處理」：
 *  - 水平 Match-4 → blast='row'（整列爆破）
 *  - 垂直 Match-4 → blast='col'（整行爆破）
 *  - Match-5     → bomb（全配貨炸彈，整盤同色消除）
 * 回傳 [新棋盤, 需要消除的格子集合]
 */
function upgradeMatches(board: Board, matches: number[][]): [Board, Set<number>] {
  const next = board.slice();
  const toClear = collectMatchedSet(matches);

  for (const seg of matches) {
    if (seg.length < 4) continue;
    const anchor = seg[Math.floor(seg.length / 2)];
    const cell = next[anchor];
    if (!cell) continue;
    const isHorizontal = seg.every((i) => rowOf(i) === rowOf(seg[0]));

    if (seg.length === 5) {
      // 全配貨炸彈
      next[anchor] = { ...cell, bomb: true, limited: false, blast: undefined } as Cell;
      continue;
    }
    // Match-4 → 爆破符號（保留在盤面上，清除時橫掃整列/整行）
    next[anchor] = {
      ...cell,
      bomb: false,
      limited: true,
      blast: isHorizontal ? 'row' : 'col'
    } as Cell;
  }
  return [next, toClear];
}

/** 爆破符號 / 炸彈的擴散集合 */
function explosionSet(board: Board, anchorIndex: number, cleared: Set<number>): Set<number> {
  const out = new Set<number>(cleared);
  const cell = board[anchorIndex];
  if (!cell) return out;
  const r = rowOf(anchorIndex);
  const c = colOf(anchorIndex);

  if (cell.bomb) {
    // 全配貨炸彈：整盤同色清空 + 連鎖引爆其他同型炸彈
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i]!.type === cell.type) out.add(i);
    }
    for (let i = 0; i < board.length; i++) {
      if (i !== anchorIndex && board[i]?.bomb && board[i]!.type === cell.type) {
        const sub = explosionSet(board, i, out);
        for (const s of sub) out.add(s);
      }
    }
    return out;
  }

  if (cell.blast === 'row') {
    for (let cc = 0; cc < COLS; cc++) out.add(idx(r, cc));
  } else if (cell.blast === 'col') {
    for (let rr = 0; rr < ROWS; rr++) out.add(idx(rr, c));
  }
  return out;
}

/** 清掉爆破標記（爆破符號消除後，其餘位置回歸普通符號） */
function normalizeBlast(board: Cell[]): Cell[] {
  return board.map((cell) =>
    cell && cell.blast ? { ...cell, blast: undefined, limited: false } : cell
  );
}

/**
 * 執行一輪消除：
 *  1. 找出所有匹配
 *  2. 升級生成爆破符號 / 炸彈
 *  3. 展開爆破範圍
 *  4. 計分（Match-4 ×2、Match-5 ×3、炸彈 +$2,980、限量版 ×3）
 *  5. 將被消除的格子置為 null（保留槽位，交由 gravity 填補）
 * 回傳 [新棋盤(含空位), MatchEvent]
 */
export function clearMatches(board: Board): [Board, MatchEvent] {
  const matches = findMatches(board);

  const [upgraded, baseClear] = upgradeMatches(board, matches);
  const cleared = new Set<number>(baseClear);

  // 爆破擴散
  for (const seg of matches) {
    const anchor = seg[Math.floor(seg.length / 2)];
    const spread = explosionSet(upgraded, anchor, cleared);
    for (const s of spread) cleared.add(s);
  }

  // 計分
  const hasBomb = matches.some((seg) => upgraded[seg[Math.floor(seg.length / 2)]]?.bomb);
  let points = 0;
  for (const seg of matches) {
    const mult = seg.length === 5 ? 3 : seg.length === 4 ? 2 : 1;
    points += seg.length * BASE_POINTS * mult;
  }
  if (hasBomb) points += 2980; // 全配貨炸彈紅利

  // 爆破波及 + 限量版加價
  const extra = cleared.size - baseClear.size;
  if (extra > 0) points += extra * 500;
  for (const i of cleared) {
    if (board[i]?.limited) points += BASE_POINTS * 2; // 限量版 ×3 總計
  }

  // 標記消除（保留槽位 = null）
  const clearedIds = new Set<string>();
  const newBoard = normalizeBlast(upgraded as Cell[]).map((cell, i) => {
    if (cleared.has(i)) {
      if (cell) clearedIds.add(cell.id);
      return null;
    }
    return cell;
  }) as Board;

  return [
    newBoard,
    {
      cells: Array.from(clearedIds)
        .map((id) => board.find((c) => c?.id === id))
        .filter(Boolean) as Cell[],
      matched: cleared.size,
      points,
      combo: matches.length
    }
  ];
}

/* ------------------------------------------------------------------ */
/* 重力下落 + 填充                                                      */
/* ------------------------------------------------------------------ */

/**
 * 重力下落並在頂部補充新符號。
 * 輸入可含 null（消除後的棋盤），輸出保證 rows×cols 全部非空。
 */
export function applyGravity(board: Board, rows = ROWS, cols = COLS): Cell[] {
  const next = board.slice() as (Cell | null)[];
  for (let c = 0; c < cols; c++) {
    let write = rows - 1;
    for (let r = rows - 1; r >= 0; r--) {
      const cell = next[idx(r, c)];
      if (cell) {
        if (write !== r) {
          next[idx(write, c)] = { ...cell, id: cellId(write, c, nextSalt()) };
          next[idx(r, c)] = null;
        }
        write--;
      }
    }
    // 頂部補充
    for (let r = write; r >= 0; r--) {
      next[idx(r, c)] = {
        id: cellId(r, c, nextSalt()),
        type: randomToken(),
        limited: false,
        bomb: false
      };
    }
  }
  return next as Cell[];
}

/** 是否還有可用步數（至少存在一個可形成匹配的交換） */
export function hasValidMove(board: Board, rows = ROWS, cols = COLS): boolean {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = idx(r, c);
      if (!board[i]) continue;
      if (c + 1 < cols && board[idx(r, c + 1)] && trySwap(board, i, idx(r, c + 1))) return true;
      if (r + 1 < rows && board[idx(r + 1, c)] && trySwap(board, i, idx(r + 1, c))) return true;
    }
  }
  return false;
}

/**
 * 洗牌（Resell Market 道具）：重新打亂但保證:
 *  - 無初始匹配
 *  - 存在可用步數（最多嘗試 50 次）
 */
export function shuffleBoard(board: Board): Cell[] {
  const types = board.filter((c): c is Cell => c !== null).map((c) => c.type);
  for (let attempt = 0; attempt < 50; attempt++) {
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    const candidate: Cell[] = types.map((type, i) => ({
      id: cellId(rowOf(i), colOf(i), nextSalt() + randomJitter()),
      type,
      limited: false,
      bomb: false
    }));
    if (!hasMatches(candidate) && hasValidMove(candidate)) return candidate;
  }
  // 失敗保底：重新生成
  return generateBoard();
}

/* ------------------------------------------------------------------ */
/* 道具                                                                */
/* ------------------------------------------------------------------ */

export const POWER_UPS = {
  greenChannel: {
    name: '配貨綠色通道',
    tagline: 'Green Channel · 指定消除 3×3',
    icon: 'layoutGrid' as const,
    uses: 2
  },
  markup: {
    name: '溢價轉售',
    tagline: 'Markup Resale · 隨機升級限量版',
    icon: 'gem' as const,
    uses: 1
  },
  resell: {
    name: '二手配貨',
    tagline: 'Resell Market · 重新打亂盤面',
    icon: 'shuffle' as const,
    uses: 1
  }
};

/** 道具 1：綠色通道 — 以中心格為準消除 3×3 */
export function useGreenChannel(board: Board, centerIndex: number): PowerUpResult {
  const r = rowOf(centerIndex);
  const c = colOf(centerIndex);
  const clearedIdx: number[] = [];
  const next = board.slice();

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
      clearedIdx.push(idx(rr, cc));
    }
  }
  const cells = clearedIdx.map((i) => board[i]).filter(Boolean) as Cell[];
  for (const i of clearedIdx) next[i] = null;

  const points = cells.length * BASE_POINTS;
  return { board: next, score: points, moves: 0, cleared: cells, cascades: 0 };
}

/** 道具 2：溢價轉售 — 隨機將一種普通符號升級為「限量版」(消除 ×3) */
export function useMarkup(board: Board): PowerUpResult {
  const cells = board.filter((c): c is Cell => c !== null);
  const present = Array.from(new Set(cells.map((c) => c.type)));
  if (present.length === 0) return { board, score: 0, moves: 0 };

  const targetType = present[Math.floor(Math.random() * present.length)];
  const next = board.map((c) =>
    c && c.type === targetType ? { ...c, limited: true, blast: undefined, bomb: false } : c
  ) as Board;
  return { board: next, score: 0, moves: 0 };
}

/** 道具 3：二手配貨 — 打亂盤面（保證無初始匹配且有解） */
export function useResell(board: Board): PowerUpResult {
  return { board: shuffleBoard(board), score: 0, moves: 0 };
}

/* ------------------------------------------------------------------ */
/* 遊戲流程組合                                                         */
/* ------------------------------------------------------------------ */

/**
 * 完整的一次「交換 → 消除 → 重力 → 連消」處理。
 * 回傳 [最終棋盤, 累計分數, 連消次數, MatchEvents]
 */
export function processSwap(
  board: Board,
  from: number,
  to: number
): [Cell[], number, number, MatchEvent[]] {
  let current = trySwap(board, from, to);
  if (!current) return [board.filter((c): c is Cell => c !== null), 0, 0, []];

  let totalPoints = 0;
  let cascades = 0;
  const events: MatchEvent[] = [];

  while (hasMatches(current)) {
    const [afterClear, evt] = clearMatches(current);
    totalPoints += evt.points;
    cascades++;
    events.push(evt);
    current = applyGravity(afterClear);
    if (!hasMatches(current)) break;
  }
  return [applyGravity(current), totalPoints, cascades, events];
}

/** 道具使用後：統一處理重力 + 連消（回傳最終盤面、分數、連消數） */
export function processPowerUp(_board: Board, result: PowerUpResult): [Cell[], number, number] {
  let current = result.board;
  let totalPoints = result.score;
  let cascades = 0;

  if (result.cleared) {
    current = applyGravity(current);
  }
  while (hasMatches(current)) {
    const [afterClear, evt] = clearMatches(current);
    totalPoints += evt.points;
    cascades++;
    current = applyGravity(afterClear);
    if (!hasMatches(current)) break;
  }
  return [applyGravity(current), totalPoints, cascades];
}

/** 建構初始 GameState */
export function createInitialState(): GameState {
  return {
    board: generateBoard(),
    rows: ROWS,
    cols: COLS,
    moves: START_MOVES,
    score: 0,
    status: 'playing',
    maxCombo: 0,
    busy: false
  };
}

/* ------------------------------------------------------------------ */
/* 結算評語                                                            */
/* ------------------------------------------------------------------ */

export function verdict(score: number): {
  tier: 'cold' | 'waitlist' | 'vip';
  title: string;
  message: string;
} {
  if (score < 10000) {
    return {
      tier: 'cold',
      title: '本店不單賣配件',
      message: 'SA 對你冷笑了下：「抱歉，本店不單賣配貨配件。」'
    };
  }
  if (score <= 30000) {
    return {
      tier: 'waitlist',
      title: '恭喜！您已進入等候名單',
      message: `恭喜！您已成功配貨 $${score.toLocaleString()}，獲得等候 Birkin 25 包包的名單資格（預計等待 3 年）。`
    };
  }
  return {
    tier: 'vip',
    title: '尊貴的 VIP',
    message: `尊貴的 VIP，品牌 CEO 親自為您開門！您已擊敗全球 99% 的消費主義受害者！（配貨總額 $${score.toLocaleString()}）`
  };
}
