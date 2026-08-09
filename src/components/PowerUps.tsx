/**
 * PowerUps — VIP 特权道具栏
 * 三种道具: 绿色通道 / 溢价转售 / 二手同款
 *
 * 交互：点击道具卡片 → 下方展开「大字号详情面板」展示详细玩法介绍；
 * 确认后点击面板内的「立即使用」按钮才会真正消耗道具。
 * 选中状态以金色高亮 + 发光区分；剩余次数以角标展示。
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutGrid, Gem, Shuffle, X, Zap } from 'lucide-react';
import type { PowerUpType } from '../types/game';
import { POWER_UPS } from '../utils/gameLogic';

interface PowerUpsProps {
  uses: Record<PowerUpType, number>;
  active: PowerUpType | null;
  busy: boolean;
  onUse: (type: PowerUpType) => void;
}

const ICONS = {
  layoutGrid: LayoutGrid,
  gem: Gem,
  shuffle: Shuffle
} as const;

export default function PowerUps({ uses, active, busy, onUse }: PowerUpsProps) {
  /** 当前展开详情的道具（点击卡片后在下方面板中展示） */
  const [detail, setDetail] = useState<PowerUpType | null>(null);

  const detailType = detail;
  const detailConf = detailType ? POWER_UPS[detailType] : null;
  const DetailIcon = detailType ? ICONS[detailConf!.icon] : null;
  const detailDisabled = detailType ? busy || uses[detailType] <= 0 : false;

  return (
    <section className="px-3 py-2">
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(POWER_UPS) as PowerUpType[]).map((type) => {
          const conf = POWER_UPS[type];
          const Icon = ICONS[conf.icon];
          const remaining = uses[type];
          const isActive = active === type;
          const disabled = busy || remaining <= 0 || (active !== null && !isActive);

          return (
            <button
              key={type}
              onClick={() => setDetail(type)}
              disabled={disabled}
              className={`group relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 transition-all duration-200 ${
                isActive
                  ? 'border-gold bg-gold/15 shadow-gold-glow'
                  : disabled
                    ? 'border-ink-line bg-ink-soft opacity-40'
                    : detail === type
                      ? 'border-gold/70 bg-ink-panel'
                      : 'border-gold/25 bg-ink-soft hover:border-gold/60 hover:bg-ink-panel active:scale-95'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`h-6 w-6 ${isActive ? 'text-gold-bright' : 'text-gold/80'}`}
                  strokeWidth={1.9}
                />
                {remaining > 0 && (
                  <span className="absolute -right-2.5 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-[11px] font-bold text-ink">
                    {remaining}
                  </span>
                )}
              </div>
              <span className="font-body text-sm font-bold leading-tight text-ivory/95">
                {conf.name}
              </span>
              <span className="font-body text-[11px] uppercase tracking-wide text-gold/70">
                {conf.tagline.split('·')[1]?.trim()}
              </span>
            </button>
          );
        })}
      </div>

      {/* 大字号详情面板：点击道具卡片后在此展开 */}
      <AnimatePresence>
        {detailType && detailConf && DetailIcon && (
          <motion.div
            key={detailType}
            initial={{ opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="overflow-hidden"
          >
            <div className="relative mt-2 rounded-2xl border border-gold/30 bg-gradient-to-b from-ink-panel to-ink/90 p-4 shadow-[0_0_26px_rgba(212,175,55,0.14)]">
              {/* 关闭 */}
              <button
                onClick={() => setDetail(null)}
                className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-gold/20 text-gold/60 transition hover:border-gold/60 hover:text-gold"
                aria-label="关闭介绍"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>

              {/* 标题行 */}
              <div className="flex items-center gap-3 pr-8">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gold/15">
                  <DetailIcon className="h-7 w-7 text-gold-bright" strokeWidth={1.9} />
                </span>
                <div className="min-w-0">
                  <h3 className="font-body text-xl font-extrabold leading-tight text-ivory">
                    {detailConf.name}
                    <span className="ml-2 align-middle font-body text-sm font-semibold text-gold/70">
                      剩余 ×{uses[detailType]}
                    </span>
                  </h3>
                  <p className="font-body text-xs uppercase tracking-[0.18em] text-gold/60">
                    {detailConf.tagline}
                  </p>
                </div>
              </div>

              {/* 详细玩法介绍（大字号） */}
              <p className="mt-3 border-t border-gold/15 pt-3 font-body text-[15px] leading-relaxed text-ivory/90">
                {detailConf.description}
              </p>

              {/* 使用按钮 */}
              <button
                onClick={() => {
                  onUse(detailType);
                  setDetail(null);
                }}
                disabled={detailDisabled}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gold-gradient px-4 py-3 font-body text-base font-bold text-ink shadow-gold-glow transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
              >
                <Zap className="h-4 w-4" strokeWidth={2.4} />
                {detailDisabled ? '已用完' : `立即使用 · ${detailConf.name}`}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
