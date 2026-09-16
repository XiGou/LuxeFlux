// Quick smoke test for Luxe Flux game logic (run with: npx tsx)
import {
  generateBoard,
  hasMatches,
  hasValidMove,
  processSwap,
  processPowerUp,
  useGreenChannel,
  useMarkup,
  useResell,
  applyGravity,
  hasHoles,
  clearMatches,
  unitsOf,
  priceOf,
  verdict,
  UNIT_PRICE,
  ROWS,
  COLS,
  createInitialState,
  mergeBrandStats,
  toBrandStatsList,
  emptyBrandStats
} from '../src/utils/gameLogic';
import { TOKEN_POOL } from '../src/utils/brands';
import { sampleTokenTypes as sampleTypes } from '../src/utils/brands';
import type { Cell, TokenType } from '../src/types/game';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('  ✗ FAIL:', msg);
  }
}

function complete(board: (Cell | null)[]): board is Cell[] {
  return board.length === ROWS * COLS && board.every((c) => c !== null);
}

// 0. brand pool & sampling
assert(TOKEN_POOL.length >= 6, 'brand pool >= 6');
for (let i = 0; i < 50; i++) {
  const s = sampleTypes();
  assert(s.length === 6, `sample size 6 (#${i})`);
  assert(new Set(s).size === 6, `sample unique (#${i})`);
  for (const t of s) assert(TOKEN_POOL.includes(t), `sample in pool (#${i})`);
}

// 1. generateBoard: no initial matches, full board, has valid move
for (let i = 0; i < 200; i++) {
  const b = generateBoard();
  assert(!hasMatches(b), `generate no-match #${i}`);
  assert(complete(b), `generate full board #${i}`);
  assert(hasValidMove(b), `generate has valid move #${i}`);
  // brand consistent
  assert(b.every((c) => c.brand === c.type), `brand===type #${i}`);
}

// 2. processSwap with a known-good move: brute force find one and run
let swapTested = 0;
let cascadesMax = 0;
for (let i = 0; i < 500 && swapTested < 120; i++) {
  const b = generateBoard();
  let done = false;
  for (let r = 0; r < ROWS && !done; r++) {
    for (let c = 0; c < COLS && !done; c++) {
      const from = r * COLS + c;
      const neighbors = [];
      if (c + 1 < COLS) neighbors.push(from + 1);
      if (r + 1 < ROWS) neighbors.push(from + COLS);
      for (const to of neighbors) {
        const [nb, points, cascades] = processSwap(b, from, to, getTypes(b));
        if (points > 0) {
          assert(complete(nb), `swap board full (#${i})`);
          assert(!hasMatches(nb), `swap board no leftover match (#${i})`);
          assert(points >= 1980, `swap points >= base (#${i}) got ${points}`);
          swapTested++;
          cascadesMax = Math.max(cascadesMax, cascades);
          done = true;
          break;
        }
      }
    }
  }
}
console.log(`  swap tested: ${swapTested}, max cascade: ${cascadesMax}`);
assert(swapTested > 50, 'enough successful swaps exercised');

// 2b. 统一单价计分：金额恒为「件数 × 单价」
{
  const b = generateBoard();
  const sw = findSwap(b);
  if (sw) {
    const [, points, , events] = processSwap(b, sw[0], sw[1], getTypes(b));
    const units = events.reduce((s, e) => s + e.units, 0);
    assert(points === priceOf(units), `points === units × ${UNIT_PRICE} (${points} vs ${priceOf(units)})`);
    assert(points % UNIT_PRICE === 0, 'points is a whole number of items');
    assert(
      events.every((e) => e.units >= e.matched),
      'units >= matched cells (limited edition counts twice)'
    );
  }
  // 限量版「买一配一」计 2 件
  const limitedCells: Cell[] = [
    { id: 'a', type: 'chanel', limited: true, bomb: false, brand: 'chanel' },
    { id: 'b', type: 'chanel', limited: false, bomb: false, brand: 'chanel' }
  ];
  assert(unitsOf(limitedCells) === 3, 'limited cell counts as 2 items');
  assert(priceOf(3) === 3 * UNIT_PRICE, 'priceOf = units × unit price');
}

