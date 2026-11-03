import type { RoundResult, TierKey } from "../types";

// Progress lives in this browser only (localStorage). Every read/write is wrapped,
// because private windows and some browsers block storage.

export interface SavedDive {
  date: string;
  promptIds: string[];
  rounds: RoundResult[];
  awaitingDescend: boolean;      // answered the current round, looking at the reveal
  roundStartedAt: number | null; // so reloading the page doesn't reset the clock
}

export interface HistoryEntry { points: number; tiers: (TierKey | null)[] }

const diveKey = (date: string) => `krilljoy:dive:${date}`;
const HISTORY_KEY = "krilljoy:history";

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the dive still works, it just won't survive a reload */
  }
}

export const loadDive = (date: string) => read<SavedDive>(diveKey(date));
export const saveDive = (dive: SavedDive) => write(diveKey(dive.date), dive);

export const loadHistory = () => read<Record<string, HistoryEntry>>(HISTORY_KEY) ?? {};
export function recordHistory(date: string, entry: HistoryEntry) {
  write(HISTORY_KEY, { ...loadHistory(), [date]: entry });
}
