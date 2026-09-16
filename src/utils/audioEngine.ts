/**
 * Luxe Flux — 程序化「消费主义」音频引擎（Web Audio API）
 *
 * 全部 BGM 与音效均由振荡器 / 噪声实时合成，零外部音频素材依赖：
 *
 *  - **BGM《Mall Lounge》**：96 BPM 黑金 Lo-fi Trap / 精品店 Lounge，
 *    kick / snare / hat / bass / 电钢和弦 / bling 铃音，
 *    4 小节循环和声 Fmaj7 → Am7 → Dm7 → G7（温柔 = 昂贵）。
 *    钱的声音也是配器的一部分：每两小节一次「bling」铃音，像橱窗反光。
 *
 *  - **SFX（消费主义音效库）**：
 *      · `match`    收银机 KA-CHING（+ 金币叮当），连消越高音越亮
 *      · `coin`     金币叮当（B5 → E6 双响）
 *      · `swap`     刷卡 swipe（带通噪声扫频）
 *      · `powerup`  上行 bling 琶音（VIP 待遇）
 *      · `gameover` 结算：终端和弦 + 长尾 KA-CHING
 *
 * 移动端自动播放策略：AudioContext 必须在首次用户手势后 unlock() 才会出声，
 * 因此 App 在首次 pointerdown / touchstart / keydown 时调用 unlockAudio()。
 */
export type SfxName = 'match' | 'coin' | 'swap' | 'powerup' | 'cascade' | 'gameover';

export interface SfxOptions {
  /** 连消段数：越高音越亮（经典 juice 反馈，让玩家「听」到自己在烧钱） */
  cascade?: number;
}

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */

const LS_MUSIC = 'luxeflux:music';
const LS_SFX = 'luxeflux:sfx';

const BPM = 96;
const STEPS_PER_BAR = 16; // 16 分音符网格
const BARS = 4;
const TOTAL_STEPS = STEPS_PER_BAR * BARS;

const MUSIC_VOL = 0.3;
const SFX_VOL = 0.55;

/** 黑金 Lounge 和声进行（每小节一个和弦） */
const PROGRESSION = [
  { bass: 'F2', notes: ['F3', 'A3', 'C4', 'E4'] }, // Fmaj7
  { bass: 'A2', notes: ['A3', 'C4', 'E4', 'G4'] }, // Am7
  { bass: 'D2', notes: ['D3', 'F3', 'A3', 'C4'] }, // Dm7
  { bass: 'G2', notes: ['G3', 'B3', 'D4', 'F4'] } //  G7
];

/** 16 分步进上的节奏型（Lo-fi Trap） */
const KICK_STEPS = [0, 10];
const SNARE_STEPS = [4, 12];
const CHORD_STEPS = [0, 9];

/* ------------------------------------------------------------------ */
/* 工具：音名 → 频率                                                    */
/* ------------------------------------------------------------------ */