// 2c. 结算评语按件数分档
{
  assert(verdict(0).tier === 'cold', 'verdict cold');
  assert(verdict(59).tier === 'cold', 'verdict cold at 59 items');
  assert(verdict(60).tier === 'waitlist', 'verdict waitlist at 60 items');
  assert(verdict(119).tier === 'waitlist', 'verdict waitlist at 119 items');
  assert(verdict(120).tier === 'vip', 'verdict vip at 120 items');
  assert(verdict(120).message.includes(String(120)), 'verdict message shows item count');
}

// 3. clearMatches directly: ensure no infinite & board integrity after gravity
for (let i = 0; i < 100; i++) {
  const b = generateBoard();
  // force a match by overwriting 3 in a row
  const forced = b.slice();
  const t0 = forced[0].type;
  forced[0] = { ...forced[0], id: 'f0', type: t0, limited: false, bomb: false };
  forced[1] = { ...forced[1], id: 'f1', type: t0, limited: false, bomb: false };
  forced[2] = { ...forced[2], id: 'f2', type: t0, limited: false, bomb: false };
  const [afterClear, evt] = clearMatches(forced);
  assert(hasHoles(afterClear) || afterClear.length === ROWS * COLS, 'clear produces holes or full');
  assert(evt.points > 0, `clear points > 0 got ${evt.points}`);
  const grav = applyGravity(afterClear);
  assert(complete(grav), 'gravity fills board');
  assert(grav.every((c) => c.brand === c.type), 'gravity brand===type');
}

// 4. powerups
for (let i = 0; i < 50; i++) {
  const b = generateBoard();
  const gc = useGreenChannel(b, 27); // center-ish (3,3)
  assert(gc.cleared && gc.cleared.length === 9, 'green channel clears 9 cells');
  const [nb, pts, casc] = processPowerUp(b, gc, getTypes(b));
  assert(complete(nb), 'green channel board complete');
  assert(pts >= 9 * 1980, 'green channel min points');

  const mk = useMarkup(b);
  const limitedCount = (mk.board as Cell[]).filter((c) => c.limited).length;
  assert(limitedCount > 0, 'markup upgrades at least one cell');

  const rs = useResell(b);
  assert(!hasMatches(rs.board as Cell[]), 'resell no initial match');
  assert(hasValidMove(rs.board as Cell[]), 'resell has valid move');
}

// 5. initial state
const st = createInitialState();
assert(st.moves === 15, 'start moves 15');
assert(st.score === 0, 'start score 0');
assert(st.items === 0, 'start items 0');
assert(st.status === 'playing', 'start status playing');
assert(st.tokenTypes.length === 6, 'start token types 6');
assert(st.animation.phase === 'idle', 'start animation idle');

// 6. brand stats
for (let i = 0; i < 30; i++) {
  const b = generateBoard();
  const sw = findSwap(b);
  if (!sw) continue;
  const [, , , events] = processSwap(b, sw[0], sw[1], getTypes(b));
  if (events.length > 0) {
    const stats = mergeBrandStats(emptyBrandStats(b.map((c) => c.type) as never), events);
    const total = events.reduce((s, e) => s + e.cells.length, 0);
    const sum = Object.values(stats).reduce((s, n) => s + n, 0);
    assert(sum === total, `brand stats sum equals cleared (#${i}) ${sum} vs ${total}`);
    const list = toBrandStatsList(stats);
    for (let j = 1; j < list.length; j++) {
      assert(list[j - 1].count >= list[j].count, 'brand list sorted desc');
    }
    assert(list.every((x) => x.count > 0), 'brand list only positive');
    assert(
      list.every((x) => x.subtotal === priceOf(x.count)),
      'brand subtotal = count × unit price'
    );
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

function getTypes(b: Cell[]): TokenType[] {
  return Array.from(new Set(b.map((c) => c.type)));
}

function findSwap(b: Cell[]): [number, number] | null {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const from = r * COLS + c;
      const neighbors = [];
      if (c + 1 < COLS) neighbors.push(from + 1);
      if (r + 1 < ROWS) neighbors.push(from + COLS);
      for (const to of neighbors) {
        const [nb, points] = processSwap(b, from, to, getTypes(b));
        if (points > 0) return [from, to];
      }
    }
  }
  return null;
}
