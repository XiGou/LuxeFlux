/**
 * TokenFace — 单个方块的视觉渲染
 * 以品牌徽章（BrandMark SVG）作为素材。
 * 支持：普通 / 限量版(金色浮雕) / 爆破符号(行列) / 全柜同清炸弹。
 */
import { memo } from 'react';
import { Bomb } from 'lucide-react';
import type { Cell } from '../types/game';
import BrandMark from './BrandMark';

/** 判断是否为爆破符号（blast 字段存在） */
function isBlast(cell: Cell): boolean {
  return cell.blast === 'row' || cell.blast === 'col';
}

interface TokenFaceProps {
  cell: Cell;
  size?: 'sm' | 'md';
}

function TokenFace({ cell, size = 'md' }: TokenFaceProps) {
  const brand = <BrandMark type={cell.type} className="h-full w-full p-[2px]" />;

  // 爆破符号：行列横扫的镖靶样式
  if (isBlast(cell)) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div
          className={`relative flex items-center justify-center rounded-full bg-gold-gradient shadow-gold-glow ${
            size === 'sm' ? 'h-8 w-8' : 'h-11 w-11'
          }`}
        >
          <span className={`${size === 'sm' ? 'h-6 w-6' : 'h-8 w-8'} text-ink`}>
            <Bomb strokeWidth={2.4} />
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

  // 全柜同清炸弹
  if (cell.bomb) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="relative animate-float">
          <div className="flex items-center justify-center rounded-full bg-gold-gradient shadow-gold-glow h-12 w-12 sm:h-13 sm:w-13">
            <span className="text-ink w-7 h-7">
              <Bomb strokeWidth={2.2} />
            </span>
          </div>
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-1.5 text-[8px] font-semibold text-gold">
            全柜同清
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
            : 'h-8 w-8 sm:h-9 sm:w-9'
        }`}
      >
        {brand}
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
