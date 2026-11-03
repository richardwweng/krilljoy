import type { TierKey } from "../types";

// Code keys stay Krillion-style (they're what dive.json uses); players see Valorant ranks.
// Change a rank's display name or color here and it changes everywhere in the game.
export const TIERS: Record<TierKey, { name: string; color: string; emoji: string }> = {
  plankton:          { name: "Silver",   color: "#c3ccd6", emoji: "⬜" },
  too_clever:        { name: "Gold",     color: "#f2c14e", emoji: "🟨" },
  schooler:          { name: "Platinum", color: "#3fd1c4", emoji: "🟩" },
  rare:              { name: "Diamond",  color: "#c08cff", emoji: "🟪" },
  deep_cut:          { name: "Immortal", color: "#ff5a6e", emoji: "🟥" },
  one_in_a_krillion: { name: "Radiant",  color: "#fff3a6", emoji: "🌟" },
};

// Most obvious to rarest
export const TIER_ORDER: TierKey[] = ["plankton", "too_clever", "schooler", "rare", "deep_cut", "one_in_a_krillion"];

export const MISS = { name: "Not valid", color: "#6f86a3", emoji: "⬛" };

export const METRES_PER_POINT = 10;
export const MAX_DEPTH = 7000; // 7 perfect Radiant answers
