// The shape of client/public/data/dive.json, written by the pipeline (pipeline/prompts.py publish()).

export type TierKey = "plankton" | "too_clever" | "schooler" | "rare" | "deep_cut" | "one_in_a_krillion";

export interface Answer {
  id: string;            // what we show, e.g. "TenZ" or "Reaver Vandal"
  aliases: string[];     // other spellings that count as this answer
  icon: string | null;
  source?: string;       // Liquipedia page for pro answers
  tier: TierKey;
  points: number;
  share?: number;        // estimated % of fans who'd give this answer
  evidence?: Record<string, unknown>;
}

export interface Prompt {
  id: string;
  text: string;
  pool: string;          // "players", "teams", "skins", "callouts", "list", ...
  answers: Answer[];     // most obvious first
}

export interface DiveData {
  generated: string;
  attribution: string;
  tier1_definition?: string;
  prompts: Prompt[];
}

// One answered round, saved in the browser
export interface RoundResult {
  promptId: string;
  typed: string;              // exactly what the player typed ("" = nothing / time ran out)
  answerId: string | null;    // the answer it matched, null = not valid
  tier: TierKey | null;
  points: number;
  timedOut: boolean;
  corrected?: boolean;       // a typo was fixed to reach the answer
  misses?: number;           // wrong guesses before this answer
}
