/**
 * PowerUps — VIP 配貨特權道具欄
 * 三種道具: 綠色通道 / 溢價轉售 / 二手配貨
 */
import { LayoutGrid, Gem, Shuffle } from 'lucide-react';
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
              onClick={() => onUse(type)}
              disabled={disabled}
              className={`group relative flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 transition-all duration-200 ${
                isActive
                  ? 'border-gold bg-gold/15 shadow-gold-glow'
                  : disabled
                    ? 'border-ink-line bg-ink-soft opacity-40'
                    : 'border-gold/25 bg-ink-soft hover:border-gold/60 hover:bg-ink-panel active:scale-95'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`h-5 w-5 ${isActive ? 'text-gold-bright' : 'text-gold/80'}`}
                  strokeWidth={1.9}
                />
                {remaining > 0 && (
                  <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[9px] font-bold text-ink">
                    {remaining}
                  </span>
                )}
              </div>
              <span className="font-body text-[10px] font-semibold leading-tight text-ivory/90">
                {conf.name}
              </span>
              <span className="hidden font-body text-[8px] uppercase tracking-wider text-gold/50 sm:block">
                {conf.tagline.split('·')[1]?.trim()}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
