/**
 * BrandTile — 结算界面品牌图标（复用与棋盘一致的高清 tile 雪碧图）
 *
 * 直接从 public/sprites/luxe_flux_v2_12tiles_sprite.png 按 TILE_SIZE 切割出
 * 该品牌对应的 tile，保证结算「本局购入」统计里的图标与棋盘方块 100% 一致，
 * 不再使用旧的矢量 SVG 徽章（棋盘已升级为 8K 高清 tile，结算图标需同步）。
 *
 * 加载复用 Phaser 侧同一份模块级缓存（loadTileImage），幂等、不重复请求，
 * 兼容 React StrictMode 双挂载与 Capacitor file:// 场景。
 */
import { memo, useEffect, useState } from 'react';
import type { TokenType } from '../types/game';
import { BRAND_NAMES } from '../utils/brands';
import {
  SPRITE_COLS,
  SPRITE_ORDER,
  TILE_SIZE,
  loadTileImage
} from '../game/textures';

interface BrandTileProps {
  type: TokenType;
  className?: string;
}

function BrandTile({ type, className = '' }: BrandTileProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadTileImage()
      .then((img) => {
        if (!alive) return;
        const idx = SPRITE_ORDER.indexOf(type);
        if (idx < 0) return;
        const r = Math.floor(idx / SPRITE_COLS);
        const c = idx % SPRITE_COLS;
        const canvas = document.createElement('canvas');
        canvas.width = TILE_SIZE;
        canvas.height = TILE_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(
          img,
          c * TILE_SIZE,
          r * TILE_SIZE,
          TILE_SIZE,
          TILE_SIZE,
          0,
          0,
          TILE_SIZE,
          TILE_SIZE
        );
        setSrc(canvas.toDataURL('image/png'));
      })
      .catch((e) => {
        console.error('[LuxeFlux] BrandTile sprite load error:', e);
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
