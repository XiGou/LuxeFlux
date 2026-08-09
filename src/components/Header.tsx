/**
 * Header — 奢华黑金顶栏
 * 左: 步数 | 中: Logo | 右: 消费额 (Prespend)
 */
import { Footprints } from 'lucide-react';

interface HeaderProps {
  moves: number;
  score: number;
}

export default function Header({ moves, score }: HeaderProps) {
  return (
    <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-1">
      {/* 步数 */}
      <div className="flex min-w-[88px] flex-col items-start">
        <span className="font-body text-[10px] uppercase tracking-[0.2em] text-ivory/40">
          Moves
        </span>
        <div className="flex items-center gap-1.5">
          <Footprints className="h-4 w-4 text-gold" strokeWidth={1.8} />
          <span className="font-body text-2xl font-bold tabular-nums text-ivory">
            {moves}
          </span>
        </div>
      </div>

      {/* Logo */}
      <div className="flex flex-col items-center">
        <h1 className="font-body text-xl font-black uppercase tracking-[0.22em] text-ivory sm:text-2xl">
          LUXE FLUX
        </h1>
        <span className="mt-0.5 font-body text-[9px] uppercase tracking-[0.32em] text-gold/60">
          The $29,980 Match-3
        </span>
      </div>

      {/* 消费额 */}
      <div className="flex min-w-[96px] flex-col items-end">
        <span className="font-body text-[10px] uppercase tracking-[0.2em] text-ivory/40">
          Prespend
        </span>
        <div className="flex items-center gap-1">
          <span className="font-body text-[11px] font-semibold text-gold-bright">$</span>
          <span className="font-body text-xl font-bold tabular-nums text-gold drop-shadow-[0_0_10px_rgba(212,175,55,0.45)]">
            {score.toLocaleString()}
          </span>
        </div>
      </div>
    </header>
  );
}
