// Quick smoke test for Luxe Flux game logic (run with: node --experimental-strip-types or via tsx)
// We'll import via tsx-style — simpler: use a compiled check through vite-node is overkill,
// so this runs through `npx tsx`.
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
  ROWS,
  COLS,
  createInitialState
} from '../src/utils/gameLogic';
import type { Cell } from '../src/types/game';

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

// 1. generateBoard: no initial matches, full board, has valid move
for (let i = 0; i < 200; i++) {
  const b = generateBoard();
  assert(!hasMatches(b), `generate no-match #${i}`);
  assert(complete(b), `generate full board #${i}`);
  assert(hasValidMove(b), `generate has valid move #${i}`);
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
        const [nb, points, cascades] = processSwap(b, from, to);
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

// 3. clearMatches directly: ensure no infinite & board integrity after gravity
for (let i = 0; i < 100; i++) {
  const b = generateBoard();
  // force a match by overwriting 3 in a row
  const forced = b.slice();
  forced[0] = { ...forced[0], id: 'f0', type: 'bag', limited: false, bomb: false };
  forced[1] = { ...forced[1], id: 'f1', type: 'bag', limited: false, bomb: false };
  forced[2] = { ...forced[2], id: 'f2', type: 'bag', limited: false, bomb: false };
  const [afterClear, evt] = clearMatches(forced);
  assert(hasHoles(afterClear) || afterClear.length === ROWS * COLS, 'clear produces holes or full');
  assert(evt.points > 0, `clear points > 0 got ${evt.points}`);
  const grav = applyGravity(afterClear);
  assert(complete(grav), 'gravity fills board');
}

// 4. powerups
for (let i = 0; i < 50; i++) {
  const b = generateBoard();
  const gc = useGreenChannel(b, 27); // center-ish (3,3)
  assert(gc.cleared && gc.cleared.length === 9, 'green channel clears 9 cells');
  const [nb, pts, casc] = processPowerUp(b, gc);
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
assert(st.status === 'playing', 'start status playing');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
