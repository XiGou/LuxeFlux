/**
 * Luxe Flux — 品牌素材池
 * 从经典包袋品牌中精选 12 个，每局随机抽取 6 种生成对局
 * （主流消消乐一般为 5~7 种方块，取 6 种最舒适）。
 *
 * 素材为 12 张独立 tile 贴图（透明背景，1x/2x/3x 三档）：
 *   public/tiles/<brand>@<scale>x.png
 * 每局使用其中 6 种品牌，离线可用、高清矢量级清晰度。
 *
 * 品牌与图标仅作讽刺消费主义的艺术引用，不隶属任何品牌。
 */
import type { TokenType } from '../types/game';

/** 每局使用的方块种类数（主流 match-3：Candy Crush / Royal Match 等 5~7 种） */
export const GAME_TOKEN_COUNT = 6;

/** 品牌素材池（12 个经典包袋品牌，对应雪碧图 12 tile） */
export const TOKEN_POOL: TokenType[] = [
  'gucci', // 古驰
  'celine', // 赛琳
  'hermes', // 爱马仕
  'ysl', // 圣罗兰
  'prada', // 普拉达
  'chanel', // 香奈儿
  'louisvuitton', // 路易威登
  'dior', // 迪奥
  'fendi', // 芬迪
  'burberry', // 博柏利
  'bvlgari', // 宝格丽
  'tiffany' // 蒂芙尼
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
  fendi: '芬迪',
  burberry: '博柏利',
  bvlgari: '宝格丽',
  tiffany: '蒂芙尼'
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
  fendi: 'FENDI',
  burberry: 'BURBERRY',
  bvlgari: 'BVLGARI',
  tiffany: 'TIFFANY & CO.'
};

/** 品牌标志性主色（用于徽章描边 / 强调 / 结算界面） */
export const BRAND_COLORS: Record<TokenType, string> = {
  gucci: '#33261D', // 黑巧克力
  celine: '#F9F6EE', // 象牙奶油
  hermes: '#FF6600', // 爱马仕橙
  ysl: '#002366', // 深皇家蓝
  prada: '#101010', // 普拉达黑
  chanel: '#FFFFFF', // 珍珠白
  louisvuitton: '#D4AF37', // 金色
  dior: '#C0C0C0', // 银灰
  fendi: '#5C3A1E', // 烟草棕
  burberry: '#9C2A2E', // 红宝石
  bvlgari: '#40E0D0', // 绿松石
  tiffany: '#0ABAB5' // 蒂芙尼蓝
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
