import type { TierKey } from "../types";
import { MISS, TIERS } from "../game/tiers";
import Sprite from "./Sprite";
import { X_MARK } from "./sprites";

/** The Valorant rank icon for a tier, or a red pixel X for no answer. size ~ scale x 8 px. */
export default function TierGem({ tier, scale = 3 }: { tier: TierKey | null; scale?: number }) {
  const size = scale * 8;
  if (!tier) {
    const px = Math.max(2, Math.round(size / 6));
    return <Sprite rows={X_MARK} colors={{ X: "#ff4655" }} scale={px} label={MISS.name} style={{ margin: (size - px * 5) / 2 }} />;
  }
  return <img className="rank-icon" src={TIERS[tier].icon} alt={TIERS[tier].name} width={size} height={size} draggable={false} />;
}
