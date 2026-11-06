// What the race server sends (see server/src/index.ts view()).

export type Phase = "lobby" | "countdown" | "racing" | "results";
export type Mode = "race" | "spike";
export const MODES: { id: Mode; name: string; icon: string; blurb: string; max: number; quick: number }[] = [
  { id: "race", name: "Treasure race", icon: "⚑", blurb: "Same questions for everyone, back to back. Rarer answers sink you faster. First to the chest wins.", max: 10, quick: 8 },
  { id: "spike", name: "Spike splash", icon: "✹", blurb: "Take turns naming answers around the circle. Run out of time and the spike goes off on you. Rare answers earn extra lives.", max: 8, quick: 6 },
];
export const modeInfo = (m: Mode) => MODES.find((x) => x.id === m)!;

export type SpikePace = "short" | "normal" | "long";
export const PACES: { id: SpikePace; label: string; note: string }[] = [
  { id: "short", label: "Short", note: "4–9 answers" },
  { id: "normal", label: "Normal", note: "8–18 answers" },
  { id: "long", label: "Long", note: "till it goes off" },
];
export type RaceLength = "short" | "normal" | "long";
export const LENGTHS: { id: RaceLength; label: string; metres: number }[] = [
  { id: "short", label: "Short", metres: 3000 },
  { id: "normal", label: "Normal", metres: 5000 },
  { id: "long", label: "Long", metres: 7000 },
];

export interface RacePlayer {
  id: string;
  name: string;
  emote: { emoji: string; at: number } | null;
  avatar: string; // agent name (Spike splash)
  connected: boolean;
  left: boolean;
  depth: number;
  answered: number;
  skips: number;
  finished: boolean;
  place: number | null;
}

export interface RoundLog {
  promptId: string;
  text: string;
  typed: string;
  answerId: string | null; // null = skipped
  tier: string | null;
  points: number;
  ms: number;
}

export interface ResultRow {
  id: string;
  place: number;
  name: string;
  depth: number;
  finished: boolean;
  timeMs: number | null;
  skips: number;
  misses: number;
  history: RoundLog[];
}

export interface SpikeSaid { answerId: string; tier: string; points: number; by: string }

export type SpikeEvent =
  | { kind: "start"; at: number }
  | { kind: "detonate"; at: number; on: string; out: boolean }
  | { kind: "next"; at: number }
  | { kind: "left"; at: number; who: string };

export interface SpikeResult {
  id: string;
  place: number;
  name: string;
  lives: number;
  out: boolean;
  points: number;
  detonations: number;
  misses: number;
  livesGained: number;
  said: (SpikeSaid & { promptId: string; text: string })[];
}

export interface SpikeView {
  lives: number; // starting lives
  maxLives: number;
  lifeEvery: number; // meter points per extra life
  lastLife: { on: string; at: number } | null;
  qNumber: number;
  question: { text: string; pool: string; total: number; limit: number | null } | null;
  said: SpikeSaid[];
  turn: string;
  turnStartsAt: number;
  turnEndsAt: number;
  seats: { id: string; lives: number; out: boolean; points: number; answers: number; meter: number;
    meterParts: { tier: string; points: number }[]; last: { answerId: string; tier: string } | null }[];
  event: SpikeEvent;
  results: SpikeResult[] | null;
}

export interface RoomView {
  code: string;
  mode: Mode;
  pace: SpikePace;
  phase: Phase;
  isPublic: boolean;
  hostId: string | null;
  you: string;
  length: RaceLength;
  target: number;
  maxPlayers: number;
  now: number;
  countdownEndsAt: number | null;
  autoStartAt: number | null;
  returnAt: number | null;
  lastCallEndsAt: number | null;
  endReason: "chest" | "idle" | null;
  firstFinisher: string | null;
  players: RacePlayer[];
  question: { n: number; promptId: string; text: string; pool: string; shownAt: number; skipAt: number } | null;
  results: ResultRow[] | null;
  spike: SpikeView | null;
  chat: ChatLine[];
  quickChat: string[];
  emotes: string[];
}

export interface ChatLine { id: number; by: string | null; name: string; text: string; at: number }

export interface PublicRoom {
  code: string;
  host: string;
  players: number;
  maxPlayers: number;
  phase: Phase;
  length: RaceLength;
  mode: Mode;
  pace: SpikePace;
}

export type AnswerReply =
  | { kind: "ok"; answerId: string; tier: string; points: number; finished: boolean }
  | { kind: "suggest"; name: string }
  | { kind: "which"; options: string[] }
  | { kind: "invalid" }
  | { kind: "closed" }
  | { kind: "slow" };

export type SpikeReply =
  | { kind: "ok"; answerId: string; tier: string; points: number; newQuestion: boolean; lifeGained: boolean }
  | { kind: "suggest"; name: string }
  | { kind: "which"; options: string[] }
  | { kind: "used"; answerId: string; by: string; byName: string }
  | { kind: "invalid" }
  | { kind: "notYourTurn" }
  | { kind: "closed" }
  | { kind: "slow" };
