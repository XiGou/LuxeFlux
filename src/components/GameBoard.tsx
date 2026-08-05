/**
 * GameBoard — 8×8 棋盤
 * - Framer Motion layout 動畫：交換 / 消除 / 重力下落
 * - 支援 Touch / Mouse 點擊與滑動（Swipe）手勢交換
 * - 消除與道具呼叫原生 Haptics 震動
 * - 選中 Green Channel 道具時，點擊格子觸發 3×3 消除
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Cell } from '../types/game';
import { ROWS, COLS, rowOf, colOf } from '../utils/gameLogic';
import { tapHaptic, powerUpHaptic } from '../utils/soundAndHaptics';
import TokenFace from './TokenFace';

interface GameBoardProps {
  board: Cell[];
  busy: boolean;
  /** 是否有可落子的位置（無解時閃爍提示） */
  canSelect: boolean;
  onSwap: (from: number, to: number) => void;
  /** Green Channel 道具啟用中：點格子指定 3×3 */
  greenChannelActive: boolean;
  onGreenChannel: (centerIndex: number) => void;
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
  onGreenChannel
}: GameBoardProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [swapPreview, setSwapPreview] = useState<[number, number] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(0);

  /* ---------- 響應式棋盤尺寸 ---------- */
  useEffect(() => {
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      const w = el.clientWidth;
      setCellSize(w / COLS);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  /* ---------- 手勢判定：點擊 vs 滑動 ---------- */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, index: number) => {
      if (busy || !canSelect) return;
      // Green Channel 模式：點擊即指定中心
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
      if (to !== null && to >= 0 && to < ROWS * COLS && Math.abs(rowOf(to) - rowOf(from)) + Math.abs(colOf(to) - colOf(from)) === 1) {
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
      // 未滑動即視為點擊 → 嘗試與右/下鄰居交換（符合常見操作習慣）
      if (drag && drag.startIndex === index && !swapPreview) {
        const from = index;
        const candidates = [from + 1, from + COLS].filter(
          (i) => i < ROWS * COLS && Math.abs(rowOf(i) - rowOf(from)) + Math.abs(colOf(i) - colOf(from)) === 1
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

  /* ---------- 渲染 ---------- */
  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full max-w-[420px] select-none touch-none"
      style={{ aspectRatio: `${COLS}/${ROWS}` }}
      onPointerLeave={clearPreview}
    >
      {/* 金屬底盤 */}
      <div
        className="absolute inset-0 rounded-2xl border border-gold/20 bg-gradient-to-b from-ink-panel to-ink shadow-[inset_0_2px_18px_rgba(0,0,0,0.9),0_0_0_1px_rgba(212,175,55,0.08)]"
      >
        {/* 內嵌網格線 */}
        <div
          className="absolute inset-1 rounded-xl opacity-60"
          style={{
            backgroundImage:
              'linear-gradient(rgba(212,175,55,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.07) 1px, transparent 1px)',
            backgroundSize: `${cellSize}px ${cellSize}px`
          }}
        />
      </div>

      {/* 格子層 */}
      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}>
        <AnimatePresence>
          {board.map((cell, i) =>
            cell ? (
              <motion.button
                key={cell.id}
                layout
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{
                  scale: 1,
                  opacity: 1,
                  transition: { type: 'spring', stiffness: 380, damping: 26 }
                }}
                exit={{
                  scale: 0.2,
                  opacity: 0,
                  transition: { duration: 0.16 }
                }}
                transition={{ layout: { type: 'spring', stiffness: 300, damping: 30 } }}
                className="relative m-[3px] cursor-pointer rounded-lg border border-white/[0.06] bg-ink-soft shadow-metal-cell outline-none focus:border-gold/60"
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
                {/* 交換預覽高亮 */}
                {swapPreview?.includes(i) && (
                  <motion.span
                    layoutId="swap-glow"
                    className="pointer-events-none absolute inset-0 rounded-lg bg-gold-glow"
                  />
                )}
              </motion.button>
            ) : (
              // 空位（消除動畫期間的過渡）
              <div key={`hole-${i}`} className="m-[3px] rounded-lg bg-black/30" />
            )
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
