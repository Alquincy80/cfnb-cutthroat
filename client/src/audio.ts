/* Sound for C.F.N.B. Cutthroat — Web Audio API only.
   No audio files, no downloads, no copyrighted music.
   Everything is synthesized with oscillators + a tiny noise buffer.
   All calls are wrapped so audio can never block play: if audio fails,
   the game just keeps playing silently. */

const MUSIC_KEY = "cfnb-music-on";
const SFX_KEY = "cfnb-sfx-on";

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* storage unavailable — settings just don't persist */
  }
}

export function getMusicEnabled(): boolean {
  return readFlag(MUSIC_KEY, false);
}
export function getSfxEnabled(): boolean {
  return readFlag(SFX_KEY, true);
}
export function setMusicEnabled(v: boolean): void {
  writeFlag(MUSIC_KEY, v);
}
export function setSfxEnabled(v: boolean): void {
  writeFlag(SFX_KEY, v);
}

let ctx: AudioContext | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function ensureCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(ctx.destination);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.5;
      sfxGain.connect(ctx.destination);
      // 0.1s white-noise buffer, reused for hats and card snaps.
      const len = Math.floor(ctx.sampleRate * 0.1);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(opts: {
  freq: number;
  freqEnd?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  at?: number;
  music?: boolean;
}): void {
  const c = ensureCtx();
  if (!c || !sfxGain || !musicGain) return;
  try {
    const t0 = opts.at ?? c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), t0 + opts.dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(opts.gain ?? 0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(g);
    g.connect(opts.music ? musicGain : sfxGain);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.05);
  } catch {
    /* silent */
  }
}

function noise(opts: { dur: number; gain?: number; freq?: number; at?: number; music?: boolean }): void {
  const c = ensureCtx();
  if (!c || !noiseBuf || !sfxGain || !musicGain) return;
  try {
    const t0 = opts.at ?? c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const filter = c.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = opts.freq ?? 6000;
    const g = c.createGain();
    g.gain.setValueAtTime(opts.gain ?? 0.15, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(opts.music ? musicGain : sfxGain);
    src.start(t0);
    src.stop(t0 + opts.dur + 0.02);
  } catch {
    /* silent */
  }
}

/* ---------------- Sound effects ---------------- */

function sfx(fn: () => void): void {
  try {
    if (!getSfxEnabled()) return;
    fn();
  } catch {
    /* game plays on silently */
  }
}

export function sfxCardPlay(): void {
  sfx(() => {
    noise({ dur: 0.06, gain: 0.25, freq: 2500 });
    tone({ freq: 190, dur: 0.08, type: "triangle", gain: 0.18 });
  });
}
export function sfxBid(): void {
  sfx(() => {
    tone({ freq: 440, dur: 0.09, type: "triangle", gain: 0.18 });
    tone({ freq: 660, dur: 0.12, type: "triangle", gain: 0.18, at: (ensureCtx()?.currentTime ?? 0) + 0.09 });
  });
}
export function sfxDeal(): void {
  sfx(() => {
    const c = ensureCtx();
    if (!c) return;
    for (let i = 0; i < 5; i++) {
      noise({ dur: 0.05, gain: 0.18, freq: 3000, at: c.currentTime + i * 0.07 });
    }
  });
}
export function sfxWinTrick(): void {
  sfx(() => {
    const c = ensureCtx();
    if (!c) return;
    [523.25, 659.25, 783.99].forEach((f, i) => {
      tone({ freq: f, dur: 0.16, type: "sine", gain: 0.2, at: c.currentTime + i * 0.07 });
    });
  });
}
export function sfxLoseTrick(): void {
  sfx(() => {
    tone({ freq: 180, freqEnd: 110, dur: 0.28, type: "sawtooth", gain: 0.08 });
  });
}
export function sfxHandWin(): void {
  sfx(() => {
    const c = ensureCtx();
    if (!c) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone({ freq: f, dur: 0.22, type: "triangle", gain: 0.2, at: c.currentTime + i * 0.1 });
    });
  });
}
export function sfxGameWin(): void {
  sfx(() => {
    const c = ensureCtx();
    if (!c) return;
    [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) => {
      tone({ freq: f, dur: 0.28, type: "triangle", gain: 0.2, at: c.currentTime + i * 0.13 });
    });
  });
}

/* ---------------- Background music ----------------
   Chill cookout / smooth-jazz loop, ~92 BPM.
   4-bar loop: Am7 – Fmaj7 – Cmaj7 – G6.
   One bar = 8 eighth-note steps. Bass on beats 1 & 3,
   soft chord pad at the bar start, light hat on off-beats,
   a soft pluck note on a pentatonic step. */

const CHORDS: { bass: number; notes: number[] }[] = [
  { bass: 110.0, notes: [220.0, 261.63, 329.63, 392.0] }, // Am7
  { bass: 87.31, notes: [174.61, 220.0, 261.63, 329.63] }, // Fmaj7
  { bass: 130.81, notes: [261.63, 329.63, 392.0, 493.88] }, // Cmaj7
  { bass: 98.0, notes: [196.0, 246.94, 293.66, 329.63] }, // G6
];
const PLUCKS = [440.0, 523.25, 587.33, 659.25, 783.99];

let musicTimer: number | null = null;
let nextStepTime = 0;
let step = 0;

function scheduleStep(s: number, t: number): void {
  const bar = Math.floor(s / 8) % 4;
  const chord = CHORDS[bar]!;
  const inBar = s % 8;
  if (inBar === 0) {
    // Soft chord pad, whole bar.
    for (const f of chord.notes) {
      tone({ freq: f, dur: 2.4, type: "triangle", gain: 0.05, at: t, music: true });
    }
  }
  if (inBar === 0 || inBar === 4) {
    tone({ freq: chord.bass, dur: 0.5, type: "sine", gain: 0.16, at: t, music: true });
  }
  if (inBar % 2 === 1) {
    noise({ dur: 0.04, gain: 0.05, freq: 7000, at: t, music: true });
  }
  if (inBar === 2 || inBar === 6) {
    const p = PLUCKS[(bar * 2 + (inBar === 6 ? 1 : 0)) % PLUCKS.length]!;
    tone({ freq: p, dur: 0.35, type: "sine", gain: 0.07, at: t, music: true });
  }
}

export function startMusic(): void {
  try {
    const c = ensureCtx();
    if (!c) return;
    if (musicTimer != null) return;
    step = 0;
    nextStepTime = c.currentTime + 0.1;
    const stepDur = 60 / 92 / 2; // eighth note at 92 BPM
    musicTimer = window.setInterval(() => {
      if (!ctx) return;
      while (nextStepTime < ctx.currentTime + 0.5) {
        scheduleStep(step, nextStepTime);
        step = (step + 1) % 32;
        nextStepTime += stepDur;
      }
    }, 200);
  } catch {
    /* silent */
  }
}

export function stopMusic(): void {
  try {
    if (musicTimer != null) {
      window.clearInterval(musicTimer);
      musicTimer = null;
    }
  } catch {
    /* silent */
  }
}
