import type { Prompt } from "../types";

// Everyone gets the same 7 prompts each day; a new dive starts at midnight Eastern.
export const LAUNCH_DATE = "2026-11-03"; // Dive #1. Change this when the game goes public.
export const PROMPTS_PER_DIVE = 7;
export const SECONDS_PER_PROMPT = 25;
const TIME_ZONE = "America/New_York";

/** Today's date in Eastern time, as "YYYY-MM-DD". */
export function easternDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Dive #1 on the launch date, #2 the day after, ... */
export function diveNumber(date: string): number {
  const days = (Date.parse(date + "T00:00:00Z") - Date.parse(LAUNCH_DATE + "T00:00:00Z")) / 86_400_000;
  return Math.max(1, Math.round(days) + 1);
}

/** Milliseconds until the next dive (next midnight Eastern). */
export function msUntilNextDive(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0) % 24;
  const elapsed = (get("hour") * 3600 + get("minute") * 60 + get("second")) * 1000 + now.getMilliseconds();
  return 86_400_000 - elapsed;
}

export function prettyDate(date: string): string {
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

// Small seeded random number generator, so the same date always gives the same dive
function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const isProScene = (p: Prompt) => p.pool === "players" || p.pool === "teams";

/** The day's prompts: a mix of 3–4 pro-scene and 3–4 game-content prompts, in a shuffled order. */
export function pickDaily(prompts: Prompt[], date: string): Prompt[] {
  const rand = mulberry32(seedFrom("krilljoy:" + date));
  const shuffled = [...prompts].sort((a, b) => a.id.localeCompare(b.id));
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const n = Math.min(PROMPTS_PER_DIVE, shuffled.length);
  const pro = shuffled.filter(isProScene);
  const game = shuffled.filter((p) => !isProScene(p));
  let wantPro = rand() < 0.5 ? 3 : 4;
  wantPro = Math.min(wantPro, pro.length, n);
  const wantGame = Math.min(n - wantPro, game.length);
  wantPro = n - wantGame; // top up if one side runs short
  const chosen = new Set([...pro.slice(0, wantPro), ...game.slice(0, wantGame)]);
  return shuffled.filter((p) => chosen.has(p));
}
