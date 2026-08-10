/**
 * GameOverModal — 结算 / Checkout 弹窗
 * - 金币礼花 (canvas-confetti)
 * - 按额度分档的讽刺评语
 * - 各品牌采购数量统计（趣味性）
 * - 分享成绩 / 再次开局
 */
import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Share2, RotateCcw, Crown, Wallet, ShoppingBag } from 'lucide-react';
import { verdict, toBrandStatsList } from '../utils/gameLogic';
import { gameOverHaptic } from '../utils/soundAndHaptics';
import type { TokenType } from '../types/game';
import BrandTile from './BrandTile';

interface GameOverModalProps {
  open: boolean;
  score: number;
  maxCombo: number;
  isCheckout: boolean;
  brandStats: Record<TokenType, number>;
  onPlayAgain: () => void;
}

export default function GameOverModal({
  open,
  score,
  maxCombo,
  isCheckout,
  brandStats,
  onPlayAgain
}: GameOverModalProps) {
  const v = useMemo(() => verdict(score), [score]);
  const stats = useMemo(() => toBrandStatsList(brandStats), [brandStats]);
  const totalItems = useMemo(() => stats.reduce((s, x) => s + x.count, 0), [stats]);

  /* 弹窗开启 → 礼花 + 震动 */
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

  const shareText = `我在《Luxe Flux》消费了 $${score.toLocaleString()}！${
    v.tier === 'vip'
      ? '击败全球 99% 的消费主义受害者 👑'
      : v.tier === 'waitlist'
        ? '进入 Birkin 25 等候名单 ✨'
        : '被 SA 冷笑了 🙃'
  }`;

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Luxe Flux', text: shareText, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${shareText} ${url}`);
        alert('成绩已复制到剪贴板！');
      }
    } catch {
      /* 用户取消分享 */
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
        className="relative max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-3xl border border-gold/30 bg-gradient-to-b from-ink-panel to-ink shadow-[0_0_60px_rgba(212,175,55,0.2)]"
      >
        {/* 顶部金色光晕 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gold-gradient opacity-15 blur-2xl" />

        <div className="relative px-6 pb-7 pt-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gold-gradient shadow-gold-glow">
            <TierIcon className="h-7 w-7 text-ink" strokeWidth={2} />
          </div>

          <h2 className="font-display text-2xl font-semibold bg-gold-text bg-clip-text text-transparent">
            {isCheckout ? '结算完成' : '消费失败？'}
          </h2>
          <p className="mt-1 font-body text-xs uppercase tracking-[0.3em] text-gold/60">
            {isCheckout ? 'Checkout · 买单走人' : 'Out of Moves · 步数用尽'}
          </p>

          {/* 消费总额 */}
          <div className="mt-5 rounded-2xl border border-gold/20 bg-ink/60 px-4 py-4">
            <p className="font-body text-[10px] uppercase tracking-[0.25em] text-ivory/40">
              最终消费总额
            </p>
            <p className="mt-1 font-body text-4xl font-bold tabular-nums text-gold drop-shadow-[0_0_14px_rgba(212,175,55,0.5)]">
              ${score.toLocaleString()}
            </p>
            <p className="mt-1.5 font-body text-[11px] text-ivory/50">
              最高连消 ×{maxCombo}
            </p>
          </div>

          {/* 品牌采购统计 */}
          {totalItems > 0 && (
            <div className="mt-4 rounded-2xl border border-gold/20 bg-ink/60 px-4 py-4 text-left">
              <p className="text-center font-body text-[10px] uppercase tracking-[0.25em] text-ivory/40">
                本局购入 · {totalItems} 件
              </p>
              <div className="mt-3 flex flex-col gap-1.5">
                {stats.map((s) => (
                  <div
                    key={s.type}
                    className="flex items-center gap-3 rounded-xl bg-ink/40 px-3 py-2"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gold/20 bg-black/40">
                      <BrandTile type={s.type} className="h-7 w-7" />
                    </span>
                    <span className="flex-1 font-body text-sm font-semibold text-ivory/90">
                      {s.name}
                    </span>
                    <span className="flex items-baseline gap-1">
                      <span className="font-body text-lg font-bold tabular-nums text-gold">
                        {s.count}
                      </span>
                      <span className="font-body text-[10px] uppercase text-ivory/40">件</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 讽刺评语 */}
          <div className="mt-4 rounded-xl bg-gold/10 px-4 py-3">
            <p className="font-display text-sm italic leading-relaxed text-gold-bright/90">
              “{v.message}”
            </p>
          </div>

          {/* 按钮 */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={handleShare}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gold/40 bg-transparent px-4 py-3 font-body text-sm font-semibold text-gold transition hover:bg-gold/10 active:scale-95"
            >
              <Share2 className="h-4 w-4" strokeWidth={2} />
              分享成绩
            </button>
            <button
              onClick={onPlayAgain}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gold-gradient px-4 py-3 font-body text-sm font-bold text-ink shadow-gold-glow transition hover:brightness-110 active:scale-95"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={2.2} />
              再来一局
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
