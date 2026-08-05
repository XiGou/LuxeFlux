/**
 * TokenFace — 單一符號的視覺渲染
 * 以 Lucide 圖示作為佔位素材，後續可替換為真實品牌 SVG。
 * 支援：普通符號 / 限量版(金色浮雕) / 爆破符號(行列) / 全配貨炸彈。
 */
import { memo } from 'react';
import { ShoppingBag, Gem, Clock, SprayCan, Glasses, Wine, Bomb } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Cell, TokenType } from '../types/game';

const ICONS: Record<TokenType, LucideIcon> = {
  bag: ShoppingBag,
  heels: Gem,
  watch: Clock,
  perfume: SprayCan,
  sunglasses: Glasses,
  champagne: Wine
};

const ICON_LABEL: Record<TokenType, string> = {
  bag: '手提包',
  heels: '高跟鞋',
  watch: '腕錶',
  perfume: '香水',
  sunglasses: '墨鏡',
  champagne: '香檳'
};

/** 判斷是否為爆破符號（blast 欄位存在） */
function isBlast(cell: Cell): boolean {
  return cell.blast === 'row' || cell.blast === 'col';
}

interface TokenFaceProps {
  cell: Cell;
  size?: 'sm' | 'md';
}

function TokenFace({ cell, size = 'md' }: TokenFaceProps) {
  const Icon = cell.bomb ? Bomb : ICONS[cell.type];
  const base = size === 'sm' ? 'w-6 h-6' : 'w-8 h-8';

  // 爆破符號：行列橫掃的鏢靶樣式
  if (isBlast(cell)) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div
          className={`relative flex items-center justify-center rounded-full bg-gold-gradient shadow-gold-glow ${
            size === 'sm' ? 'h-8 w-8' : 'h-11 w-11'
          }`}
        >
          <span className={`${base} text-ink`}>
            <Icon strokeWidth={2.4} />
          </span>
          <span
            className={`absolute -right-0.5 -top-0.5 rounded-full bg-ink text-gold ${
              size === 'sm' ? 'h-3 w-3 text-[8px]' : 'h-4 w-4 text-[10px]'
            } flex items-center justify-center font-bold`}
          >
            {cell.blast === 'row' ? '⟶' : '↓'}
          </span>
        </div>
      </div>
    );
  }

  // 全配貨炸彈
  if (cell.bomb) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="relative animate-float">
          <div className="flex items-center justify-center rounded-full bg-gold-gradient shadow-gold-glow h-12 w-12 sm:h-13 sm:w-13">
            <span className="text-ink w-7 h-7">
              <Icon strokeWidth={2.2} />
            </span>
          </div>
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-1.5 text-[8px] font-semibold text-gold">
            全配貨
          </span>
        </div>
      </div>
    );
  }

  // 普通 / 限量版
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        className={`relative flex items-center justify-center ${
          cell.limited
            ? 'bg-gold-gradient shadow-gold-glow h-10 w-10 rounded-lg sm:h-11 sm:w-11'
            : 'h-8 w-8 text-gold/90 sm:h-9 sm:w-9'
        }`}
      >
        <span className={base}>
          <Icon strokeWidth={cell.limited ? 2.2 : 1.8} />
        </span>
        {cell.limited && (
          <span
            className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-ink text-[8px] text-gold-bright"
            title="限量版"
          >
            ★
          </span>
        )}
      </div>
    </div>
  );
}

export default memo(TokenFace);
export { ICON_LABEL };
