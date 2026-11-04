// Krilljoy sound effects, all made by the browser (Web Audio): no audio files.
// Previewed and approved by Richard (Nov 2026). Mute choice is remembered in this browser.
import type { TierKey } from "../types";

const MUTE_KEY = "krilljoy:muted";
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = (() => {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
})();

export const isMuted = () => muted;
export function setMuted(value: boolean) {
  muted = value;
  try { localStorage.setItem(MUTE_KEY, value ? "1" : "0"); } catch { /* storage blocked: fine */ }
  if (master) master.gain.value = value ? 0 : 0.6;
}

/** The audio engine, created on first use (browsers only allow sound after a tap). Null if muted/unsupported. */
function ac(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface ToneOpts { type?: OscillatorType; vol?: number; slide?: number; out?: AudioNode }
/** One note: quick attack, decay, optional pitch slide. */
function tone(freq: number, start: number, dur: number, { type = "square", vol = 0.18, slide, out }: ToneOpts = {}) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + start;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(out ?? master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** A burst of filtered noise (splashes, whooshes, sparkle). */
function noise(start: number, dur: number, { vol = 0.2, from = 2000, to = 300, type = "lowpass" as BiquadFilterType } = {}) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + start;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
  src.stop(t + dur);
}

const note = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const arp = (notes: number[], step: number, opts?: ToneOpts) => notes.forEach((n, i) => tone(note(n), i * step, 0.16, opts));
const bubble = (at = 0) => tone(320 + Math.random() * 200, at, 0.07, { type: "sine", vol: 0.15, slide: 900 + Math.random() * 400 });

export const sound = {
  click() { tone(1320, 0, 0.04, { vol: 0.08 }); },
  /** Countdown, last 5 seconds; the final second is higher */
  tick(last = false) { tone(last ? 1760 : 1180, 0, 0.05, { vol: 0.12 }); },
  wrong() {
    tone(196, 0, 0.12, { type: "sawtooth", vol: 0.12 });
    tone(147, 0.11, 0.2, { type: "sawtooth", vol: 0.12 });
  },
  /** Autocorrect bubble: a rising "hm?" */
  suggest() {
    tone(523, 0, 0.09, { type: "triangle", vol: 0.2 });
    tone(698, 0.08, 0.14, { type: "triangle", vol: 0.2 });
  },
  /** Lock-in chime: rarer = higher, longer, sparklier */
  rank(tier: TierKey) {
    switch (tier) {
      case "plankton": tone(note(76), 0, 0.14); break; // Silver: one blip
      case "too_clever": tone(note(79), 0, 0.12); tone(note(75), 0.1, 0.22, { type: "triangle" }); break; // Gold: a wry drop
      case "schooler": arp([72, 76, 79], 0.07, { type: "triangle", vol: 0.22 }); break; // Platinum
      case "rare": // Diamond
        arp([72, 76, 79, 84], 0.065, { type: "triangle", vol: 0.22 });
        tone(note(91), 0.28, 0.3, { type: "sine", vol: 0.08 });
        break;
      case "deep_cut": // Immortal
        tone(note(45), 0, 0.35, { type: "triangle", vol: 0.3 });
        arp([69, 72, 76, 81, 84], 0.06, { vol: 0.14 });
        tone(note(88), 0.32, 0.35, { type: "sine", vol: 0.1 });
        break;
      case "one_in_a_krillion": // Radiant
        tone(note(48), 0, 0.6, { type: "triangle", vol: 0.3 });
        arp([72, 76, 79, 84, 88, 91, 96], 0.05, { vol: 0.12 });
        for (let i = 0; i < 8; i++) tone(note(96 + (i % 2) * 4), 0.36 + i * 0.045, 0.08, { type: "sine", vol: 0.09 });
        noise(0.32, 0.5, { vol: 0.05, from: 9000, to: 4000, type: "highpass" });
        break;
    }
  },
  /** BEGIN DIVE */
  splash() {
    noise(0, 0.5, { vol: 0.3, from: 3000, to: 400 });
    tone(110, 0, 0.3, { type: "sine", vol: 0.3, slide: 55 });
    for (let i = 0; i < 5; i++) bubble(0.15 + i * 0.07);
  },
  /** DESCEND */
  descend() {
    noise(0, 1.4, { vol: 0.22, from: 1400, to: 160 });
    for (let i = 0; i < 7; i++) bubble(0.1 + i * 0.13 + Math.random() * 0.05);
  },
  /** End screen: one ping with echoes */
  sonar() {
    const c = ac();
    if (!c || !master) return;
    const delay = c.createDelay();
    delay.delayTime.value = 0.32;
    const fb = c.createGain();
    fb.gain.value = 0.35;
    delay.connect(fb); fb.connect(delay); delay.connect(master);
    tone(1046, 0, 1.1, { type: "sine", vol: 0.22 });
    tone(1046, 0, 1.1, { type: "sine", vol: 0.12, out: delay });
  },
  /** End screen, big scores */
  fanfare() {
    ([[72, 0, 0.12], [76, 0.12, 0.12], [79, 0.24, 0.12], [84, 0.36, 0.5], [79, 0.62, 0.12], [84, 0.74, 0.7]] as const)
      .forEach(([n, at, d]) => tone(note(n), at, d, { vol: 0.13 }));
    ([[48, 0, 0.36], [55, 0.36, 0.38], [60, 0.74, 0.7]] as const)
      .forEach(([n, at, d]) => tone(note(n), at, d, { type: "triangle", vol: 0.25 }));
  },
};
