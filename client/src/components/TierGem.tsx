import type { TierKey } from "../types";
import { MISS, TIERS } from "../game/tiers";
import Sprite from "./Sprite";
import { GEM, X_MARK } from "./sprites";

/** The pixel gem for a rank, or a red X for a miss. */
export default function TierGem({ tier, scale = 3 }: { tier: TierKey | null; scale?: number }) {
  if (!tier) return <Sprite rows={X_MARK} colors={{ X: "#ff4655" }} scale={Math.round(scale * 1.3)} label={MISS.name} style={{ margin: `0 ${scale / 2}px` }} />;
  const colors = gemColors(TIERS[tier].color);
  return <Sprite rows={GEM} colors={colors} scale={scale} label={TIERS[tier].name} />;
}

const cache = new Map<string, Record<string, string>>();
function gemColors(color: string) {
  if (!cache.has(color)) cache.set(color, { X: color, H: "#ffffffcc", D: "#00000055" });
  return cache.get(color)!;
}
