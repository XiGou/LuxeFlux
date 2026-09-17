/**
 * Luxe Flux — 完整 8x8 消消乐算法
 *
 * 功能:
 *  1. 每局从品牌素材池随机抽取 6 种方块（主流消消乐种类数）
 *  2. 生成无初始匹配的棋盘
 *  3. 检查 / 交换相邻格子（交换后需形成匹配，否则回退）
 *  4. 检测 Match-3 / Match-4 / Match-5 并生成爆破符号与全柜同清炸弹
 *  5. 重力下落 + 顶部补充（下落格子保留 id，供 Framer Motion layout 动画）
 *  6. 道具逻辑：绿色通道 / 限量配货 / 二手同款
 *
 * 采购设定：消除 = 买下该品牌的一件单品。
 *  - 全场统一单价 $1,980 / 件（不因品牌、连消、爆破而改变价格）
 *  - 最终账单 = 采购件数 × 单价
 *  - 连消 / 行爆破 / 全柜同清炸弹的价值体现在「一次买下更多件」
 *  - 限量版按专柜「买一配一」潜规则，成交时计 2 件
 * 棋盘始终保持 rows×cols 个槽位，消除阶段以 null 标记空位，重力后补满。
 */
import type { Cell, TokenType, GameState, MatchEvent, PowerUpResult, Board, BrandStat } from '../types/game';
import { sampleTokenTypes, BRAND_NAMES, TOKEN_POOL } from './brands';

export const ROWS = 8;
export const COLS = 8;
/** 全场统一单价：$1,980 / 件（经典款均价，品牌之间不区分价格） */
export const UNIT_PRICE = 1980;
/** 限量版成交件数：买一配一 = 2 件 */
export const LIMITED_UNITS = 2;
export const START_MOVES = 15;

/**
 * 道具「整柜打包」固定成交件数。
 * 无论打包范围内剩几个格子，一律只按 2 件入账（避免 3×3 一次刷 9 件）。
 */
export const BUNDLE_UNITS = 2;
/**
 * 道具「整柜打包」需扣减的步数（用步数换打包，防止空刷无限清盘）。
 */
export const BUNDLE_MOVE_COST = 1;

/* ------------------------------------------------------------------ */
/* 奖励步数（玩得好才能持续玩下去）                                     */
/* ------------------------------------------------------------------ */

/**
 * 奖励步数规则：只有「超额完成」的匹配才加步，且加得上限极低。
 *  - 一次消除形成 5 连及以上（含十字 / 双段）→ +2 步
 *  - 一次消除形成 4 连（含交叉双四连）        → +1 步
 *  - 连消（同一步内第 2 段起）每段          → +1 步
 *  - 单步封顶 +MOVES_REWARD_CAP，奖励只能减速消耗，永远不亏不赚
 * 三消不给奖励：普通玩家正常玩下去步数只会不断减少，只有盘面读得好、
 * 主动造四连/五连/连消的人才可能把局面拖长。
 */
export const MOVES_REWARD_CAP = 3;
/** 5 连及以上奖励步数 */
export const MOVES_REWARD_MATCH5 = 2;
/** 4 连奖励步数 */
export const MOVES_REWARD_MATCH4 = 1;
/** 连消每段奖励步数 */
export const MOVES_REWARD_CASCADE = 1;

/**
 * 一次消除中最长的「直线匹配段」长度（无匹配返回 0）。
 * 只认真正的直线段：十字交叉形成的组合段不计入长度，避免十字被算成 5 连。
 */
export function longestSegment(matches: number[][]): number {
  let best = 0;
  for (const seg of matches) {
    if (seg.length < 3) continue;
    const first = seg[0];
    const last = seg[seg.length - 1];
    const step = Math.abs(last - first) / (seg.length - 1);
    // 直线段必须是等差步进：同一行步长 = 1，同一列步长 = COLS
    if (step !== 1 && step !== COLS) continue;
    const ordered = step === COLS;
    const onLine = seg.every((i, k) =>
      ordered ? colOf(i) === colOf(first) && rowOf(i) === rowOf(first) + k : rowOf(i) === rowOf(first)
    );
    if (!onLine) continue;
    if (seg.length > best) best = seg.length;
  }
  return best;
}

