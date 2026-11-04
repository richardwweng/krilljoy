// The race itself: the shared question order, checking answers, skipping, finishing,
// the last call, and placings. No networking in here (that's index.ts), so the rules
// are easy to read and test.
import { ambiguousOptions, matchAnswer } from "../../shared/match.ts";
import { allPrompts, getPrompt, knownAnswerNames, type Prompt } from "./data.ts";

export const RACE_LENGTHS = { short: 1500, normal: 3000, long: 5000 } as const; // metres to the chest
export type RaceLength = keyof typeof RACE_LENGTHS;
export const METRES_PER_POINT = 10;
export const SKIP_AFTER_MS = 25_000; // Skip unlocks 25 s into a question (Richard's call); skipping = 0 m
export const LAST_CALL_MS = 30_000; // after the first player opens the chest, everyone else gets 30 s
export const IDLE_END_MS = 15 * 60_000; // nobody answers, guesses or skips for 15 min: end the race (Richard's call)

export interface RoundLog {
  promptId: string;
  typed: string;
  answerId: string | null; // null = skipped
  tier: string | null;
  points: number;
  ms: number; // how long the question took
}

export interface Racer {
  id: string;
  depth: number; // metres
  index: number; // which question they're on (0-based) in the shared order
  shownAt: number; // when their current question appeared
  finishedAt: number | null; // reached the chest
  misses: number;
  skips: number;
  history: RoundLog[];
}

export interface Race {
  order: string[]; // prompt ids, the same for everyone
  target: number; // metres to the chest
  startAt: number;
  lastCallEndsAt: number | null;
  firstFinisher: string | null;
  endedAt: number | null;
  endReason: "chest" | "idle" | null; // "idle" = ended because nobody played for IDLE_END_MS
  lastActivityAt: number; // last answer, guess or skip by anyone
  racers: Map<string, Racer>;
}

/** A shuffled question order, the same for every player in the race. Avoids two
 *  questions of the same kind in a row (two skin questions back to back) when it can. */
export function makeOrder(prompts: Prompt[] = allPrompts()): string[] {
  const pool = [...prompts];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out: Prompt[] = [];
  while (pool.length) {
    const prev = out[out.length - 1]?.pool;
    const k = pool.findIndex((p) => p.pool !== prev);
    out.push(pool.splice(k === -1 ? 0 : k, 1)[0]);
  }
  return out.map((p) => p.id);
}

export function startRace(playerIds: string[], length: RaceLength, startAt: number): Race {
  const racers = new Map<string, Racer>();
  for (const id of playerIds) {
    racers.set(id, { id, depth: 0, index: 0, shownAt: startAt, finishedAt: null, misses: 0, skips: 0, history: [] });
  }
  return { order: makeOrder(), target: RACE_LENGTHS[length], startAt, lastCallEndsAt: null, firstFinisher: null, endedAt: null, endReason: null, lastActivityAt: startAt, racers };
}

/** The question a racer is looking at now (null when finished, or out of questions). */
export function currentPrompt(race: Race, r: Racer): Prompt | null {
  if (r.finishedAt !== null || race.endedAt !== null) return null;
  while (r.index < race.order.length) {
    const p = getPrompt(race.order[r.index]);
    if (p) return p;
    r.index++; // a question was removed from the answer file mid-race: move past it
  }
  return null;
}

export type AnswerResult =
  | { kind: "ok"; answerId: string; tier: string; points: number; finished: boolean }
  | { kind: "suggest"; name: string } // close spelling: the player confirms it (like the daily game)
  | { kind: "which"; options: string[] } // "reaver" fits several answers
  | { kind: "invalid" }
  | { kind: "closed" }; // race over / already finished

export function submitAnswer(race: Race, r: Racer, typed: string, now: number): AnswerResult {
  const prompt = currentPrompt(race, r);
  if (!prompt || now < race.startAt) return { kind: "closed" };
  const text = typed.trim().slice(0, 60);
  race.lastActivityAt = now; // any guess counts as someone still playing
  const match = matchAnswer(prompt, text, knownAnswerNames());
  if (!match) {
    const options = ambiguousOptions(prompt, text);
    if (options.length) return { kind: "which", options };
    r.misses++;
    return { kind: "invalid" };
  }
  if (match.corrected) return { kind: "suggest", name: match.answer.id };
  const a = match.answer;
  r.history.push({ promptId: prompt.id, typed: text, answerId: a.id, tier: a.tier, points: a.points, ms: now - r.shownAt });
  r.depth += a.points * METRES_PER_POINT;
  advance(race, r, now);
  return { kind: "ok", answerId: a.id, tier: a.tier, points: a.points, finished: r.finishedAt !== null };
}

/** Skip the current question (0 m). Only after SKIP_AFTER_MS on it. */
export function skip(race: Race, r: Racer, now: number): boolean {
  const prompt = currentPrompt(race, r);
  if (!prompt || now - r.shownAt < SKIP_AFTER_MS) return false;
  r.history.push({ promptId: prompt.id, typed: "", answerId: null, tier: null, points: 0, ms: now - r.shownAt });
  r.skips++;
  race.lastActivityAt = now;
  advance(race, r, now);
  return true;
}

function advance(race: Race, r: Racer, now: number) {
  r.index++;
  r.shownAt = now;
  if (r.depth >= race.target && r.finishedAt === null) {
    r.finishedAt = now;
    if (!race.firstFinisher) {
      race.firstFinisher = r.id;
      race.lastCallEndsAt = now + LAST_CALL_MS;
    }
  }
}

/** Is the race over? Everyone finished, the last call ran out, nobody can continue,
 *  or nobody has played for IDLE_END_MS (a forgotten tab shouldn't keep a room open forever). */
export function isOver(race: Race, now: number, activeIds: Set<string>): boolean {
  if (race.endedAt !== null) return true;
  if (race.lastCallEndsAt !== null && now >= race.lastCallEndsAt) return true;
  if (now - race.lastActivityAt >= IDLE_END_MS) {
    race.endReason = "idle";
    return true;
  }
  const stillRacing = [...race.racers.values()].filter((r) => activeIds.has(r.id) && r.finishedAt === null && currentPrompt(race, r));
  return stillRacing.length === 0;
}

/** Placings: everyone who reached the chest, in the order they got there; then everyone
 *  else by depth (deeper first), ties going to fewer skips. */
export function standings(race: Race): Racer[] {
  return [...race.racers.values()].sort((a, b) => {
    if (a.finishedAt !== null || b.finishedAt !== null) {
      if (a.finishedAt === null) return 1;
      if (b.finishedAt === null) return -1;
      return a.finishedAt - b.finishedAt;
    }
    return b.depth - a.depth || a.skips - b.skips;
  });
}
