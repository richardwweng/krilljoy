import Sprite from "../components/Sprite";
import { CHEST, CHEST_COLORS, SUB } from "../components/sprites";
import type { RacePlayer } from "./types";
import { colorFor } from "./colors";

/** The shared depth gauge: every diver's marker sinking toward the chest at the bottom. */
export default function RaceGauge({ players, target, you }: { players: RacePlayer[]; target: number; you: string }) {
  return (
    <div className="gauge race-gauge" role="img" aria-label={`Race depths: ${players.map((p) => `${p.name} ${p.depth} m`).join(", ")}, chest at ${target} m`}>
      {Array.from({ length: 9 }, (_, i) => <span key={i} className={`tick${i % 2 ? "" : " long"}`} style={{ top: `${(i + 1) * 10}%` }} />)}
      {players.map((p, i) => {
        const pct = Math.min(p.depth / target, 1) * 100;
        const me = p.id === you;
        // Names of divers within ~4% of each other get stacked downward instead of overlapping
        const crowd = players.slice(0, i).filter((o) => Math.abs(Math.min(o.depth / target, 1) * 100 - pct) < 4).length;
        return (
          <span key={p.id} className={`diver${me ? " me" : ""}${p.left ? " gone" : ""}`} style={{ top: `${pct}%`, ["--c" as string]: colorFor(i), ["--stack" as string]: `${crowd * 15}px` }}>
            {me ? <Sprite rows={SUB} colors={{ R: colorFor(i), W: "#e9dfc8", B: "#5de3f9", D: "#8a7f6a" }} scale={3} /> : <i />}
            <b>{me ? "You" : p.name}</b>
          </span>
        );
      })}
      <span className="gauge-chest"><Sprite rows={CHEST} colors={CHEST_COLORS} scale={4} label="Treasure chest" /></span>
      <span className="gauge-max">{target.toLocaleString("en-US")} m</span>
    </div>
  );
}
