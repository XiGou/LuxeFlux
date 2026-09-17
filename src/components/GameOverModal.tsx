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
import { verdict, toBrandStatsList, UNIT_PRICE } from '../utils/gameLogic';
import { gameOverHaptic } from '../utils/soundAndHaptics';
import type { TokenType } from '../types/game';
import BrandTile from './BrandTile';

interface GameOverModalProps {
  open: boolean;
  score: number;
  /** 采购件数（金额 = 件数 × UNIT_PRICE） */
  items: number;
  maxCombo: number;
  isCheckout: boolean;
  brandStats: Record<TokenType, number>;
  onPlayAgain: () => void;
}

export default function GameOverModal({
  open,
  score,
  items,
  maxCombo,
  isCheckout,
  brandStats,
  onPlayAgain
}: GameOverModalProps) {
  const v = useMemo(() => verdict(items), [items]);
  const stats = useMemo(() => toBrandStatsList(brandStats), [brandStats]);

  /* 弹窗开启 → 礼花 + 震动 */
  useEffect(() => {
    if (!open) return;
    gameOverHaptic();

    const colors = ['#D4AF37', '#EBD9A8', '#8C6D22', '#FFFDF8', '#F3E7C9'];
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

  const shareText = `我在《Luxe Flux》买下了 ${items} 件，消费 $${score.toLocaleString()}！${
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-deep/45 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 12 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="relative max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-3xl border border-gold/40 bg-cream-panel shadow-[0_24px_70px_rgba(140,109,34,0.28)]"
      >
        {/* 顶部金色光晕 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gold-gradient opacity-25 blur-2xl" />

        <div className="relative px-6 pb-7 pt-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gold-gradient shadow-gold-glow">
            <TierIcon className="h-7 w-7 text-ink-deep" strokeWidth={2} />
          </div>

          <h2 className="font-display text-2xl font-semibold bg-gold-text bg-clip-text text-transparent">
            {isCheckout ? '提前买单' : '消费结算'}
          </h2>
          <p className="mt-1 font-body text-xs uppercase tracking-[0.3em] text-ivory-soft">
            {isCheckout ? 'Checkout · 主动买单走人' : 'Out of Moves · 步数用尽，结账离店'}
          </p>

          {/* 消费总额：件数 × 统一单价 */}
          <div className="mt-5 rounded-2xl border border-gold/30 bg-white/70 px-4 py-4 shadow-card-soft">
            <p className="font-body text-[10px] uppercase tracking-[0.25em] text-ivory-soft">
              最终消费总额
            </p>
            <p className="mt-1 font-body text-4xl font-bold tabular-nums text-gold-deep">
              ${score.toLocaleString()}
            </p>
            <p className="mt-1.5 font-body text-[11px] text-ivory-soft">
              {items} 件 × 统一单价 ${UNIT_PRICE.toLocaleString()} · 最高连消 ×{maxCombo}
            </p>
          </div>

          {/* 品牌采购统计 */}
          {items > 0 && (
            <div className="mt-4 rounded-2xl border border-gold/30 bg-white/70 px-4 py-4 text-left shadow-card-soft">
              <p className="text-center font-body text-[10px] uppercase tracking-[0.25em] text-ivory-soft">
                本局购入 · {items} 件 / ${score.toLocaleString()}
              </p>
              <div className="mt-3 flex flex-col gap-1.5">
                {stats.map((s) => (
                  <div
                    key={s.type}
                    className="flex items-center gap-3 rounded-xl bg-champagne/50 px-3 py-2"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gold/30 bg-white/80">
                      <BrandTile type={s.type} className="h-7 w-7" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-body text-sm font-semibold text-ink-deep">
                        {s.name}
                      </span>
                      <span className="font-body text-[10px] tabular-nums text-ivory-soft">
                        ${s.subtotal.toLocaleString()}
                      </span>
                    </span>
                    <span className="flex items-baseline gap-1">
                      <span className="font-body text-lg font-bold tabular-nums text-gold-deep">
                        {s.count}
                      </span>
                      <span className="font-body text-[10px] uppercase text-ivory-soft">件</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 讽刺评语 */}
          <div className="mt-4 rounded-xl border border-gold/25 bg-gold/10 px-4 py-3">
            <p className="font-display text-sm italic leading-relaxed text-gold-deep">
              “{v.message}”
            </p>
          </div>

          {/* 按钮 */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={handleShare}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gold/50 bg-white/60 px-4 py-3 font-body text-sm font-semibold text-gold-deep transition hover:bg-champagne active:scale-95"
            >
              <Share2 className="h-4 w-4" strokeWidth={2} />
              分享成绩
            </button>
            <button
              onClick={onPlayAgain}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gold-gradient px-4 py-3 font-body text-sm font-bold text-ink-deep shadow-gold-glow transition hover:brightness-105 active:scale-95"
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