/**
 * 计算一次消除应奖励的步数。
 *
 * @param matches 本次消除的所有匹配段
 * @param cascade 本次消除所处的连消段号（1 = 第一步的首段）
 */
export function movesReward(matches: number[][], cascade = 1): number {
  const longest = longestSegment(matches);
  let reward = 0;
  if (longest >= 5) reward += MOVES_REWARD_MATCH5;
  else if (longest >= 4) reward += MOVES_REWARD_MATCH4;
  if (cascade > 1) reward += MOVES_REWARD_CASCADE;
  return Math.min(reward, MOVES_REWARD_CAP);
}

/**
 * 多段消除（连消）的总奖励：逐段计算后套用单步上限。
 * 传入的 cascade 为各段在整步中的序号（首段为 1）。
 */
export function movesRewardTotal(segments: { matches: number[][]; cascade: number }[]): number {
  let reward = 0;
  for (const s of segments) reward += movesReward(s.matches, s.cascade);
  return Math.min(reward, MOVES_REWARD_CAP);
}

/** 占位素材符号集（后续替换为真实品牌 Logo 素材）——默认池全部品牌 */
export const TOKEN_TYPES: TokenType[] = TOKEN_POOL;

/** 产生唯一 id（Framer Motion layout key 用） */
export function cellId(r: number, c: number, salt: number): string {
  return `${r}-${c}-${salt}`;
}

let saltCounter = 0;
export function nextSalt(): number {
  return ++saltCounter;
}

/** 将 (row, col) 转为一维 index */
export function idx(r: number, c: number): number {
  return r * COLS + c;
}

export function rowOf(i: number): number {
  return Math.floor(i / COLS);
}

export function colOf(i: number): number {
  return i % COLS;
}

/* ------------------------------------------------------------------ */
/* 采购计分：统一单价 × 件数                                            */
/* ------------------------------------------------------------------ */

/** 单个格子成交计入的件数（限量版「买一配一」计 2 件） */
export function cellUnits(cell: Cell | null): number {
  if (!cell) return 0;
  return cell.limited ? LIMITED_UNITS : 1;
}

/** 一批格子成交的总件数 */
export function unitsOf(cells: (Cell | null)[]): number {
  return cells.reduce((sum, c) => sum + cellUnits(c), 0);
}

/** 件数 → 金额（全场统一单价，价格不因品牌/连消/爆破而不同） */
export function priceOf(units: number): number {
  return units * UNIT_PRICE;
}

/** 把一批成交格子封装为 MatchEvent（消除、道具通用） */
export function toMatchEvent(cells: Cell[], matched: number, combo: number): MatchEvent {
  const units = unitsOf(cells);
  return { cells, matched, units, points: priceOf(units), combo };
}

