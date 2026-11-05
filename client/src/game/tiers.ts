import type { TierKey } from "../types";

// Code keys stay Krillion-style (they're what dive.json uses); players see Valorant ranks.
// Change a rank's display name or color here and it changes everywhere in the game.
export const TIERS: Record<TierKey, { name: string; color: string; emoji: string; icon: string }> = {
  plankton:          { name: "Silver",   color: "#c3ccd6", emoji: "⬜", icon: "/ranks/silver.png" },
  too_clever:        { name: "Gold",     color: "#f2c14e", emoji: "🟨", icon: "/ranks/gold.png" },
  schooler:          { name: "Platinum", color: "#3fd1c4", emoji: "🟦", icon: "/ranks/platinum.png" },
  rare:              { name: "Diamond",  color: "#c08cff", emoji: "🟪", icon: "/ranks/diamond.png" },
  deep_cut:          { name: "Immortal", color: "#ff5a6e", emoji: "🟥", icon: "/ranks/immortal.png" },
  one_in_a_krillion: { name: "Radiant",  color: "#fff3a6", emoji: "🏆", icon: "/ranks/radiant.png" },
};
// Share text emoji, lowest to highest (Richard's picks, Nov 2026): ⬜ 🟨 🟦 🟪 🟥 🏆, and ❔ for no answer

// Most obvious to rarest
export const TIER_ORDER: TierKey[] = ["plankton", "too_clever", "schooler", "rare", "deep_cut", "one_in_a_krillion"];

export const MISS = { name: "No answer", color: "#6f86a3", emoji: "❔" };

export const METRES_PER_POINT = 10;
export const MAX_DEPTH = 7000; // 7 perfect Radiant answers
