/**
 * PowerUps — VIP 特权道具栏
 * 三种道具: 绿色通道 / 限量配货 / 二手同款
 *
 * 交互：点击道具卡片 → 以「悬浮气泡」形式展示详细玩法介绍（绝对定位覆盖在
 * 卡片上方，不参与文档流，因此不会撑高页面 / 产生滚动条）；
 * 确认后点击气泡内的「立即使用」按钮才会真正消耗道具。
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
  /** 当前悬浮展示介绍的道具 */
  const [detail, setDetail] = useState<PowerUpType | null>(null);

  const detailConf = detail ? POWER_UPS[detail] : null;
  const DetailIcon = detailConf ? ICONS[detailConf.icon] : null;
  const detailDisabled = detail ? busy || uses[detail] <= 0 : false;

  return (
    <section className="px-3 py-2">
      {/* 卡片行：作为悬浮气泡的定位容器 */}
      <div className="relative">
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
                onClick={() => setDetail((cur) => (cur === type ? null : type))}
                disabled={disabled}
                aria-expanded={detail === type}
                className={`group relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 transition-all duration-200 ${
                  isActive
                    ? 'border-gold-deep bg-gold/25 shadow-gold-glow ring-1 ring-gold-deep/40'
                    : disabled
                      ? 'border-ink-line bg-ink-soft opacity-60'
                      : detail === type
                        ? 'border-gold-deep bg-ink-panel shadow-gold-glow'
                        : 'border-gold/60 bg-cream shadow-card-soft hover:border-gold-deep hover:bg-champagne/60 active:scale-95'
                }`}
              >
                <div className="relative">
                  <Icon
                    className={`h-6 w-6 ${isActive ? 'text-gold-darker' : 'text-gold-darker/90'}`}
                    strokeWidth={1.9}
                  />
                  {remaining > 0 && (
                    <span className="absolute -right-2.5 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gold-gradient text-[11px] font-bold text-gold-ink ring-1 ring-gold-ink/30">
                      {remaining}
                    </span>
                  )}
                </div>
                <span className="font-body text-sm font-bold leading-tight text-ink-gold">
                  {conf.name}
                </span>
                <span className="font-body text-[11px] uppercase tracking-wide text-gold-darker/80">
                  {conf.tagline.split('·')[1]?.trim()}
                </span>
              </button>
            );
          })}
        </div>

        {/* 悬浮气泡：绝对定位在卡片行上方，脱离文档流 → 不产生滚动条 */}
        <AnimatePresence>
          {detail && detailConf && DetailIcon && (
            <motion.div
              key={detail}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              className="pointer-events-none absolute inset-x-0 bottom-[calc(100%+0.5rem)] z-40"
              role="dialog"
              aria-label={`${detailConf.name} 玩法介绍`}
            >
              <div className="pointer-events-auto relative rounded-2xl border border-gold/70 bg-cream-panel p-4 shadow-[0_16px_44px_rgba(140,109,34,0.26)]">
                {/* 关闭 */}
                <button
                  onClick={() => setDetail(null)}
                  className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-gold/60 text-gold-darker/80 transition hover:border-gold-deep hover:text-gold-darker"
                  aria-label="关闭介绍"
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>

                {/* 标题行 */}
                <div className="flex items-center gap-3 pr-8">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/20 ring-1 ring-gold/50">
                    <DetailIcon className="h-6 w-6 text-gold-darker" strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-body text-lg font-extrabold leading-tight text-ink-gold">
                      {detailConf.name}
                      <span className="ml-2 align-middle font-body text-sm font-semibold text-gold-darker">
                        剩余 ×{uses[detail]}
                      </span>
                    </h3>
                    <p className="font-body text-[11px] uppercase tracking-[0.16em] text-gold-darker">
                      {detailConf.tagline}
                    </p>
                  </div>
                </div>

                {/* 详细玩法介绍 */}
                <p className="mt-2.5 border-t border-gold/40 pt-2.5 font-body text-[13px] leading-relaxed text-ink-gold">
                  {detailConf.description}
                </p>

                {/* 使用按钮 */}
                <button
                  onClick={() => {
                    onUse(detail);
                    setDetail(null);
                  }}
                  disabled={detailDisabled}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gold-gradient px-4 py-2.5 font-body text-sm font-bold text-gold-ink shadow-gold-glow transition hover:brightness-105 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
                >
                  <Zap className="h-4 w-4" strokeWidth={2.4} />
                  {detailDisabled ? '已用完' : `立即使用 · ${detailConf.name}`}
                </button>
              </div>

              {/* 气泡小尖角，指向被点击的道具卡片 */}
              <div
                className={`absolute -bottom-1.5 h-3 w-3 rotate-45 border-b border-r border-gold/70 bg-ink-panel ${
                  detail === 'greenChannel' ? 'left-[16.6%]' : detail === 'markup' ? 'left-1/2' : 'left-[83.3%]'
                } -translate-x-1/2`}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