/** 随机符号（可排除指定类型） */
function randomToken(tokenTypes: TokenType[], exclude?: Set<TokenType>): TokenType {
  const pool =
    exclude && exclude.size < tokenTypes.length
      ? tokenTypes.filter((t) => !exclude.has(t))
      : tokenTypes;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 随机正则化值（用于洗牌多样性） */
function randomJitter(): number {
  return Math.floor(Math.random() * 1000);
}

/* ------------------------------------------------------------------ */
/* 生成                                                                */
/* ------------------------------------------------------------------ */

/**
 * 生成一个「保证无初始匹配」的棋盘。
 * 逐格填充 + 回溯排除：若填入后形成三连，改用其他符号。
 * 默认从素材池随机抽取 6 种（与开局逻辑一致）。
 */
export function generateBoard(
  tokenTypes: TokenType[] = sampleTokenTypes(),
  rows = ROWS,
  cols = COLS
): Cell[] {
  const board: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const banned = new Set<TokenType>();
      // 左边两个相同 → 不能再用
      if (c >= 2 && board[idx(r, c - 1)].type === board[idx(r, c - 2)].type) {
        banned.add(board[idx(r, c - 1)].type);
      }
      // 上面两个相同 → 不能再用
      if (r >= 2 && board[idx(r - 1, c)].type === board[idx(r - 2, c)].type) {
        banned.add(board[idx(r - 1, c)].type);
      }
      board.push({
        id: cellId(r, c, nextSalt()),
        type: randomToken(tokenTypes, banned),
        limited: false,
        bomb: false,
        brand: tokenTypes[0]
      });
    }
  }
  // 修正 brand：与 type 保持一致
  for (let i = 0; i < board.length; i++) {
    board[i] = { ...board[i], brand: board[i].type };
  }
  return board;
}

/* ------------------------------------------------------------------ */
/* 匹配检测                                                            */
/* ------------------------------------------------------------------ */

/** 找到盘面所有「匹配段」（连续 ≥3 个同型、非空、非炸弹符号） */
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

/** 将匹配段转为「要消除的格子集合」 */
function collectMatchedSet(matches: number[][]): Set<number> {
  const set = new Set<number>();
  for (const seg of matches) for (const i of seg) set.add(i);
  return set;
}

/** 是否有任何匹配存在 */
export function hasMatches(board: Board, rows = ROWS, cols = COLS): boolean {
  return findMatches(board, rows, cols).length > 0;
}

/** 盘面是否有空位（消除后、重力前） */
export function hasHoles(board: Board): boolean {
  return board.some((c) => c === null);
}

/* ------------------------------------------------------------------ */
/* 交换                                                                */
/* ------------------------------------------------------------------ */

