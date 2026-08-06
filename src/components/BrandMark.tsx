/**
 * BrandMark — 10 个经典包袋品牌徽章
 * 风格化矢量实现（内置 SVG path），矢量清晰、离线可用、随格缩放。
 * 品牌与图标仅作讽刺消费主义的艺术引用，不隶属任何品牌。
 *
 * 徽章元素：品牌缩写 + 标志性色带 / 提手等元素，整体黑金风格统一。
 */
import { memo } from 'react';
import type { TokenType } from '../types/game';
import { BRAND_COLORS, BRAND_EN, BRAND_NAMES } from '../utils/brands';

interface BrandMarkProps {
  type: TokenType;
  className?: string;
}

/** 品牌缩写（徽章主文字） */
const SHORT: Record<TokenType, string> = {
  chanel: 'CC',
  hermes: 'H',
  louisvuitton: 'LV',
  gucci: 'GG',
  dior: 'CD',
  prada: 'PR',
  celine: 'CE',
  ysl: 'YS',
  fendi: 'FF',
  burberry: 'BU',
  bvlgari: 'BV',
  tiffany: 'T&CO'
};

function BrandMark({ type, className = '' }: BrandMarkProps) {
  const color = BRAND_COLORS[type];
  const short = SHORT[type];
  const en = BRAND_EN[type];

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={BRAND_NAMES[type]}
    >
      <title>{en}</title>
      {/* 徽章底圆 */}
      <circle cx="32" cy="32" r="29" fill="#141414" stroke={color} strokeOpacity="0.85" strokeWidth="1.6" />
      {/* 顶部色带（品牌识别色） */}
      <rect x="14" y="9" width="36" height="3.2" rx="1.6" fill={color} opacity="0.9" />
      {/* 中央符号 */}
      <text
        x="32"
        y="40"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="'Playfair Display', Georgia, serif"
        fontWeight="700"
        fontSize={short.length > 1 ? 21 : 27}
        letterSpacing="0.5"
        fill={color}
      >
        {short}
      </text>
      {/* 底部品牌名 */}
      <text
        x="32"
        y="52.5"
        textAnchor="middle"
        fontFamily="Montserrat, Arial, sans-serif"
        fontWeight="600"
        fontSize="5.5"
        letterSpacing="0.6"
        fill={color}
        fillOpacity="0.85"
      >
        {en}
      </text>
    </svg>
  );
}

export default memo(BrandMark);
