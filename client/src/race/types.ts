// What the race server sends (see server/src/index.ts view()).

export type Phase = "lobby" | "countdown" | "racing" | "results";
export type RaceLength = "short" | "normal" | "long";
export const LENGTHS: { id: RaceLength; label: string; metres: number }[] = [
  { id: "short", label: "Short", metres: 1500 },
  { id: "normal", label: "Normal", metres: 3000 },
  { id: "long", label: "Long", metres: 5000 },
];

export interface RacePlayer {
  id: string;
  name: string;
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

export interface RoomView {
  code: string;
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
  firstFinisher: string | null;
  players: RacePlayer[];
  question: { n: number; promptId: string; text: string; pool: string; shownAt: number; skipAt: number } | null;
  results: ResultRow[] | null;
}

export interface PublicRoom {
  code: string;
  host: string;
  players: number;
  maxPlayers: number;
  phase: Phase;
  length: RaceLength;
}

export type AnswerReply =
  | { kind: "ok"; answerId: string; tier: string; points: number; finished: boolean }
  | { kind: "suggest"; name: string }
  | { kind: "which"; options: string[] }
  | { kind: "invalid" }
  | { kind: "closed" }
  | { kind: "slow" };
