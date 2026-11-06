// Feel & Feedback (spec v1.1 §E): synthesized sound, haptics, settings.
// All audio is generated with WebAudio so the prototype ships with no assets.
// Audio starts only after a user gesture (unlock()).

import { useSyncExternalStore } from 'react';

// ------------------------------------------------------------------ settings

export interface FxSettings {
  sound: boolean;
  music: boolean;
  haptics: boolean;
  reducedMotion: boolean;
  introSeen: boolean;
}

const KEY = 'hunch.settings';
const prefersReduced =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function load(): FxSettings {
  const defaults: FxSettings = { sound: true, music: true, haptics: true, reducedMotion: prefersReduced, introSeen: false };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

let settings = load();
const subs = new Set<() => void>();

export function setSettings(patch: Partial<FxSettings>): void {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  document.documentElement.dataset.motion = settings.reducedMotion ? 'reduced' : 'full';
  if (!settings.music || !settings.sound) music.stop();
  for (const s of subs) s();
}
document.documentElement.dataset.motion = settings.reducedMotion ? 'reduced' : 'full';

export function useSettings(): FxSettings {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    () => settings,
  );
}

// ------------------------------------------------------------------ haptics

const PATTERNS = {
  tap: [8],
  double: [30, 40, 30],
  strong: [60],
  medium: [35],
  success: [40, 50, 40, 50, 120],
  mechanical: [20, 30, 60],
  descending: [120, 60, 80, 60, 40],
  arrival: [25],
  warn: [20],
  celebrate: [50, 40, 50, 40, 50, 40, 200],
} as const;

export function buzz(kind: keyof typeof PATTERNS): void {
  if (!settings.haptics || typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    navigator.vibrate(PATTERNS[kind] as unknown as number[]);
  } catch {
    /* unsupported */
  }
}

// ------------------------------------------------------------------ audio

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function unlock(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
}

function ready(): AudioContext | null {
  if (!settings.sound || !ctx || !master) return null;
  return ctx;
}

function tone(
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; gain?: number; at?: number; slideTo?: number; attack?: number } = {},
): void {
  const c = ready();
  if (!c) return;
  const t = c.currentTime + (opts.at ?? 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
  const peak = opts.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, opts: { gain?: number; at?: number; freq?: number; q?: number; type?: BiquadFilterType } = {}): void {
  const c = ready();
  if (!c) return;
  const t = c.currentTime + (opts.at ?? 0);
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.value = opts.freq ?? 1800;
  f.Q.value = opts.q ?? 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(opts.gain ?? 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t);
}

export const sfx = {
  key: () => tone(1800 + Math.random() * 300, 0.03, { type: 'square', gain: 0.03 }),
  transmission: () => {
    noise(0.5, { gain: 0.12, freq: 2400, q: 0.5 });
    tone(220, 0.9, { type: 'sawtooth', gain: 0.06, slideTo: 660, at: 0.2, attack: 0.2 });
  },
  dial: () => {
    tone(900, 0.05, { type: 'triangle', gain: 0.12 });
    noise(0.04, { gain: 0.08, freq: 3000 });
  },
  strongLink: () => {
    tone(55, 0.7, { type: 'sine', gain: 0.6, slideTo: 40 });
    tone(110, 0.4, { type: 'triangle', gain: 0.2 });
    [1320, 1760, 2217, 2637].forEach((f, i) => tone(f, 0.5, { gain: 0.07, at: 0.08 + i * 0.05 }));
  },
  weakLink: () => {
    tone(82, 0.5, { gain: 0.35, slideTo: 60 });
    tone(880, 0.12, { gain: 0.06, at: 0.05 });
    tone(990, 0.3, { gain: 0.08, at: 0.22 });
  },
  deadAir: () => {
    noise(0.7, { gain: 0.18, freq: 4000, q: 0.3, type: 'highpass' });
    tone(300, 0.6, { type: 'sawtooth', gain: 0.05, slideTo: 60 });
  },
  staticHit: () => {
    noise(0.12, { gain: 0.14, freq: 600, q: 1.5 });
    tone(120, 0.12, { type: 'square', gain: 0.05, slideTo: 80 });
  },
  linked: (tier: 'strong' | 'weak') => {
    const base = tier === 'strong' ? 1568 : 1175;
    tone(base, 0.25, { gain: 0.12 });
    tone(base * 1.5, 0.35, { gain: 0.06, at: 0.06 });
  },
  info: () => tone(660, 0.08, { type: 'triangle', gain: 0.06 }),
  letter: () => {
    noise(0.06, { gain: 0.15, freq: 900, q: 3 });
    tone(1046, 0.18, { type: 'triangle', gain: 0.12, at: 0.04 });
    tone(1568, 0.4, { gain: 0.08, at: 0.12 });
  },
  unlock: () => {
    noise(0.08, { gain: 0.2, freq: 300, q: 2 });
    tone(90, 0.25, { type: 'square', gain: 0.1, slideTo: 70 });
  },
  clunk: () => {
    noise(0.1, { gain: 0.35, freq: 200, q: 2 });
    tone(70, 0.35, { type: 'square', gain: 0.15, slideTo: 45 });
    for (let i = 0; i < 5; i++) noise(0.025, { gain: 0.12, freq: 2500, at: 0.12 + i * 0.045 });
  },
  urgent: () => tone(330, 0.18, { type: 'triangle', gain: 0.12 }),
  crack: () => {
    tone(45, 0.9, { gain: 0.6, slideTo: 35 });
    noise(0.25, { gain: 0.2, freq: 1200 });
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.6, { type: 'triangle', gain: 0.1, at: 0.1 + i * 0.07 }));
  },
  blindHunch: () => {
    tone(40, 1.4, { gain: 0.7, slideTo: 30 });
    [392, 523, 659, 784, 1047, 1319, 1568].forEach((f, i) =>
      tone(f, 1.2, { type: 'sawtooth', gain: 0.045, at: 0.05 + i * 0.06, attack: 0.05 }),
    );
    noise(1.2, { gain: 0.07, freq: 6000, q: 0.4, at: 0.2 });
  },
  rivalCrack: () => {
    tone(880, 0.12, { type: 'square', gain: 0.06 });
    tone(660, 0.18, { type: 'square', gain: 0.06, at: 0.13 });
  },
  collapse: () => tone(200, 0.8, { type: 'sawtooth', gain: 0.1, slideTo: 70 }),
  timeout: () => {
    tone(440, 1.2, { type: 'sawtooth', gain: 0.08, slideTo: 40 });
    noise(1, { gain: 0.06, freq: 500 });
  },
  tally: (i: number) => tone(700 + i * 120, 0.08, { type: 'triangle', gain: 0.1 }),
  reveal: () => [262, 330, 392, 494].forEach((f) => tone(f, 1.4, { type: 'triangle', gain: 0.07, attack: 0.08 })),
  victory: () =>
    [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) =>
      tone(f, 1.6, { type: 'triangle', gain: 0.08, at: i * 0.09, attack: 0.04 }),
    ),
};

