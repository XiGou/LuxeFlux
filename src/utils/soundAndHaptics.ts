/**
 * 音效與原生震動封裝
 * - 原生: Capacitor Haptics (iOS / Android)
 * - Web: navigator.vibrate 弱降級
 * - 音效: Howler（無素材時自動靜音，不會報錯）
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Howl } from 'howler';

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
/* Sound (Howler)                                                      */
/* ------------------------------------------------------------------ */

// 若未來放入真實音效，放在 public/audio/ 並取消註解即可。
const SOUND_FILES: Record<string, string | null> = {
  match: null,
  swap: null,
  powerup: null,
  cascade: null,
  gameover: null
};

/** 播放音效（素材缺失時安全靜默） */
export function playSound(name: keyof typeof SOUND_FILES): void {
  const src = SOUND_FILES[name];
  if (!src) return;
  try {
    new Howl({ src, volume: 0.5 }).play();
  } catch {
    /* ignore */
  }
}
