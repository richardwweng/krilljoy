import type { RoundResult } from "../types";
import { MISS, TIERS } from "../game/tiers";

interface Props {
  depth: number;
  points: number;
  rounds: RoundResult[];
  total: number;
  roundLabel: string;
}

/** Depth on the left, one square per round in the middle (colored by rank once answered), score on the right. */
export default function Hud({ depth, points, rounds, total, roundLabel }: Props) {
  return (
    <div className="hud">
      <div className="hud-box">
        <div className="label">Depth</div>
        <div className="hud-value depth">{depth.toLocaleString("en-US")}<small> m</small></div>
      </div>
      <div className="hud-rounds">
        <div className="round-squares">
          {Array.from({ length: total }, (_, i) => {
            const r = rounds[i];
            const current = i === rounds.length;
            const color = r ? (r.tier ? TIERS[r.tier].color : MISS.color) : undefined;
            return <i key={i} className={r ? "done" : current ? "current" : ""} style={color ? { background: color } : undefined} />;
          })}
        </div>
        <div className="label">{roundLabel}</div>
      </div>
      <div className="hud-box right">
        <div className="label">Score</div>
        <div className="hud-value score">{points}</div>
      </div>
    </div>
  );
}
