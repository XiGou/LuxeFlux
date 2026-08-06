/**
 * GameBoardBridge — Phaser 游戏引擎挂载桥
 *
 * 用一个占满的 <canvas> 容器承载 Phaser.Game，替代原 React DOM 棋盘渲染。
 * 对外暴露 ref API：
 *   syncBoard / playSwap / playSwapFail / playClear / playFall / pulseCells / destroy
 * 由 App 的逻辑状态机在合适阶段调用；手势回调（onSwap / onTap）回传 React。
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import Phaser from 'phaser';
import type { Board } from '../types/game';
import Match3Scene, {
  SCENE_KEY,
  INTERACTIVE,
  SCENE_CONFIG
} from '../game/Match3Scene';

export interface GameBoardHandle {
  syncBoard: (board: Board) => void;
  playSwap: (from: number, to: number) => Promise<void>;
  playSwapFail: (from: number, to: number) => Promise<void>;
  playClear: (indices: number[], cascade: number) => Promise<void>;
  playFall: (board: Board) => Promise<void>;
  pulseCells: (indices: number[]) => Promise<void>;
  destroy: () => void;
}

interface GameBoardBridgeProps {
  rows: number;
  cols: number;
  canSelect: boolean;
  onSwap: (from: number, to: number) => void;
  onTap: (index: number) => void;
}

const GameBoardBridge = forwardRef<GameBoardHandle, GameBoardBridgeProps>(
  ({ rows, cols, canSelect, onSwap, onTap }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const gameRef = useRef<Phaser.Game | null>(null);
    const sceneRef = useRef<Match3Scene | null>(null);
    const cbRef = useRef({ onSwap, onTap });
    cbRef.current = { onSwap, onTap };
    const aliveRef = useRef(true);
    aliveRef.current = true;

    /* ---------- 初始化 Phaser ---------- */
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      // 写入场景配置（Phaser 场景 init 时读取）
      SCENE_CONFIG.current = {
        rows,
        cols,
        onSwap: (from: number, to: number) => cbRef.current.onSwap(from, to),
        onTap: (index: number) => cbRef.current.onTap(index)
      };

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: el,
        transparent: true,
        scale: {
          mode: Phaser.Scale.NONE,
          width: el.clientWidth,
          height: el.clientHeight,
          autoRound: true
        },
        scene: [Match3Scene],
        render: { antialias: true, roundPixels: true, powerPreference: 'high-performance' },
        input: { activePointers: 3 },
        disableContextMenu: true
      });

      gameRef.current = game;
      game.events.once(Phaser.Core.Events.READY, () => {
        sceneRef.current = game.scene.getScene(SCENE_KEY) as Match3Scene;
      });

      // 容器尺寸变化（旋转 / 窗口缩放）时同步 Phaser 画布
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            game.scale.resize(width, height);
          }
        }
      });
      ro.observe(el);

      return () => {
        aliveRef.current = false;
        ro.disconnect();
        sceneRef.current = null;
        game.destroy(true);
        gameRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ---------- 可交互状态同步 ---------- */
    useEffect(() => {
      INTERACTIVE.value = canSelect;
    }, [canSelect]);

    /* ---------- ref API ---------- */
    useImperativeHandle(
      ref,
      () => {
        const scene = () => sceneRef.current;
        const ready = (): Promise<Match3Scene> =>
          new Promise((resolve) => {
            const s = scene();
            if (s) return resolve(s);
            const t = window.setInterval(() => {
              if (!aliveRef.current) {
                window.clearInterval(t);
                return;
              }
              const s2 = scene();
              if (s2) {
                window.clearInterval(t);
                resolve(s2);
              }
            }, 16);
          });

        return {
          syncBoard: (board: Board) => {
            ready().then((s) => s.syncBoard(board));
          },
          playSwap: (from: number, to: number) =>
            ready().then((s) => s.playSwap(from, to)),
          playSwapFail: (from: number, to: number) =>
            ready().then((s) => s.playSwapFail(from, to)),
          playClear: (indices: number[], cascade: number) =>
            ready().then((s) => s.playClear(indices, cascade)),
          playFall: (board: Board) => ready().then((s) => s.playFall(board)),
          pulseCells: (indices: number[]) =>
            ready().then((s) => s.pulseCells(indices)),
          destroy: () => {
            const s = scene();
            if (s) s.destroyAll();
          }
        };
      },
      []
    );

    return (
      <div
        ref={containerRef}
        className="relative mx-auto w-full max-w-[420px] select-none touch-none"
        style={{ aspectRatio: `${cols}/${rows}` }}
        aria-label="游戏棋盘"
      >
        {/* 兜底 loading（引擎就绪前占位） */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-gold/40">
          <span className="font-body text-xs uppercase tracking-[0.3em]">Loading…</span>
        </div>
      </div>
    );
  }
);

GameBoardBridge.displayName = 'GameBoardBridge';
export default GameBoardBridge;
