/**
 * GameBoard — 8×8 棋盘
 *
 * 动画框架：将一次交换拆分为标准 Match-3 阶段（参考主流消消乐引擎）：
 *   1. swapping — 两格交换：保留元素 id，通过 Framer Motion `layout`
 *      FLIP 动画让元素平滑滑动到对方位置（不再闪现）。
 *   2. clearing  — 匹配消除：命中格变为空位，元素缩小淡出（pop），
 *      并对动画目标格（如道具升级）叠加金色脉冲。
 *   3. falling   — 重力下落：下落格保留 id（layout 平滑下落），
 *      顶部新元素带 id 从上方落入。
 *   4. cascade   — 连消循环：App 侧驱动，直到盘面稳定。
 *
 * 支持 Touch / Mouse 点击与滑动（Swipe）手势交换；
 * 交换失败时对两格做 shake 反馈。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Board, GameAnimation } from '../types/game';
import { ROWS, COLS, rowOf, colOf } from '../utils/gameLogic';
import { tapHaptic, powerUpHaptic } from '../utils/soundAndHaptics';
import TokenFace from './TokenFace';

interface GameBoardProps {
  board: Board;
  busy: boolean;
  /** 是否可落子（无解时闪烁提示 / 非 playing 时禁用） */
  canSelect: boolean;
  onSwap: (from: number, to: number) => void;
  /** Green Channel 道具启用中：点格子指定 3×3 */
  greenChannelActive: boolean;
  onGreenChannel: (centerIndex: number) => void;
  /** 动画阶段（App 驱动） */
  animation: GameAnimation;
}

interface DragState {
  startIndex: number;
  pointerX: number;
  pointerY: number;
}

