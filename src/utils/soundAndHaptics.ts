/**
 * 音效與原生震動封裝
 * - 原生: Capacitor Haptics (iOS / Android)
 * - Web: navigator.vibrate 弱降級
 * - 音效: 程序化「消費主義」音頻引擎（Web Audio 實時合成，無外部素材）
 *   收銀機 KA-CHING / 金幣叮噹 / 刷卡聲 / 道具 bling / 96 BPM 商場 Lounge BGM
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { audio, type SfxName, type SfxOptions } from './audioEngine';

export type { SfxName, SfxOptions };

/* ------------------------------------------------------------------ */
/* Haptics (原生震動)                                                   */
/* ------------------------------------------------------------------ */

const isNative = () => Capacitor.isNativePlatform();

/** 輕震動 — 消除格子 / 交換成功 */
export async function tapHaptic(): Promise<void> {
  try {
    if (isNative()) {
      await Haptics.impact({ style: ImpactStyle.Light });
    } else if ('vibrate' in navigator) {
      navigator.vibrate?.(8);
    }
  } catch {
    /* 忽略失敗，遊戲不應因震動而中斷 */
  }
}

/** 中震動 — 觸發道具 */
export async function powerUpHaptic(): Promise<void> {
  try {
    if (isNative()) {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } else if ('vibrate' in navigator) {
      navigator.vibrate?.(20);
    }
  } catch {
    /* ignore */
  }
}

/** 遊戲結束 / Checkout — 成就感震動 */
export async function gameOverHaptic(): Promise<void> {
  try {
    if (isNative()) {
      await Haptics.notification({ type: NotificationType.Success });
    } else if ('vibrate' in navigator) {
      navigator.vibrate?.([30, 40, 60]);
    }
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Sound（程序化消費主義音頻引擎）                                       */
/* ------------------------------------------------------------------ */

/** 播放音效（關閉音效 / 引擎不可用時安全靜默） */
export function playSound(name: SfxName, opts?: SfxOptions): void {
  try {
    audio.sfx(name, opts);
  } catch {
    /* 音頻失敗不應中斷遊戲 */
  }
}

/** 首次用戶手勢時解鎖音頻並按偏好起播 BGM（移動端自動播放策略要求） */
export function unlockAudio(): void {
  try {
    audio.unlock();
  } catch {
    /* ignore */
  }
}

/** 聲音總開關（BGM + 音效） */
export function setSoundOn(on: boolean): void {
  audio.setSoundOn(on);
}

export function isSoundOn(): boolean {
  return audio.isMusicOn() || audio.isSfxOn();
}