// ------------------------------------------------------------------ adaptive music
// One layer per round (§E.1): drone → fifth → pulse → shimmer → heartbeat.

class Music {
  private nodes: { stop: () => void }[] = [];
  private layers = 0;

  setLayers(n: number): void {
    const c = ctx;
    if (!c || !master || !settings.sound || !settings.music) return this.stop();
    n = Math.max(0, Math.min(5, n));
    if (n === this.layers) return;
    this.stop();
    this.layers = n;
    const bus = c.createGain();
    bus.gain.value = 0.0001;
    bus.gain.exponentialRampToValueAtTime(0.5, c.currentTime + 2);
    bus.connect(master);
    const osc = (freq: number, type: OscillatorType, gain: number, lfoHz = 0) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g).connect(bus);
      o.start();
      let lfo: OscillatorNode | null = null;
      if (lfoHz) {
        lfo = c.createOscillator();
        const lg = c.createGain();
        lfo.frequency.value = lfoHz;
        lg.gain.value = gain;
        lfo.connect(lg).connect(g.gain);
        lfo.start();
      }
      this.nodes.push({ stop: () => { o.stop(); lfo?.stop(); } });
    };
    if (n >= 1) osc(55, 'sawtooth', 0.025);
    if (n >= 1) osc(55.4, 'sine', 0.05);
    if (n >= 2) osc(82.4, 'triangle', 0.03);
    if (n >= 3) osc(110, 'square', 0.012, 2);
    if (n >= 4) osc(1318, 'sine', 0.006, 0.3);
    if (n >= 5) osc(41, 'sine', 0.08, 1.1);
    this.nodes.push({
      stop: () => {
        const t = c.currentTime;
        bus.gain.cancelScheduledValues(t);
        bus.gain.setValueAtTime(bus.gain.value, t);
        bus.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      },
    });
  }

  stop(): void {
    const nodes = this.nodes;
    this.nodes = [];
    this.layers = 0;
    const last = nodes.pop();
    last?.stop();
    setTimeout(() => nodes.forEach((n) => n.stop()), 700);
  }
}

export const music = new Music();
