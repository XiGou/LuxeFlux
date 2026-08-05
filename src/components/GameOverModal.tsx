/**
 * GameOverModal — 結算 / Checkout 彈窗
 * - 金幣禮花 (canvas-confetti)
 * - 按額度分檔的諷刺評語
 * - 分享成績 / 再次配貨
 */
import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Share2, RotateCcw, Crown, Wallet, ShoppingBag } from 'lucide-react';
import { verdict } from '../utils/gameLogic';
import { gameOverHaptic } from '../utils/soundAndHaptics';

interface GameOverModalProps {
  open: boolean;
  score: number;
  maxCombo: number;
  isCheckout: boolean;
  onPlayAgain: () => void;
}

export default function GameOverModal({
  open,
  score,
  maxCombo,
  isCheckout,
  onPlayAgain
}: GameOverModalProps) {
  const v = useMemo(() => verdict(score), [score]);

  /* 彈窗開啟 → 禮花 + 震動 */
  useEffect(() => {
    if (!open) return;
    gameOverHaptic();

    const colors = ['#D4AF37', '#F0D68A', '#9A7B2D', '#F5F5F7'];
    const burst = (x: number, y: number) =>
      confetti({
        particleCount: 70,
        spread: 65,
        origin: { x, y },
        colors,
        scalar: 0.95,
        zIndex: 200
      });

    const timer = setTimeout(() => {
      burst(0.2, 0.75);
      burst(0.8, 0.75);
      setTimeout(() => {
        burst(0.5, 0.6);
        burst(0.35, 0.85);
        burst(0.65, 0.85);
      }, 260);
    }, 260);

    return () => clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  const shareText = `我在《Luxe Flux》配貨了 $${score.toLocaleString()}！${
    v.tier === 'vip' ? '擊敗全球 99% 的消費主義受害者 👑' : v.tier === 'waitlist' ? '進入 Birkin 25 等候名單 ✨' : '被 SA 冷笑了 🙃'
  }`;

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Luxe Flux', text: shareText, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${shareText} ${url}`);
        alert('成績已複製到剪貼簿！');
      }
    } catch {
      /* 使用者取消分享 */
    }
  };

  const tierIcon =
    v.tier === 'vip' ? Crown : v.tier === 'waitlist' ? Wallet : ShoppingBag;
  const TierIcon = tierIcon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 12 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-b from-ink-panel to-ink shadow-[0_0_60px_rgba(212,175,55,0.2)]"
      >
        {/* 頂部金色光暈 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gold-gradient opacity-15 blur-2xl" />

        <div className="relative px-6 pb-7 pt-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gold-gradient shadow-gold-glow">
            <TierIcon className="h-7 w-7 text-ink" strokeWidth={2} />
          </div>

          <h2 className="font-display text-2xl font-semibold bg-gold-text bg-clip-text text-transparent">
            {isCheckout ? '結帳完成' : '配貨失敗？'}
          </h2>
          <p className="mt-1 font-body text-xs uppercase tracking-[0.3em] text-gold/60">
            {isCheckout ? 'Checkout · 買單走人' : 'Out of Moves · 步數用盡'}
          </p>

          {/* 配貨總額 */}
          <div className="mt-5 rounded-2xl border border-gold/20 bg-ink/60 px-4 py-4">
            <p className="font-body text-[10px] uppercase tracking-[0.25em] text-ivory/40">
              最終配貨總額
            </p>
            <p className="mt-1 font-body text-4xl font-bold tabular-nums text-gold drop-shadow-[0_0_14px_rgba(212,175,55,0.5)]">
              ${score.toLocaleString()}
            </p>
            <p className="mt-1.5 font-body text-[11px] text-ivory/50">
              最高連消 ×{maxCombo}
            </p>
          </div>

          {/* 諷刺評語 */}
          <div className="mt-4 rounded-xl bg-gold/10 px-4 py-3">
            <p className="font-display text-sm italic leading-relaxed text-gold-bright/90">
              “{v.message}”
            </p>
          </div>

          {/* 按鈕 */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={handleShare}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gold/40 bg-transparent px-4 py-3 font-body text-sm font-semibold text-gold transition hover:bg-gold/10 active:scale-95"
            >
              <Share2 className="h-4 w-4" strokeWidth={2} />
              分享成績
            </button>
            <button
              onClick={onPlayAgain}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gold-gradient px-4 py-3 font-body text-sm font-bold text-ink shadow-gold-glow transition hover:brightness-110 active:scale-95"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={2.2} />
              再次配貨
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
