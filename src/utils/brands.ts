/**
 * Luxe Flux — 品牌素材池
 * 从经典包袋品牌中精选 10 个，每局随机抽取 6 种生成对局
 * （主流消消乐一般为 5~7 种方块，取 6 种最舒适）。
 *
 * 素材以「风格化 SVG 徽章」内联实现（见 components/BrandMark.tsx），
 * 无需外部图片资源，离线可用、矢量清晰、缩放不失真。
 * 品牌与图标仅作讽刺消费主义的艺术引用，不隶属任何品牌。
 */
import type { TokenType } from '../types/game';

/** 每局使用的方块种类数（主流 match-3：Candy Crush / Royal Match 等 5~7 种） */
export const GAME_TOKEN_COUNT = 6;

/** 品牌素材池（10 个经典包袋品牌） */
export const TOKEN_POOL: TokenType[] = [
  'chanel', // 香奈儿
  'hermes', // 爱马仕
  'louisvuitton', // 路易威登
  'gucci', // 古驰
  'dior', // 迪奥
  'prada', // 普拉达
  'celine', // 赛琳
  'ysl', // 圣罗兰
  'bottega', // 葆蝶家
  'burberry' // 博柏利
];

/** 品牌中文名（简体） */
export const BRAND_NAMES: Record<TokenType, string> = {
  chanel: '香奈儿',
  hermes: '爱马仕',
  louisvuitton: '路易威登',
  gucci: '古驰',
  dior: '迪奥',
  prada: '普拉达',
  celine: '赛琳',
  ysl: '圣罗兰',
  bottega: '葆蝶家',
  burberry: '博柏利'
};

/** 品牌英文名 */
export const BRAND_EN: Record<TokenType, string> = {
  chanel: 'CHANEL',
  hermes: 'HERMÈS',
  louisvuitton: 'LOUIS VUITTON',
  gucci: 'GUCCI',
  dior: 'DIOR',
  prada: 'PRADA',
  celine: 'CÉLINE',
  ysl: 'SAINT LAURENT',
  bottega: 'BOTTEGA VENETA',
  burberry: 'BURBERRY'
};

/** 品牌标志性主色（用于徽章描边 / 强调） */
export const BRAND_COLORS: Record<TokenType, string> = {
  chanel: '#F5F5F7',
  hermes: '#E96A21',
  louisvuitton: '#B08A3E',
  gucci: '#C41E2A',
  dior: '#F5F5F7',
  prada: '#F5F5F7',
  celine: '#E8DCC8',
  ysl: '#D4AF37',
  bottega: '#B9834F',
  burberry: '#B08A5A'
};

/**
 * 从素材池中随机抽取 count 种品牌生成本局方块集合。
 * 素材种类多于局内种类时，保证每局体验不同（收集党可多局集齐）。
 */
export function sampleTokenTypes(count: number = GAME_TOKEN_COUNT): TokenType[] {
  const pool = [...TOKEN_POOL];
  const out: TokenType[] = [];
  while (out.length < count && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
