/**
 * BrandTile — 结算界面品牌图标（复用棋盘同一批独立 tile 贴图）
 *
 * 素材已从「一张雪碧图 + 运行时切割」改为 **12 张独立 PNG**：
 *   public/tiles/<brand>@<scale>x.png
 * 这里直接按品牌拼 URL 当普通图片加载，不再需要 canvas 切图，
 * 保证结算「本局购入」统计里的图标与棋盘方块 100% 是一致的素材。
 *
 * 加载复用 Phaser 侧同一份模块级缓存（loadTileImage），幂等、不重复请求，
 * 兼容 React StrictMode 双挂载与 Capacitor file:// 场景。
 */
import { memo, useEffect, useState } from 'react';
import type { TokenType } from '../types/game';
import { BRAND_NAMES } from '../utils/brands';
import { loadTileImage, tileUrl, pickTileScale } from '../game/textures';

interface BrandTileProps {
  type: TokenType;
  className?: string;
}

/** 结算图标固定用 2x（约 56 CSS px 的 2~3 倍屏足够清晰，且体积可控） */
const ICON_SCALE = 2;

function BrandTile({ type, className = '' }: BrandTileProps) {
  const [src, setSrc] = useState<string | null>(tileUrl(type, ICON_SCALE));

  useEffect(() => {
    let alive = true;
    // 预热（走 Phaser 侧同一份缓存），失败则回退到 1x 直链
    loadTileImage(type, ICON_SCALE)
      .then(() => {
        if (!alive) return;
        setSrc(tileUrl(type, ICON_SCALE));
      })
      .catch(() => {
        if (!alive) return;
        setSrc(tileUrl(type, pickTileScale(1)));
      });
    return () => {
      alive = false;
    };
  }, [type]);

  if (src) {
    return (
      <img
        src={src}
        alt={BRAND_NAMES[type]}
        className={className}
        style={{ objectFit: 'contain' }}
      />
    );
  }
  // 加载中 / 失败占位：保持原有尺寸，避免布局跳动
  return <span className={className} aria-label={BRAND_NAMES[type]} />;
}

export default memo(BrandTile);