/** 交换两格；若未形成匹配则回退并返回 null */
export function trySwap(board: Board, a: number, b: number): Board | null {
  const dr = Math.abs(rowOf(a) - rowOf(b));
  const dc = Math.abs(colOf(a) - colOf(b));
  // 仅允许正交相邻
  if (dr + dc !== 1) return null;

  // 炸弹可与任意相邻格子交换（交换即触发）
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
/* 消除 + 爆破符号生成                                                 */
/* ------------------------------------------------------------------ */

/**
 * 对匹配段做「升级处理」：
 *  - 水平 Match-4 → blast='row'（整列爆破）
 *  - 垂直 Match-4 → blast='col'（整行爆破）
 *  - Match-5     → bomb（全柜同清炸弹，整盘同色消除）
 * 返回 [新棋盘, 需要消除的格子集合]
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
      // 全柜同清炸弹
      next[anchor] = { ...cell, bomb: true, limited: false, blast: undefined } as Cell;
      continue;
    }
    // Match-4 → 爆破符号（保留在盘面上，清除时横扫整列/整行）
    next[anchor] = {
      ...cell,
      bomb: false,
      limited: true,
      blast: isHorizontal ? 'row' : 'col'
    } as Cell;
  }
  return [next, toClear];
}

/** 爆破符号 / 炸弹的扩散集合 */
function explosionSet(board: Board, anchorIndex: number, cleared: Set<number>): Set<number> {
  const out = new Set<number>(cleared);
  const cell = board[anchorIndex];
  if (!cell) return out;
  const r = rowOf(anchorIndex);
  const c = colOf(anchorIndex);

  if (cell.bomb) {
    // 全柜同清炸弹：整盘同色清空 + 连锁引爆其他同型炸弹
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

/** 清掉爆破标记（爆破符号消除后，其余位置回归普通符号） */
function normalizeBlast(board: Cell[]): Cell[] {
  return board.map((cell) =>
    cell && cell.blast ? { ...cell, blast: undefined, limited: false } : cell
  );
}

/**
 * 执行一轮消除：
 *  1. 找出所有匹配
 *  2. 升级生成爆破符号 / 炸弹
 *  3. 展开爆破范围（清掉更多格子 = 一次买下更多件）
 *  4. 计分：件数 × 统一单价（不设任何价格倍率）
 *  5. 将待消除格子置为 null（保留槽位，交由 gravity 填补）
 * 返回 [新棋盘(含空位), MatchEvent]
 */
export function clearMatches(board: Board): [Board, MatchEvent] {
  const [next, evt] = clearMatchesDetailed(board);
  return [next, evt];
}

/**
 * 同 clearMatches，但额外返回原始匹配段（用于计算奖励步数）。
 */
export function clearMatchesDetailed(board: Board): [Board, MatchEvent, number[][]] {
  const matches = findMatches(board);

  const [upgraded, baseClear] = upgradeMatches(board, matches);
  const cleared = new Set<number>(baseClear);

  // 爆破扩散
  for (const seg of matches) {
    const anchor = seg[Math.floor(seg.length / 2)];
    const spread = explosionSet(upgraded, anchor, cleared);
    for (const s of spread) cleared.add(s);
  }

  // 标记消除（保留槽位 = null）
  const clearedCells: Cell[] = [];
  const newBoard = normalizeBlast(upgraded as Cell[]).map((cell, i) => {
    if (cleared.has(i)) {
      if (board[i]) clearedCells.push(board[i] as Cell);
      return null;
    }
    return cell;
  }) as Board;

  // 计分：统一单价 × 件数（连消 / 爆破 / 炸弹只增加件数，不改变价格）
  const evt = toMatchEvent(clearedCells, cleared.size, matches.length);
  evt.matches = matches;
  return [newBoard, evt, matches];
}

/* ------------------------------------------------------------------ */
/* 重力下落 + 填充                                                      */
/* ------------------------------------------------------------------ */

/**
 * 重力下落并在顶部补充新符号。
 * 输入可含 null（消除后的棋盘），输出保证 rows×cols 全部非空。
 *
 * ⚠️ 关键：下落格子保留原 id（只更新位置信息），这样 Framer Motion
 * 的 `layout` FLIP 动画才能识别为「同一元素移动」，实现流畅下落；
 * 顶部新补充的格子使用新 id。
 */
export function applyGravity(
  board: Board,
  tokenTypes: TokenType[] = sampleTokenTypes(),
  rows = ROWS,
  cols = COLS
): Cell[] {
  const next = board.slice() as (Cell | null)[];
  for (let c = 0; c < cols; c++) {
    let write = rows - 1;
    for (let r = rows - 1; r >= 0; r--) {
      const cell = next[idx(r, c)];
      if (cell) {
        if (write !== r) {
          // 保留原 id，仅迁移位置 → layout 动画可平滑移动
          next[idx(write, c)] = cell;
          next[idx(r, c)] = null;
        }
        write--;
      }
    }
    // 顶部补充（新元素 → 新 id）
    for (let r = write; r >= 0; r--) {
      next[idx(r, c)] = {
        id: cellId(r, c, nextSalt()),
        type: randomToken(tokenTypes),
        limited: false,
        bomb: false,
        brand: randomToken(tokenTypes)
      };
    }
  }
  // 修正 brand 与 type 一致
  return (next as Cell[]).map((cell) =>
    cell ? { ...cell, brand: cell.type } : cell
  ) as Cell[];
}

/** 是否还有可用步数（至少存在一个可形成匹配的交换） */
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
 * 洗牌（二手同款道具）：重新打乱但保证:
 *  - 无初始匹配
 *  - 存在可用步数（最多尝试 50 次）
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
      bomb: false,
      brand: type
    }));
    if (!hasMatches(candidate) && hasValidMove(candidate)) return candidate;
  }
  // 失败保底：重新生成
  return generateBoard();
}

