// Spike splash: take turns around the circle naming answers to the same question.
// Each turn has a clock; run out of time and the spike detonates on you (-1 life).
// Lose both lives and you're out. Last one standing wins.
// Pure rules, no networking (that's index.ts), like race.ts.
import { ambiguousOptions, matchAnswer } from "../../shared/match.ts";
import { allPrompts, getPrompt, knownAnswerNames, type Prompt } from "./data.ts";

export const SPIKE_MIN_ANSWERS = 15; // only questions with 15+ answers (Richard's call)
export const SPIKE_LIVES = 2;
// Extra lives, like Krillion's heart meter: every answer adds its rank points (Silver 10 …
// Radiant 100) to your meter; a full meter = +1 life (Richard's call). Never more than MAX_LIVES.
export const LIFE_EVERY = 400;
export const MAX_LIVES = 4;
export const TURN_START_MS = 15_000; // first lap: 15 s per turn...
export const TURN_STEP_MS = 1_000; // ...1 s shorter each lap around the table...
export const TURN_MIN_MS = 7_000; // ...down to 7 s
export const BREAK_MS = 3_000; // pause after a detonation or a new question, so everyone can read it

export type SpikePace = "short" | "normal" | "long";
export const SPIKE_PACES: SpikePace[] = ["short", "normal", "long"];

/** How many answers a question lasts before the next one (unless someone detonates first).
 *  Normal: a quarter of its answers + 2, at least 8 (so everyone in a room of 8 gets a
 *  turn) and at most 18. Short: half that. Long: until someone detonates. */
export function answerLimit(answers: number, pace: SpikePace): number {
  const normal = Math.min(18, Math.max(8, Math.round(answers / 4) + 2));
  if (pace === "short") return Math.max(4, Math.round(normal / 2));
  if (pace === "long") return Infinity;
  return normal;
}

export interface Said {
  answerId: string;
  tier: string;
  points: number;
  by: string; // player id
}

export interface SpikePlayer {
  id: string;
  lives: number;
  outAt: number | null; // when they lost their last life (or left)
  points: number; // rank points of everything they said (for the results)
  meter: number; // toward the next extra life (0 … LIFE_EVERY)
  meterParts: { tier: string; points: number }[]; // what filled the meter, answer by answer (sums to meter)
  last: { answerId: string; tier: string } | null; // their latest answer, shown by their seat until they answer again
  livesGained: number;
  said: (Said & { promptId: string })[];
  misses: number;
  detonations: number;
}

export type SpikeEvent =
  | { kind: "start"; at: number }
  | { kind: "detonate"; at: number; on: string; out: boolean }
  | { kind: "next"; at: number } // the question used up its answers: on to the next one
  | { kind: "left"; at: number; who: string };

export interface Spike {
  seats: string[]; // the circle, in join order
  players: Map<string, SpikePlayer>;
  pace: SpikePace;
  deck: string[]; // shuffled question ids
  promptId: string;
  qNumber: number;
  said: Said[]; // answers given to the current question
  turn: string; // whose turn it is
  turnStartsAt: number; // after a break this is in the future: no answers until then
  turnEndsAt: number;
  turns: number; // turns finished so far (for the shrinking clock)
  event: SpikeEvent;
  lastLife: { on: string; at: number } | null; // the latest extra life, for a "+1" pop
  endedAt: number | null;
  startAt: number;
}

function eligible(): Prompt[] {
  return allPrompts().filter((p) => p.answers.length >= SPIKE_MIN_ANSWERS);
}

