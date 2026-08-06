/**
 * Luxe Flux — 主页面逻辑整合（Phaser 引擎渲染版）
 *
 * 架构：React 仅负责「逻辑状态机 + HUD/UI 外壳」；
 * 棋盘渲染 / 动画 / 粒子 / 手势全部交给 Phaser（Canvas/WebGL）。
 *
 * 动画框架：将每次操作拆分为标准 Match-3 阶段状态机
 *   交换(swapping) → 消除(clearing) → 下落(falling) → 连消(cascade 循环)
 * 每个阶段由 React 计算新棋盘状态，并通过 ref 调用引擎播放对应动画；
 * 动画完成后继续下一阶段。busy 锁防止动画期间重复操作。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ShoppingCart, RotateCcw, Sparkles } from 'lucide-react';
import type { GameState, PowerUpType } from './types/game';
import {
  createInitialState,
  phaseSwap,
  phaseClear,
  phaseGravity,
  hasMatches,
  mergeBrandStats,
  useGreenChannel,
  useMarkup,
  useResell,
  POWER_UPS
} from './utils/gameLogic';
import { tapHaptic, powerUpHaptic, gameOverHaptic, playSound } from './utils/soundAndHaptics';
import Header from './components/Header';
import PowerUps from './components/PowerUps';
import GameOverModal from './components/GameOverModal';
import GameBoardBridge, { type GameBoardHandle } from './components/GameBoardBridge';

const IDLE_ANIM = { phase: 'idle' as const, swapping: [], clearing: [], cascade: 0 };

export default function App() {
  const [game, setGame] = useState<GameState>(() => createInitialState());
  const [powerUpUses, setPowerUpUses] = useState<Record<PowerUpType, number>>({
    greenChannel: POWER_UPS.greenChannel.uses,
    markup: POWER_UPS.markup.uses,
    resell: POWER_UPS.resell.uses
  });
  const [activePowerUp, setActivePowerUp] = useState<PowerUpType | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState(false);

  // Phaser 场景 ref
  const boardRef = useRef<GameBoardHandle>(null);

  // 最新状态 ref：让事件处理函数读到最新值，避免闭包过期
  const gameRef = useRef(game);
  gameRef.current = game;
  const usesRef = useRef(powerUpUses);
  usesRef.current = powerUpUses;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** 安全 setGame（组件卸载后忽略） */
  const safeSetGame = useCallback((updater: (g: GameState) => GameState) => {
    if (mountedRef.current) setGame(updater);
  }, []);

  /* ================================================================
   * 级联动画驱动：clearing → falling → (连消循环) → settle
   * ================================================================ */
  /** 结算（consumeMove: 交换触发的级联消耗步数；道具触发不消耗） */
  const settle = useCallback(
    (prev: GameState, consumeMove: boolean) => {
      const newMoves = consumeMove ? prev.moves - 1 : prev.moves;
      if (newMoves <= 0) {
        setCheckoutMode(false);
        setModalOpen(true);
        safeSetGame((g) => ({
          ...g,
          moves: 0,
          status: 'gameover',
          busy: false,
          animation: IDLE_ANIM
        }));
        return;
      }
      safeSetGame((g) => ({
        ...g,
        moves: newMoves,
        status: 'playing',
        busy: false,
        animation: IDLE_ANIM
      }));
    },
    [safeSetGame]
  );

  const runCascade = useCallback(
    (consumeMove: boolean) => {
      const prev = gameRef.current;
      const [afterClear, evt] = phaseClear(prev.board);
      if (!afterClear || !evt) {
        // 无匹配可消 → 结算
        settle(prev, consumeMove);
        return;
      }

      playSound('match');
      powerUpHaptic();
      if (evt.combo >= 2) gameOverHaptic(); // 连消成就感

      const newCombo = prev.animation.cascade + 1;
      const newScore = prev.score + evt.points;
      const newStats = mergeBrandStats(prev.brandStats, [evt]);
      const clearedIdx: number[] = [];
      for (let i = 0; i < afterClear.length; i++) {
        if (afterClear[i] === null && prev.board[i] !== null) clearedIdx.push(i);
      }

      safeSetGame((g) => ({
        ...g,
        board: afterClear,
        score: newScore,
        maxCombo: Math.max(g.maxCombo, newCombo),
        brandStats: newStats,
        animation: { phase: 'clearing', swapping: [], clearing: clearedIdx, cascade: newCombo }
      }));

      // 消除动画（引擎粒子爆破）→ 重力下落
      boardRef.current
        ?.playClear(clearedIdx, newCombo)
        .then(() => {
          if (!mountedRef.current) return;
          const cur = gameRef.current;
          const fallen = phaseGravity(cur.board, cur.tokenTypes);
          safeSetGame((g) => ({
            ...g,
            board: fallen,
            animation: { phase: 'falling', swapping: [], clearing: [], cascade: g.animation.cascade }
          }));
          // 引擎下落动画
          return boardRef.current?.playFall(fallen);
        })
        .then(() => {
          if (!mountedRef.current) return;
          const cur2 = gameRef.current;
          if (hasMatches(cur2.board)) {
            runCascade(consumeMove);
          } else {
            settle(cur2, consumeMove);
          }
        });
    },
    [safeSetGame, settle]
  );

  /** 交换两格（阶段化） */
  const handleSwap = useCallback(
    (from: number, to: number) => {
      const prev = gameRef.current;
      if (prev.busy || prev.status !== 'playing') return;

      const swapped = phaseSwap(prev.board, from, to);
      if (!swapped) {
        // 无效交换：交换滑动 → 抖动 → 复原，不消耗步数；busy 锁防止动画期间误触
        playSound('swap');
        tapHaptic();
        safeSetGame((g) => ({
          ...g,
          busy: true,
          animation: { phase: 'swapfail', swapping: [from, to], clearing: [], cascade: 0 }
        }));
        boardRef.current?.playSwapFail(from, to).then(() => {
          safeSetGame((g) =>
            g.animation.phase === 'swapfail'
              ? { ...g, busy: false, animation: IDLE_ANIM }
              : g
          );
        });
        return;
      }

      // 交换成功：滑动动画
      playSound('swap');
      tapHaptic();
      safeSetGame((g) => ({
        ...g,
        board: swapped,
        busy: true,
        animation: { phase: 'swapping', swapping: [from, to], clearing: [], cascade: 0 }
      }));

      // 引擎交换动画 → 进入消除/下落/连消（消耗 1 步）
      boardRef.current
        ?.playSwap(from, to)
        .then(() => {
          if (mountedRef.current) runCascade(true);
        })
        .catch(() => {
          /* 引擎未就绪时直接走逻辑 */
          if (mountedRef.current) runCascade(true);
        });
    },
    [runCascade, safeSetGame]
  );

  /** 使用道具 */
  const handleUsePowerUp = useCallback(
    (type: PowerUpType) => {
      const prev = gameRef.current;
      if (prev.busy || prev.status !== 'playing') return;
      if (usesRef.current[type] <= 0) return;

      if (type === 'greenChannel') {
        // 切换「指定模式」：等用户点格子
        setActivePowerUp((cur) => (cur === 'greenChannel' ? null : 'greenChannel'));
        powerUpHaptic();
        playSound('powerup');
        return;
      }

      // 立即型道具
      powerUpHaptic();
      playSound('powerup');
      setActivePowerUp(null);
      setPowerUpUses((u) => ({ ...u, [type]: u[type] - 1 }));

      if (type === 'markup') {
        const result = useMarkup(prev.board);
        safeSetGame((g) => ({
          ...g,
          board: result.board as GameState['board'],
          busy: false,
          animation: IDLE_ANIM
        }));
        boardRef.current?.syncBoard(result.board as GameState['board']);
        return;
      }
      // resell：洗牌
      const result = useResell(prev.board);
      safeSetGame((g) => ({
        ...g,
        board: result.board as GameState['board'],
        busy: false,
        animation: IDLE_ANIM
      }));
      boardRef.current?.syncBoard(result.board as GameState['board']);
    },
    [powerUpHaptic, playSound, safeSetGame]
  );

  /** Green Channel 指定中心格 */
  const handleGreenChannelTarget = useCallback(
    (centerIndex: number) => {
      const prev = gameRef.current;
      if (prev.busy || prev.status !== 'playing') return;
      if (usesRef.current.greenChannel <= 0) return;

      const result = useGreenChannel(prev.board, centerIndex);
      // 被消除的位置（result.board 中变 null 的格子）
      const clearedIdx: number[] = [];
      for (let i = 0; i < result.board.length; i++) {
        if (result.board[i] === null && prev.board[i] !== null) clearedIdx.push(i);
      }

      setActivePowerUp(null);
      setPowerUpUses((u) => ({ ...u, greenChannel: u.greenChannel - 1 }));
      playSound('powerup');
      powerUpHaptic();

      safeSetGame((g) => ({
        ...g,
        board: result.board as GameState['board'],
        busy: true,
        animation: { phase: 'clearing', swapping: [], clearing: clearedIdx, cascade: 0 }
      }));

      // 引擎 3×3 高亮 + 消除 → 重力下落 → 连消（道具不消耗步数）
      boardRef.current
        ?.pulseCells(clearedIdx)
        .then(() => {
          if (!mountedRef.current) return undefined;
          return boardRef.current?.playClear(clearedIdx, 0);
        })
        .then(() => {
          if (!mountedRef.current) return undefined;
          const cur = gameRef.current;
          const fallen = phaseGravity(cur.board, cur.tokenTypes);
          safeSetGame((g) => ({
            ...g,
            board: fallen,
            animation: { phase: 'falling', swapping: [], clearing: [], cascade: 0 }
          }));
          return boardRef.current?.playFall(fallen);
        })
        .then(() => {
          if (!mountedRef.current) return;
          const cur2 = gameRef.current;
          if (hasMatches(cur2.board)) {
            runCascade(false);
          } else {
            settle(cur2, false);
          }
        });
    },
    [powerUpHaptic, playSound, runCascade, safeSetGame, settle]
  );

  /** 结算按钮 */
  const handleCheckout = useCallback(() => {
    const prev = gameRef.current;
    if (prev.status !== 'playing') return;
    setCheckoutMode(true);
    setModalOpen(true);
    safeSetGame((g) => ({ ...g, status: 'checkout', busy: false, animation: IDLE_ANIM }));
  }, [safeSetGame]);

  /** 重新开始 */
  const handleRestart = useCallback(() => {
    const fresh = createInitialState();
    setGame(fresh);
    setPowerUpUses({
      greenChannel: POWER_UPS.greenChannel.uses,
      markup: POWER_UPS.markup.uses,
      resell: POWER_UPS.resell.uses
    });
    setActivePowerUp(null);
    setModalOpen(false);
    setCheckoutMode(false);
    // 引擎重建棋盘（下一渲染帧，确保场景就绪）
    requestAnimationFrame(() => {
      boardRef.current?.syncBoard(fresh.board);
    });
  }, []);

  /** 状态锁定：非 playing 时关闭道具 */
  useEffect(() => {
    if (game.status !== 'playing') setActivePowerUp(null);
  }, [game.status]);

  /** 点按处理：绿色通道模式 → 指定 3×3；普通模式 → 尝试与右/下邻居交换 */
  const handleTap = useCallback(
    (index: number) => {
      if (activePowerUp === 'greenChannel') {
        handleGreenChannelTarget(index);
        return;
      }
      const prev = gameRef.current;
      if (prev.busy || prev.status !== 'playing') return;
      const from = index;
      const isNeighbor = (i: number) =>
        i >= 0 &&
        i < game.rows * game.cols &&
        Math.abs(Math.floor(i / game.cols) - Math.floor(from / game.cols)) +
          Math.abs((i % game.cols) - (from % game.cols)) === 1;
      // 优先右/下（更符合直觉），无可用时回退左/上，保证任意格点按都有反馈
      const candidates = [from + 1, from + game.cols, from - 1, from - game.cols].filter(isNeighbor);
      const target = candidates[0];
      if (target !== undefined) {
        tapHaptic();
        handleSwap(from, target);
      }
    },
    [activePowerUp, game.cols, game.rows, handleGreenChannelTarget, handleSwap]
  );

  /** 初始棋盘同步：引擎就绪后渲染第一帧 */
  useEffect(() => {
    boardRef.current?.syncBoard(game.board);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-ink text-ivory">
      {/* 背景装饰 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-gold/10 blur-[100px]" />
        <div className="absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-gold/5 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col">
        {/* 顶栏 + 安全区域 */}
        <div className="pt-[max(env(safe-area-inset-top),0.75rem)]">
          <Header moves={game.moves} score={game.score} />
        </div>

        {/* 棋盘（Phaser 引擎） */}
        <main className="flex flex-1 flex-col px-3">
          <GameBoardBridge
            ref={boardRef}
            rows={game.rows}
            cols={game.cols}
            canSelect={game.status === 'playing' && !game.busy}
            onSwap={handleSwap}
            onTap={handleTap}
          />

          {/* Green Channel 提示 */}
          <AnimatePresence>
            {activePowerUp === 'greenChannel' && (
              <div className="mt-2 flex items-center justify-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5">
                <Sparkles className="h-3.5 w-3.5 text-gold-bright" />
                <span className="font-body text-xs text-gold-bright">
                  绿色通道已开启：点击棋盘任意格，消除其 3×3 范围
                </span>
              </div>
            )}
          </AnimatePresence>

          {/* 道具栏 */}
          <PowerUps
            uses={powerUpUses}
            active={activePowerUp}
            busy={game.busy}
            onUse={handleUsePowerUp}
          />
        </main>

        {/* Footer */}
        <footer className="px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-1">
          <div className="flex gap-3">
            <button
              onClick={handleRestart}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gold/30 bg-ink-soft px-4 py-3.5 font-body text-sm font-semibold text-ivory/80 transition hover:border-gold/60 hover:text-gold active:scale-95"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={2} />
              重新开始
            </button>
            <button
              onClick={handleCheckout}
              disabled={game.status !== 'playing'}
              className="flex flex-[1.6] items-center justify-center gap-2 rounded-xl bg-gold-gradient px-4 py-3.5 font-body text-sm font-bold text-ink shadow-gold-glow transition hover:brightness-110 active:scale-95 disabled:opacity-40"
            >
              <ShoppingCart className="h-4 w-4" strokeWidth={2.2} />
              结算 · ${game.score.toLocaleString()}
            </button>
          </div>
        </footer>
      </div>

      {/* 结算 Modal */}
      <GameOverModal
        open={modalOpen}
        score={game.score}
        maxCombo={game.maxCombo}
        isCheckout={checkoutMode}
        brandStats={game.brandStats}
        onPlayAgain={handleRestart}
      />
    </div>
  );
}
