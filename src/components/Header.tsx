/**
 * Header — 奢华奶白·香槟金顶栏
 * 左: 声音开关 + 步数 | 中: Logo | 右: 采购件数 + 消费额 (Prespend)
 */
import { AnimatePresence, motion } from 'framer-motion';
import { Volume2, VolumeX, Footprints, ShoppingBag, Plus } from 'lucide-react';

interface HeaderProps {
  moves: number;
  score: number;
  /** 已采购件数（金额 = 件数 × 统一单价） */
  items: number;
  /** 声音总开关（BGM + 音效） */
  soundOn: boolean;
  /** 最近一次获得的奖励步数（>0 时在步数旁浮出提示） */
  bonusMoves?: number;
  onToggleSound: () => void;
}

export default function Header({ moves, score, items, soundOn, bonusMoves = 0, onToggleSound }: HeaderProps) {
  return (
    <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-1">
      {/* 声音开关 + 步数 */}
      <div className="flex min-w-[88px] items-center gap-2">
        <button
          type="button"
          onClick={onToggleSound}
          aria-label={soundOn ? '关闭声音' : '开启声音'}
          aria-pressed={soundOn}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition active:scale-90 ${
            soundOn
              ? 'border-gold/70 bg-gold/15 text-gold-darker'
              : 'border-ink-line bg-cream text-ivory-soft'
          }`}
        >
          {soundOn ? (
            <Volume2 className="h-4 w-4" strokeWidth={1.8} />
          ) : (
            <VolumeX className="h-4 w-4" strokeWidth={1.8} />
          )}
        </button>
        <div className="flex flex-col items-start">
          <span className="font-body text-[10px] uppercase tracking-[0.2em] text-gold-darker">
            Moves
          </span>
          <div className="relative flex items-center gap-1.5">
            <Footprints className="h-4 w-4 text-gold-darker" strokeWidth={1.8} />
            <span className="font-body text-2xl font-bold tabular-nums text-ink-gold">
              {moves}
            </span>
            {/* 奖励步数浮出提示：四连 / 五连 / 连消才有，短暂展示 */}
            <AnimatePresence>
              {bonusMoves > 0 && (
                <motion.span
                  key={bonusMoves}
                  initial={{ opacity: 0, y: 8, scale: 0.8 }}
                  animate={{ opacity: 1, y: -6, scale: 1 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                  className="pointer-events-none absolute -top-4 left-full flex items-center gap-0.5 whitespace-nowrap rounded-full bg-gold-gradient px-1.5 py-0.5 font-body text-[11px] font-bold text-gold-ink shadow-gold-glow"
                >
                  <Plus className="h-3 w-3" strokeWidth={3} />
                  {bonusMoves} 步
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Logo */}
      <div className="flex flex-col items-center">
        <h1 className="font-body text-xl font-black uppercase tracking-[0.22em] text-ink-gold sm:text-2xl">
          LUXE FLUX
        </h1>
        <span className="mt-0.5 font-body text-[9px] uppercase tracking-[0.32em] text-gold-darker">
          The $29,980 Match-3
        </span>
      </div>

      {/* 采购件数 + 消费额 */}
      <div className="flex min-w-[96px] flex-col items-end">
        <span className="font-body text-[10px] uppercase tracking-[0.2em] text-gold-darker">
          Prespend
        </span>
        <div className="flex items-center gap-1">
          <span className="font-body text-[11px] font-semibold text-gold-darker">$</span>
          <span className="font-body text-xl font-bold tabular-nums text-gold-darker">
            {score.toLocaleString()}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-gold-darker/85">
          <ShoppingBag className="h-3 w-3" strokeWidth={2} />
          <span className="font-body text-[10px] font-semibold tabular-nums">
            {items} 件已购
          </span>
        </div>
      </div>
    </header>
  );
}