/** Shuffled, with no two questions of the same kind in a row when possible. */
function makeDeck(): string[] {
  const pool = [...eligible()];
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

const alive = (s: Spike) => s.seats.filter((id) => s.players.get(id)!.outAt === null);

/** The clock for the next turn: 15 s, then 1 s less each time around the table, min 7 s. */
function turnLength(s: Spike): number {
  const lap = Math.floor(s.turns / Math.max(1, alive(s).length));
  return Math.max(TURN_MIN_MS, TURN_START_MS - lap * TURN_STEP_MS);
}

/** The next player still in, going round the circle after `from`. */
function nextAfter(s: Spike, from: string): string {
  const n = s.seats.length;
  const i = s.seats.indexOf(from);
  for (let k = 1; k <= n; k++) {
    const id = s.seats[(i + k) % n];
    if (s.players.get(id)!.outAt === null) return id;
  }
  return from;
}

function startTurn(s: Spike, who: string, at: number) {
  s.turn = who;
  s.turnStartsAt = at;
  s.turnEndsAt = at + turnLength(s);
}

function nextQuestion(s: Spike) {
  if (!s.deck.length) s.deck = makeDeck().filter((id) => id !== s.promptId); // went through them all
  s.promptId = s.deck.shift()!;
  s.qNumber++;
  s.said = [];
}

export function currentSpikePrompt(s: Spike): Prompt | undefined {
  let p = getPrompt(s.promptId);
  // The question was removed from the answer file mid-game (a deploy): take the next one
  for (let tries = 0; (!p || p.answers.length < SPIKE_MIN_ANSWERS) && tries < 20; tries++) {
    nextQuestion(s);
    p = getPrompt(s.promptId);
  }
  return p;
}

export function startSpike(ids: string[], pace: SpikePace, startAt: number): Spike {
  const players = new Map<string, SpikePlayer>();
  for (const id of ids) players.set(id, { id, lives: SPIKE_LIVES, outAt: null, points: 0, meter: 0, meterParts: [], last: null, livesGained: 0, said: [], misses: 0, detonations: 0 });
  const s: Spike = {
    seats: [...ids], players, pace, deck: makeDeck(), promptId: "", qNumber: 0, said: [],
    turn: ids[Math.floor(Math.random() * ids.length)], turnStartsAt: startAt, turnEndsAt: startAt,
    turns: 0, event: { kind: "start", at: startAt }, lastLife: null, endedAt: null, startAt,
  };
  nextQuestion(s);
  startTurn(s, s.turn, startAt);
  return s;
}

export type SpikeAnswer =
  | { kind: "ok"; answerId: string; tier: string; points: number; newQuestion: boolean; lifeGained: boolean }
  | { kind: "suggest"; name: string }
  | { kind: "which"; options: string[] }
  | { kind: "used"; answerId: string; by: string } // already said for this question
  | { kind: "invalid" }
  | { kind: "notYourTurn" }
  | { kind: "closed" };

export function submitSpike(s: Spike, who: string, typed: string, now: number): SpikeAnswer {
  if (s.endedAt !== null) return { kind: "closed" };
  if (s.turn !== who || now < s.turnStartsAt || now >= s.turnEndsAt) return { kind: "notYourTurn" };
  const prompt = currentSpikePrompt(s);
  const me = s.players.get(who);
  if (!prompt || !me) return { kind: "closed" };
  const text = typed.trim().slice(0, 60);
  const match = matchAnswer(prompt, text, knownAnswerNames());
  if (!match) {
    const options = ambiguousOptions(prompt, text);
    if (options.length) return { kind: "which", options };
    me.misses++;
    return { kind: "invalid" };
  }
  if (match.corrected) return { kind: "suggest", name: match.answer.id };
  const a = match.answer;
  const before = s.said.find((x) => x.answerId === a.id);
  if (before) return { kind: "used", answerId: a.id, by: before.by };

  const said = { answerId: a.id, tier: a.tier, points: a.points, by: who };
  s.said.push(said);
  me.said.push({ ...said, promptId: prompt.id });
  me.points += a.points;
  me.last = { answerId: a.id, tier: a.tier };
  const lifeGained = fillMeter(s, me, a.tier, a.points, now);
  s.turns++;

  // Move on to a new question once it has had its share of answers, or when there
  // aren't enough unused answers left for everyone still in to have a fair go.
  const left = prompt.answers.length - s.said.length;
  const done = s.said.length >= answerLimit(prompt.answers.length, s.pace) || left < alive(s).length;
  const next = nextAfter(s, who);
  if (done) {
    nextQuestion(s);
    s.event = { kind: "next", at: now };
    startTurn(s, next, now + BREAK_MS);
  } else {
    startTurn(s, next, now);
  }
  return { kind: "ok", answerId: a.id, tier: a.tier, points: a.points, newQuestion: done, lifeGained };
}

/** Add an answer's points to the meter; a full meter turns into an extra life.
 *  At the most lives you can have, the meter stops just short of full (it pays out
 *  as soon as you lose a life and answer again). */
function fillMeter(s: Spike, p: SpikePlayer, tier: string, points: number, now: number): boolean {
  p.meter += points;
  p.meterParts.push({ tier, points });
  if (p.meter < LIFE_EVERY) return false;
  if (p.lives >= MAX_LIVES) {
    p.meter = LIFE_EVERY - 1;
    trimParts(p);
    return false;
  }
  p.meter -= LIFE_EVERY;
  // The answer that filled the bar spills over: its leftover starts the next bar
  p.meterParts = p.meter > 0 ? [{ tier, points: p.meter }] : [];
  p.lives++;
  p.livesGained++;
  s.lastLife = { on: p.id, at: now };
  return true;
}

/** Keep the coloured pieces adding up to the (capped) meter. */
function trimParts(p: SpikePlayer) {
  let room = p.meter;
  p.meterParts = p.meterParts.flatMap((x) => {
    const take = Math.min(x.points, room);
    room -= take;
    return take > 0 ? [{ tier: x.tier, points: take }] : [];
  });
}

/** Call often (a few times a second). Detonates the spike when a turn runs out.
 *  Returns true when something changed that everyone should see. */
export function tickSpike(s: Spike, now: number): boolean {
  if (s.endedAt !== null || now < s.turnEndsAt) return false;
  const p = s.players.get(s.turn)!;
  p.lives--;
  p.detonations++;
  p.last = null; // they didn't answer this time
  if (p.lives <= 0) p.outAt = now;
  s.turns++;
  s.event = { kind: "detonate", at: now, on: p.id, out: p.lives <= 0 };
  if (finished(s, now)) return true;
  nextQuestion(s); // like Krillion's Puffer Party: a fresh question after every detonation
  startTurn(s, nextAfter(s, p.id), now + BREAK_MS);
  return true;
}

/** Someone left (or was gone too long): they're out. If it was their turn, pass it on. */
export function leaveSpike(s: Spike, who: string, now: number) {
  const p = s.players.get(who);
  if (!p || p.outAt !== null || s.endedAt !== null) return;
  p.outAt = now;
  p.lives = 0;
  s.event = { kind: "left", at: now, who };
  if (finished(s, now)) return;
  if (s.turn === who) startTurn(s, nextAfter(s, who), Math.max(now, s.turnStartsAt));
}

function finished(s: Spike, now: number): boolean {
  const still = alive(s).length;
  // With 2+ players: the last one standing wins. Practising alone: until you're out.
  if (still === 0 || (s.seats.length > 1 && still <= 1)) {
    s.endedAt = now;
    return true;
  }
  return false;
}

/** Placings: the survivor, then whoever went out last; ties go to more points. */
export function spikeStandings(s: Spike): SpikePlayer[] {
  return [...s.players.values()].sort((a, b) => {
    if ((a.outAt === null) !== (b.outAt === null)) return a.outAt === null ? -1 : 1;
    return (b.outAt ?? 0) - (a.outAt ?? 0) || b.points - a.points;
  });
}
