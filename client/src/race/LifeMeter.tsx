import { TIERS } from "../game/tiers";
import type { TierKey } from "../types";

export type MeterPart = { tier: string; points: number };

/** The extra-life bar, built from the answers that filled it: each answer adds a piece in its
 *  rank colour, sized by its points (a Silver answer is a sliver, a Radiant one a big chunk). */
export default function LifeMeter({ parts, lifeEvery, className = "" }: { parts: MeterPart[]; lifeEvery: number; className?: string }) {
  const total = parts.reduce((n, p) => n + p.points, 0);
  return (
    <span className={`meter ${className}`} role="meter" aria-valuemin={0} aria-valuemax={lifeEvery} aria-valuenow={total}
      aria-label={`${total} of ${lifeEvery} toward an extra life`}>
      {parts.map((p, i) => (
        <i key={i} style={{ width: `${(p.points / lifeEvery) * 100}%`, background: TIERS[p.tier as TierKey]?.color ?? "#ff7ac6" }} />
      ))}
    </span>
  );
}