const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'A4' / 'C#5' / 'Eb3' → Hz */
function f(note: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  if (!m) return 440;
  const semi = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const midi = (Number(m[3]) + 1) * 12 + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** localStorage 安全读写（隐私模式 / SSR 下不可用） */
function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, v: boolean): void {
  try {
    localStorage.setItem(key, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function createCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 引擎                                                                */
/* ------------------------------------------------------------------ */

class LuxeAudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private step = 0;

  private unlocked = false;
  private musicOn = readFlag(LS_MUSIC, true);
  private sfxOn = readFlag(LS_SFX, true);

  /* ---------------- 生命周期 / 总线 ---------------- */

  /** 惰性创建 AudioContext 与总线（幂等） */
  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const ctx = createCtx();
    if (!ctx) return null;
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.0001;
    this.musicBus.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = SFX_VOL;
    this.sfxBus.connect(this.master);

    // 1 秒白噪声（军鼓 / hi-hat / 刷卡 / 钱箱机械声共用）
    const len = Math.floor(ctx.sampleRate);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    return ctx;
  }

  /** 首次用户手势后调用：创建 / 恢复上下文并按偏好起播 BGM */
  unlock(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    this.unlocked = true;
    if (this.musicOn) this.start();
  }

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /* ---------------- 开关 ---------------- */

  isMusicOn(): boolean {
    return this.musicOn;
  }

  isSfxOn(): boolean {
    return this.sfxOn;
  }

  /** 总开关：同时控制 BGM 与音效 */
  setSoundOn(v: boolean): void {
    this.setMusicOn(v);
    this.setSfxOn(v);
  }

  setMusicOn(v: boolean): void {
    this.musicOn = v;
    writeFlag(LS_MUSIC, v);
    if (v) {
      if (this.unlocked) this.start();
    } else {
      this.stop();
    }
  }

  setSfxOn(v: boolean): void {
    this.sfxOn = v;
    writeFlag(LS_SFX, v);
  }

  /* ---------------- BGM ---------------- */

  start(): void {
    const ctx = this.ensure();
    if (!ctx || !this.musicBus || this.timer !== null) return;
    if (ctx.state === 'suspended') void ctx.resume();

    const t = ctx.currentTime;
    this.nextStepTime = t + 0.12;
    this.step = 0;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(0.0001, t);
    this.musicBus.gain.linearRampToValueAtTime(MUSIC_VOL, t + 1.8);
    this.timer = setInterval(this.tick, 25);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const t = ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(Math.max(this.musicBus.gain.value, 0.0001), t);
    this.musicBus.gain.linearRampToValueAtTime(0.0001, t + 0.45);
  }

  /** 前瞻式调度：每 25ms 补齐未来 0.2s 内的音符（避免 setTimeout 抖动） */
  private tick = (): void => {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const stepDur = 60 / BPM / 4;
    // 后台标签页会被节流：若落后过多则重新对齐，避免回前台时「一堆音符同时炸响」
    if (this.nextStepTime < ctx.currentTime - 0.5) {
      this.nextStepTime = ctx.currentTime + 0.05;
    }
    while (this.nextStepTime < ctx.currentTime + 0.2) {
      this.scheduleStep(this.step, this.nextStepTime, stepDur);
      this.nextStepTime += stepDur;
      this.step = (this.step + 1) % TOTAL_STEPS;
    }
  };

  private scheduleStep(step: number, t: number, stepDur: number): void {
    const bus = this.musicBus;
    if (!bus) return;
    const bar = Math.floor(step / STEPS_PER_BAR);
    const s = step % STEPS_PER_BAR;
    const chord = PROGRESSION[bar % PROGRESSION.length];

    if (KICK_STEPS.includes(s)) this.kick(t, bus);
    if (SNARE_STEPS.includes(s)) this.snare(t, bus);
    // hi-hat：8 分底 + 16 分收尾滚奏
    if (s % 2 === 0) this.hat(t, bus, s % 4 === 0 ? 1 : 0.55);
    if (s === 14) this.hat(t + stepDur * 0.5, bus, 0.45);

    if (CHORD_STEPS.includes(s)) {
      this.stab(t, bus, chord.notes, s === 0 ? 1.15 : 0.7);
    }
    if (s === 0 || s === 10) {
      this.bass(t, bus, f(chord.bass), s === 0 ? 0.6 : 0.32);
    }
    // 每两小节一次「橱窗反光」铃音
    if (s === 12 && bar % 2 === 1) this.bell(t, bus, f('C6'), 0.9, 0.2);
    // 乐句收尾：上行金币 sparkle
    if (s === 15 && bar === BARS - 1) {
      for (let i = 0; i < 3; i++) {
        this.bell(t + i * stepDur * 0.5, bus, f('G5') * Math.pow(2, (i * 3) / 12), 0.4, 0.16);
      }
    }
  }

  /* ---------------- 音色（BGM） ---------------- */

  private kick(t: number, bus: GainNode): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(155, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.13);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.95, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    osc.connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + 0.36);
  }

  private snare(t: number, bus: GainNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1750;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    src.connect(bp).connect(g).connect(bus);
    src.start(t);
    src.stop(t + 0.2);

    // 军鼓「皮膜」基音
    const body = ctx.createOscillator();
    const bg = ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(190, t);
    body.frequency.exponentialRampToValueAtTime(120, t + 0.1);
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.18, t + 0.005);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    body.connect(bg).connect(bus);
    body.start(t);
    body.stop(t + 0.14);
  }

  private hat(t: number, bus: GainNode, vel: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    src.connect(hp).connect(g).connect(bus);
    src.start(t);
    src.stop(t + 0.07);
  }

  private bass(t: number, bus: GainNode, freq: number, dur: number): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g).connect(bus);

    const tri = ctx.createOscillator();
    tri.type = 'triangle';
    tri.frequency.value = freq;
    tri.connect(lp);
    tri.start(t);
    tri.stop(t + dur + 0.05);

    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.value = freq / 2;
    sg.gain.value = 0.6;
    sub.connect(sg).connect(lp);
    sub.start(t);
    sub.stop(t + dur + 0.05);
  }

  /** 电钢和弦：每音两路失谐三角波 + 低通，柔和「贵」感 */
  private stab(t: number, bus: GainNode, notes: string[], dur: number): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g).connect(bus);

    for (const n of notes) {
      const freq = f(n);
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = freq;
        o.detune.value = det;
        og.gain.value = 0.5 / notes.length;
        o.connect(og).connect(lp);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  /**
   * 「bling」金属铃音：FM 合成（非整数比调制 → 玻璃 / 金属质感）。
   * 这是全曲最「消费主义」的音色 —— 橱窗反光、钻石切面、收银机铃。
   */
  private bell(t: number, bus: GainNode, freq: number, dur: number, peak: number): void {
    const ctx = this.ctx!;
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;

    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = freq * 2.76;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(freq * 1.1, t);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.05, t + dur);
    mod.connect(modGain).connect(carrier.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    carrier.connect(g).connect(bus);

    carrier.start(t);
    carrier.stop(t + dur + 0.05);
    mod.start(t);
    mod.stop(t + dur + 0.05);
  }

  /* ---------------- 音色（SFX） ---------------- */

  /** 收银机 KA-CHING：钱箱闷响 + 双铃 + 高频碎光 */
  private kaChing(t: number, bus: GainNode, semis = 0): void {
    const ctx = this.ctx!;
    const base = 1245 * Math.pow(2, semis / 12);

    // 钱箱弹出：低通噪声闷响
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    src.connect(lp).connect(g).connect(bus);
    src.start(t);
    src.stop(t + 0.16);

    // 双铃（经典 E → B 上行）
    this.bell(t + 0.02, bus, base, 0.55, 0.5);
    this.bell(t + 0.1, bus, base * 1.5, 0.42, 0.36);
    this.bell(t + 0.17, bus, base * 2, 0.3, 0.18);
  }

  /** 金币叮当：B5 → E6 双响方波（游戏币通用语汇） */
  private coinClink(t: number, bus: GainNode, semis = 0): void {
    const ctx = this.ctx!;
    const notes = [987.77, 1318.51];
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = freq * Math.pow(2, semis / 12);
      const at = t + i * 0.07;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.22, at + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      o.connect(g).connect(bus);
      o.start(at);
      o.stop(at + 0.12);
    });
  }

  /** 刷卡 swipe：带通噪声扫频 */
  private swipe(t: number, bus: GainNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
    src.connect(bp).connect(g).connect(bus);
    src.start(t);
    src.stop(t + 0.21);
  }

  /** 道具：上行 bling 琶音（VIP 开道） */
  private arp(t: number, bus: GainNode): void {
    const seq = ['C5', 'E5', 'G5', 'C6'];
    seq.forEach((n, i) => {
      this.bell(t + i * 0.06, bus, f(n), 0.5, 0.34);
    });
  }

  /** 结算：终端和弦 + 长尾 KA-CHING（买单一刻） */
  private finale(t: number, bus: GainNode): void {
    this.kaChing(t, bus, 4);
    for (const n of ['F3', 'A3', 'C4', 'E4', 'G4']) {
      this.stab(t + 0.22, bus, [n], 2.2);
    }
    this.bell(t + 0.5, bus, f('C6'), 1.6, 0.22);
    this.bell(t + 0.72, bus, f('E6'), 1.4, 0.18);
  }

  /* ---------------- 对外播放 ---------------- */

  /** 播放音效（未解锁 / 关闭音效时静默） */
  sfx(name: SfxName, opts: SfxOptions = {}): void {
    if (!this.sfxOn) return;
    const ctx = this.ensure();
    if (!ctx || !this.sfxBus) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const t = this.now() + 0.01;
    const level = Math.max(0, (opts.cascade ?? 1) - 1);
    const semis = Math.min(level * 2, 12); // 每级连消升 2 个半音

    switch (name) {
      case 'match':
      case 'cascade':
        this.kaChing(t, this.sfxBus, semis);
        this.coinClink(t + 0.06, this.sfxBus, semis);
        break;
      case 'coin':
        this.coinClink(t, this.sfxBus, semis);
        break;
      case 'swap':
        this.swipe(t, this.sfxBus);
        break;
      case 'powerup':
        this.arp(t, this.sfxBus);
        break;
      case 'gameover':
        this.finale(t, this.sfxBus);
        break;
    }
  }
}

/** 全局单例 */
export const audio = new LuxeAudioEngine();