/* ------------------------------------------------------------------ */
/* 道具                                                                */
/* ------------------------------------------------------------------ */

export const POWER_UPS = {
  greenChannel: {
    name: '绿色通道',
    tagline: 'Green Channel · 整柜打包 3×3',
    description:
      '点选棋盘任意格子作为中心，SA 把其周围 3×3 的全部单品打包卖给你：整柜打包一律只算 2 件（按 $1,980 / 件入账，与实际清空格数无关），并消耗 1 步。适合精准清空碍事品牌、为连消铺路。',
    icon: 'layoutGrid' as const,
    uses: 2
  },
  markup: {
    name: '限量配货',
    tagline: 'Allocation · 随机升级限量版',
    description:
      '随机选中盘面中的一种品牌，将其所有普通单品升级为「限量版」。全场统一单价，限量版并不加价 —— 但按专柜「买一配一」的潜规则，成交时一次性计入 2 件。',
    icon: 'gem' as const,
    uses: 1
  },
  resell: {
    name: '二手同款',
    tagline: 'Resell Market · 重新打乱盘面',
    description:
      '将整个棋盘重新洗牌打乱，保证不会出现三连且一定有可行解。当前局面走投无路时的“二手市场换新”救命牌，帮您扭转败局。',
    icon: 'shuffle' as const,
    uses: 1
  }
};

/** 道具 1：绿色通道 — 以中心格为准消除 3×3 */
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

  // 打包清仓：整柜打包一律按固定件数（BUNDLE_UNITS）成交，与实际清空格数无关；
  // 并非免费 —— 调用方需扣减 BUNDLE_MOVE_COST 步（App 侧 settle）。
  return { board: next, score: priceOf(BUNDLE_UNITS), moves: -BUNDLE_MOVE_COST, cleared: cells, cascades: 0 };
}

/** 道具 2：限量配货 — 随机将一种普通符号升级为「限量版」（成交计 2 件） */
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

/** 道具 3：二手同款 — 打乱盘面（保证无初始匹配且有解） */
export function useResell(board: Board): PowerUpResult {
  return { board: shuffleBoard(board), score: 0, moves: 0 };
}

/* ------------------------------------------------------------------ */
/* 阶段化处理（动画框架）                                               */
/* ------------------------------------------------------------------ */

/**
 * 阶段 1：交换。返回交换后的棋盘。
 * 仅做 swapCells（不触发消除），动画结束后由 App 调用 beginCascade。
 */
export function phaseSwap(board: Board, from: number, to: number): Board | null {
  return trySwap(board, from, to);
}

/**
 * 阶段 2：消除当前所有匹配 + 返回事件。
 * 若无可消除匹配，返回 [null, null]。
 */
export function phaseClear(board: Board): [Board, MatchEvent] | [null, null] {
  if (!hasMatches(board)) return [null, null];
  return clearMatches(board);
}

/**
 * 阶段 3：重力下落。
 */
export function phaseGravity(board: Board, tokenTypes?: TokenType[]): Cell[] {
  return applyGravity(board, tokenTypes);
}

/**
 * 完整的一次「交换 → 消除 → 重力 → 连消」处理（非动画场景 / 逻辑测试用）。
 * 返回 [最终棋盘, 累计分数, 连消次数, MatchEvents]
 */
export function processSwap(
  board: Board,
  from: number,
  to: number,
  tokenTypes: TokenType[] = sampleTokenTypes()
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
    current = applyGravity(afterClear, tokenTypes);
    if (!hasMatches(current)) break;
  }
  return [applyGravity(current, tokenTypes), totalPoints, cascades, events];
}

