/**
 * Luxe Flux — 主頁面邏輯整合
 * 狀態管理 + 道具使用 + 步數/結算 + Footer
 *
 * 注意：所有 side-effect（震動/音效/開啟 Modal）都放在 state updater 之外，
 * 避免 React StrictMode 下 updater 被二次執行造成重複觸發。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ShoppingCart, RotateCcw, Sparkles } from 'lucide-react';
import type { GameState, PowerUpType } from './types/game';
import {
  createInitialState,
  processSwap,
  processPowerUp,
  useGreenChannel,
  useMarkup,
  useResell,
  POWER_UPS
} from './utils/gameLogic';
import { tapHaptic, powerUpHaptic, gameOverHaptic, playSound } from './utils/soundAndHaptics';
import Header from './components/Header';
import GameBoard from './components/GameBoard';
import PowerUps from './components/PowerUps';
import GameOverModal from './components/GameOverModal';

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

  // 最新狀態 ref：讓事件處理函式讀到最新值，避免閉包過期
  const gameRef = useRef(game);
  gameRef.current = game;
  const usesRef = useRef(powerUpUses);
  usesRef.current = powerUpUses;

  /** 交換兩格 */
  const handleSwap = useCallback((from: number, to: number) => {
    const prev = gameRef.current;
    if (prev.busy || prev.status !== 'playing') return;

    const [board, points, cascades] = processSwap(prev.board, from, to);
    if (points === 0 && cascades === 0) {
      // 無效交換：輕微回饋，不消耗步數
      return;
    }

    playSound('swap');
    tapHaptic();
    if (cascades >= 2) gameOverHaptic(); // 連消成就感

    const newMoves = prev.moves - 1;
    const newScore = prev.score + points;
    const newMaxCombo = Math.max(prev.maxCombo, cascades);

    if (newMoves <= 0) {
      setCheckoutMode(false);
      setModalOpen(true);
      setGame({
        ...prev,
        board,
        moves: 0,
        score: newScore,
        status: 'gameover',
        maxCombo: newMaxCombo,
        busy: false
      });
      return;
    }
    setGame({
      ...prev,
      board,
      moves: newMoves,
      score: newScore,
      status: 'playing',
      maxCombo: newMaxCombo,
      busy: false
    });
  }, []);

  /** 使用道具 */
  const handleUsePowerUp = useCallback((type: PowerUpType) => {
    const prev = gameRef.current;
    if (prev.busy || prev.status !== 'playing') return;
    if (usesRef.current[type] <= 0) return;

    if (type === 'greenChannel') {
      // 切換「指定模式」：等使用者點格子
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

    const result = type === 'markup' ? useMarkup(prev.board) : useResell(prev.board);
    const [board, points, cascades] = processPowerUp(prev.board, result);
    setGame({
      ...prev,
      board,
      score: prev.score + points,
      moves: prev.moves,
      status: 'playing',
      maxCombo: Math.max(prev.maxCombo, cascades),
      busy: false
    });
  }, []);

  /** Green Channel 指定中心格 */
  const handleGreenChannelTarget = useCallback((centerIndex: number) => {
    const prev = gameRef.current;
    if (prev.busy || prev.status !== 'playing') return;
    if (usesRef.current.greenChannel <= 0) return;

    const result = useGreenChannel(prev.board, centerIndex);
    const [board, points, cascades] = processPowerUp(prev.board, result);

    setActivePowerUp(null);
    setPowerUpUses((u) => ({ ...u, greenChannel: u.greenChannel - 1 }));
    playSound('powerup');
    setGame({
      ...prev,
      board,
      score: prev.score + points,
      moves: prev.moves,
      status: 'playing',
      maxCombo: Math.max(prev.maxCombo, cascades),
      busy: false
    });
  }, []);

  /** 結帳按鈕 */
  const handleCheckout = useCallback(() => {
    const prev = gameRef.current;
    if (prev.status !== 'playing') return;
    setCheckoutMode(true);
    setModalOpen(true);
    setGame({ ...prev, status: 'checkout', busy: false });
  }, []);

  /** 重新開始 */
  const handleRestart = useCallback(() => {
    setGame(createInitialState());
    setPowerUpUses({
      greenChannel: POWER_UPS.greenChannel.uses,
      markup: POWER_UPS.markup.uses,
      resell: POWER_UPS.resell.uses
    });
    setActivePowerUp(null);
    setModalOpen(false);
    setCheckoutMode(false);
  }, []);

  /** 狀態鎖定：非 playing 時關閉道具 */
  useEffect(() => {
    if (game.status !== 'playing') setActivePowerUp(null);
  }, [game.status]);

  return (
    <div className="flex min-h-screen flex-col bg-ink text-ivory">
      {/* 背景裝飾 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-gold/10 blur-[100px]" />
        <div className="absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-gold/5 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col">
        {/* 頂欄 + 安全區域 */}
        <div className="pt-[max(env(safe-area-inset-top),0.75rem)]">
          <Header moves={game.moves} score={game.score} />
        </div>

        {/* 棋盤 */}
        <main className="flex flex-1 flex-col px-3">
          <GameBoard
            board={game.board}
            busy={game.busy}
            canSelect={game.status === 'playing' && !game.busy}
            onSwap={handleSwap}
            greenChannelActive={activePowerUp === 'greenChannel'}
            onGreenChannel={handleGreenChannelTarget}
          />

          {/* Green Channel 提示 */}
          <AnimatePresence>
            {activePowerUp === 'greenChannel' && (
              <div className="mt-2 flex items-center justify-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5">
                <Sparkles className="h-3.5 w-3.5 text-gold-bright" />
                <span className="font-body text-xs text-gold-bright">
                  綠色通道已開啟：點擊棋盤任一格，消除其 3×3 範圍
                </span>
              </div>
            )}
          </AnimatePresence>

          {/* 道具欄 */}
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
              重新開始
            </button>
            <button
              onClick={handleCheckout}
              disabled={game.status !== 'playing'}
              className="flex flex-[1.6] items-center justify-center gap-2 rounded-xl bg-gold-gradient px-4 py-3.5 font-body text-sm font-bold text-ink shadow-gold-glow transition hover:brightness-110 active:scale-95 disabled:opacity-40"
            >
              <ShoppingCart className="h-4 w-4" strokeWidth={2.2} />
              結帳 · ${game.score.toLocaleString()}
            </button>
          </div>
        </footer>
      </div>

      {/* 結算 Modal */}
      <GameOverModal
        open={modalOpen}
        score={game.score}
        maxCombo={game.maxCombo}
        isCheckout={checkoutMode}
        onPlayAgain={handleRestart}
      />
    </div>
  );
}
