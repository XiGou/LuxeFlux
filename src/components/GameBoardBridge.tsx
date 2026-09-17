/**
 * GameBoardBridge — Phaser 游戏引擎挂载桥
 *
 * 用一个占满的 <canvas> 容器承载 Phaser.Game，替代原 React DOM 棋盘渲染。
 * 对外暴露 ref API：
 *   syncBoard / playSwap / playSwapFail / playClear / playFall / pulseCells / destroy
 * 由 App 的逻辑状态机在合适阶段调用；手势回调（onSwap / onTap）回传 React。
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Phaser from 'phaser';
import type { Board } from '../types/game';
import Match3Scene, {
  SCENE_KEY,
  INTERACTIVE,
  SCENE_CONFIG,
  SCENE_READY
} from '../game/Match3Scene';

/**
 * 渲染分辨率倍率（HiDPI 适配）
 * 画布后备存储按设备像素创建（width * DPR），再用 zoom = 1/DPR 把 CSS 尺寸缩回，
 * 否则在 2x/3x 屏上画布会被浏览器整体放大 → 所有 tile 都发虚。
 * 上限 2，兼顾清晰度与移动端 GPU 填充率。
 */
function renderScale(): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.min(Math.max(dpr, 1), 2);
}

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
    /** 引擎 + 品牌素材是否就绪（就绪后 loading 淡出） */
    const [ready, setReady] = useState(false);

    /* ---------- 初始化 Phaser ---------- */
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      // 重新标记存活（StrictMode 下 effect 会 挂载→卸载→重挂载，
      // 卸载阶段的 cleanup 会把 aliveRef 置为 false，这里必须重新置 true，
      // 否则 ready() 的轮询会因 alive=false 提前放弃，棋盘永远不渲染）
      aliveRef.current = true;

      // 写入场景配置（Phaser 场景 init 时读取）
      SCENE_CONFIG.current = {
        rows,
        cols,
        onSwap: (from: number, to: number) => cbRef.current.onSwap(from, to),
        onTap: (index: number) => cbRef.current.onTap(index)
      };

      const dpr = renderScale();
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: el,
        transparent: true,
        scale: {
          mode: Phaser.Scale.NONE,
          // 后备存储用设备像素，CSS 尺寸靠 zoom 缩回 → HiDPI 下不再模糊
          width: Math.max(1, Math.round(el.clientWidth * dpr)),
          height: Math.max(1, Math.round(el.clientHeight * dpr)),
          zoom: 1 / dpr,
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

      // 场景 + 素材就绪 → 关闭 loading（可能已就绪，则立即关闭）
      const onSceneReady = () => {
        if (aliveRef.current) setReady(true);
      };
      if (SCENE_READY.done) {
        onSceneReady();
      } else {
        SCENE_READY.callbacks.add(onSceneReady);
      }

      // 容器尺寸变化（旋转 / 窗口缩放）时同步 Phaser 画布
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            game.scale.resize(
              Math.max(1, Math.round(width * dpr)),
              Math.max(1, Math.round(height * dpr))
            );
          }
        }
      });
      ro.observe(el);

      return () => {
        aliveRef.current = false;
        SCENE_READY.callbacks.delete(onSceneReady);
        ro.disconnect();
        sceneRef.current = null;
        game.destroy(true);
        gameRef.current = null;
        setReady(false);
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
        className="relative mx-auto w-full max-w-[420px] select-none touch-none rounded-[18px] border border-gold/70 bg-cream-panel shadow-card-soft"
        style={{ aspectRatio: `${cols}/${rows}` }}
        aria-label="游戏棋盘"
      >
        {/* loading：引擎 + 品牌素材就绪后淡出（不遮挡棋盘） */}
        <div
          className={`pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 transition-opacity duration-500 ${
            ready ? 'opacity-0' : 'opacity-100'
          }`}
          aria-hidden={ready}
        >
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-gold/40 border-t-gold-deep" />
          <span className="font-body text-[10px] uppercase tracking-[0.3em] text-gold-darker">
            Loading
          </span>
        </div>
      </div>
    );
  }
);

GameBoardBridge.displayName = 'GameBoardBridge';
export default GameBoardBridge;