/** 道具使用后：统一处理重力 + 连消（返回最终盘面、分数、连消数） */
export function processPowerUp(
  _board: Board,
  result: PowerUpResult,
  tokenTypes: TokenType[] = sampleTokenTypes()
): [Cell[], number, number] {
  let current = result.board;
  let totalPoints = result.score;
  let cascades = 0;

  if (result.cleared) {
    current = applyGravity(current, tokenTypes);
  }
  while (hasMatches(current)) {
    const [afterClear, evt] = clearMatches(current);
    totalPoints += evt.points;
    cascades++;
    current = applyGravity(afterClear, tokenTypes);
    if (!hasMatches(current)) break;
  }
  return [applyGravity(current, tokenTypes), totalPoints, cascades];
}

/** 构建初始 GameState（每局随机抽取方块种类） */
export function createInitialState(): GameState {
  const tokenTypes = sampleTokenTypes();
  const board = generateBoard(tokenTypes);
  const emptyStats = emptyBrandStats(tokenTypes);
  return {
    board,
    rows: ROWS,
    cols: COLS,
    moves: START_MOVES,
    score: 0,
    items: 0,
    status: 'playing',
    maxCombo: 0,
    busy: false,
    tokenTypes,
    brandStats: emptyStats,
    animation: { phase: 'idle', swapping: [], clearing: [], cascade: 0 }
  };
}

/** 初始化品牌统计（本局出现过的品牌清零） */
export function emptyBrandStats(tokenTypes: TokenType[]): Record<TokenType, number> {
  const stats = {} as Record<TokenType, number>;
  for (const t of tokenTypes) stats[t] = 0;
  return stats;
}

/**
 * 累加消除事件的品牌采购件数（防御性：支持不在初始集合中的新品牌）
 * 件数与金额同源：限量版「买一配一」计 2 件，因此
 * 「各品牌件数之和 × UNIT_PRICE」恒等于最终消费总额。
 */
export function mergeBrandStats(
  stats: Record<TokenType, number>,
  events: MatchEvent[]
): Record<TokenType, number> {
  const next = { ...stats };
  for (const evt of events) {
    for (const cell of evt.cells) {
      const type = cell.brand ?? cell.type;
      next[type] = (next[type] ?? 0) + cellUnits(cell);
    }
  }
  return next;
}

/** 将统计对象转为排序列表（件数降序，供结算展示） */
export function toBrandStatsList(stats: Record<TokenType, number>): BrandStat[] {
  return (Object.keys(stats) as TokenType[])
    .filter((t) => (stats[t] ?? 0) > 0)
    .map((t) => {
      const count = stats[t] ?? 0;
      return { type: t, name: BRAND_NAMES[t], count, subtotal: priceOf(count) };
    })
    .sort((a, b) => b.count - a.count);
}

/* ------------------------------------------------------------------ */
/* 结算评语                                                            */
/* ------------------------------------------------------------------ */

/** 结算评语档位（按采购件数判定，件数 × 单价即消费总额） */
const VERDICT_TIERS = {
  /** 低于此件数：SA 不伺候 */
  waitlist: 60,
  /** 达到此件数：VIP 待遇 */
  vip: 120
} as const;

export function verdict(items: number): {
  tier: 'cold' | 'waitlist' | 'vip';
  title: string;
  message: string;
} {
  const amount = priceOf(items);
  const money = `$${amount.toLocaleString()}`;

  if (items < VERDICT_TIERS.waitlist) {
    return {
      tier: 'cold',
      title: '本店不单卖配件',
      message: `您只买了 ${items} 件（${money}）。SA 对你冷笑了下：「抱歉，本店不单卖同款配件。」`
    };
  }
  if (items < VERDICT_TIERS.vip) {
    return {
      tier: 'waitlist',
      title: '恭喜！您已进入等候名单',
      message: `恭喜！您已成功入手 ${items} 件经典款（${money}），获得等候 Birkin 25 的名额（预计等待 3 年）。`
    };
  }
  return {
    tier: 'vip',
    title: '尊贵的 VIP',
    message: `尊贵的 VIP，品牌 CEO 亲自为您开门！您已买下 ${items} 件（${money}），击败全球 99% 的消费主义受害者！`
  };
}
