import { MAX_DEPTH } from "../game/tiers";
import Sprite from "./Sprite";
import { SUB } from "./sprites";

const SUB_COLORS = { R: "#ff4655", W: "#e9dfc8", B: "#5de3f9", D: "#8a7f6a" };

/** Tall gauge down the right edge with your sub on it. Ends at a perfect dive (7,000 m). */
export default function DepthGauge({ depth }: { depth: number }) {
  const pct = Math.min(depth / MAX_DEPTH, 1) * 100;
  return (
    <div className="gauge" role="img" aria-label={`Depth ${depth.toLocaleString("en-US")} of ${MAX_DEPTH.toLocaleString("en-US")} metres`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className="gauge-label" style={{ top: `${i * 25}%` }}>{((MAX_DEPTH / 4) * i).toLocaleString("en-US")}</span>
      ))}
      {Array.from({ length: 9 }, (_, i) => <span key={i} className={`tick${i % 2 ? "" : " long"}`} style={{ top: `${(i + 1) * 10}%` }} />)}
      <span className="gauge-fill" style={{ height: `${pct}%` }} />
      <span className="gauge-sub" style={{ top: `${pct}%` }}><Sprite rows={SUB} colors={SUB_COLORS} scale={3} /></span>
      <span className="gauge-floor" />
      <span className="gauge-max">{MAX_DEPTH.toLocaleString("en-US")} max</span>
    </div>
  );
}