export default function GameBoard({
  board,
  busy,
  canSelect,
  onSwap,
  greenChannelActive,
  onGreenChannel,
  animation
}: GameBoardProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [swapPreview, setSwapPreview] = useState<[number, number] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(0);

  /* ---------- 响应式棋盘尺寸 ---------- */
  useEffect(() => {
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      setCellSize(el.clientWidth / COLS);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  /* ---------- 手势判定：点击 vs 滑动 ---------- */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, index: number) => {
      if (busy || !canSelect) return;
      // Green Channel 模式：点击即指定中心
      if (greenChannelActive) {
        powerUpHaptic();
        onGreenChannel(index);
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ startIndex: index, pointerX: e.clientX, pointerY: e.clientY });
    },
    [busy, canSelect, greenChannelActive, onGreenChannel]
  );

  const handlePointerMove = useCallback(
    (ev: React.PointerEvent) => {
      if (!drag) return;
      const dx = ev.clientX - drag.pointerX;
      const dy = ev.clientY - drag.pointerY;
      const THRESHOLD = cellSize * 0.4;
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;

      const from = drag.startIndex;
      let to: number | null = null;
      if (Math.abs(dx) > Math.abs(dy)) {
        to = dx > 0 ? from + 1 : from - 1;
      } else {
        to = dy > 0 ? from + COLS : from - COLS;
      }
      if (
        to !== null &&
        to >= 0 &&
        to < ROWS * COLS &&
        Math.abs(rowOf(to) - rowOf(from)) + Math.abs(colOf(to) - colOf(from)) === 1
      ) {
        setSwapPreview([from, to]);
        setDrag(null);
        tapHaptic();
        onSwap(from, to);
      } else {
        setDrag(null);
      }
    },
    [drag, cellSize, onSwap]
  );

  const handlePointerUp = useCallback(
    (_e: React.PointerEvent, index: number) => {
      // 未滑动即视为点击 → 尝试与右/下邻居交换（符合常见操作习惯）
      if (drag && drag.startIndex === index && !swapPreview) {
        const from = index;
        const candidates = [from + 1, from + COLS].filter(
          (i) =>
            i < ROWS * COLS &&
            Math.abs(rowOf(i) - rowOf(from)) + Math.abs(colOf(i) - colOf(from)) === 1
        );
        const target = candidates[0];
        if (target !== undefined) {
          tapHaptic();
          onSwap(from, target);
        }
      }
      setDrag(null);
    },
    [drag, swapPreview, onSwap]
  );

  const clearPreview = useCallback(() => setSwapPreview(null), []);

  const isSwappingCell = (i: number) =>
    animation.phase === 'swapping' && animation.swapping.includes(i);
  const isSwapFailCell = (i: number) =>
    animation.phase === 'swapfail' && animation.swapping.includes(i);
  const isClearingTarget = (i: number) =>
    animation.phase === 'clearing' && animation.clearing.includes(i);

  /* ---------- 渲染 ---------- */
  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full max-w-[420px] select-none touch-none"
      style={{ aspectRatio: `${COLS}/${ROWS}` }}
      onPointerLeave={clearPreview}
    >
      {/* 金属底盘 */}
      <div className="absolute inset-0 rounded-2xl border border-gold/20 bg-gradient-to-b from-ink-panel to-ink shadow-[inset_0_2px_18px_rgba(0,0,0,0.9),0_0_0_1px_rgba(212,175,55,0.08)]">
        {/* 内嵌网格线 */}
        <div
          className="absolute inset-1 rounded-xl opacity-60"
          style={{
            backgroundImage:
              'linear-gradient(rgba(212,175,55,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.07) 1px, transparent 1px)',
            backgroundSize: `${cellSize}px ${cellSize}px`
          }}
        />
      </div>

      {/* 格子层 */}
      <div
        className="absolute inset-0 grid"
        style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`
        }}
      >
        <AnimatePresence>
          {board.map((cell, i) =>
            cell ? (
              <motion.button
                key={cell.id}
                layout
                initial={{ scale: 0.5, opacity: 0, y: -cellSize }}
                animate={{
                  scale: 1,
                  opacity: 1,
                  y: 0,
                  transition: { type: 'spring', stiffness: 380, damping: 26 }
                }}
                exit={{
                  scale: 0.15,
                  opacity: 0,
                  y: 0,
                  transition: { duration: 0.18, ease: 'easeIn' }
                }}
                transition={{ layout: { type: 'spring', stiffness: 320, damping: 32 } }}
                className={`relative m-[3px] cursor-pointer rounded-lg border border-white/[0.06] bg-ink-soft shadow-metal-cell outline-none focus:border-gold/60 ${
                  isSwapFailCell(i) ? 'animate-shake' : ''
                } ${isSwappingCell(i) ? 'z-10' : ''}`}
                style={{
                  gridRow: rowOf(i) + 1,
                  gridColumn: colOf(i) + 1,
                  touchAction: 'none'
                }}
                onPointerDown={(e) => handlePointerDown(e, i)}
                onPointerMove={handlePointerMove}
                onPointerUp={(e) => handlePointerUp(e, i)}
                whileTap={{ scale: 0.92 }}
                aria-label={`格子 ${rowOf(i) + 1}-${colOf(i) + 1}`}
              >
                <TokenFace cell={cell} />
                {/* 交换中的两格：金色描边高亮 */}
                {isSwappingCell(i) && (
                  <motion.span
                    layoutId="swap-glow"
                    className="pointer-events-none absolute inset-0 rounded-lg border-2 border-gold-bright/90 shadow-gold-glow"
                  />
                )}
                {/* 消除 / 升级目标：金色脉冲 */}
                {isClearingTarget(i) && (
                  <motion.span
                    initial={{ opacity: 0.9, scale: 0.7 }}
                    animate={{ opacity: 0, scale: 1.6 }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                    className="pointer-events-none absolute inset-0 rounded-lg bg-gold-glow"
                  />
                )}
                {/* 交换预览高亮 */}
                {swapPreview?.includes(i) && (
                  <motion.span
                    layoutId="swap-glow"
                    className="pointer-events-none absolute inset-0 rounded-lg bg-gold-glow"
                  />
                )}
              </motion.button>
            ) : (
              // 空位（消除动画期间）
              <div key={`hole-${i}`} className="m-[3px] rounded-lg bg-black/30" />
            )
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
