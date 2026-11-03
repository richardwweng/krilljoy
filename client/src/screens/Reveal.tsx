import { useEffect, useRef } from "react";
import type { Prompt, RoundResult } from "../types";
import { MISS, METRES_PER_POINT, TIERS } from "../game/tiers";
import TierGem from "../components/TierGem";
import Sprite from "../components/Sprite";
import { SPARK } from "../components/sprites";

interface Props {
  prompt: Prompt;
  result: RoundResult;
  last: boolean;
  onDescend: () => void;
}

function rarityLine(share: number | undefined, tier: string) {
  if (tier === "too_clever") return "Too clever: the “rare” pick everybody tries.";
  if (share === undefined) return "";
  if (share >= 1) return `About ${Math.round(share)} in 100 fans would say this.`;
  return "Fewer than 1 in 100 fans would say this.";
}

export default function Reveal({ prompt, result, last, onDescend }: Props) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);

  const answer = prompt.answers.find((a) => a.id === result.answerId);
  const tier = result.tier ? TIERS[result.tier] : MISS;
  const n = prompt.answers.length;
  // A few other valid answers, from obvious to rare
  const sample = [0, 1, Math.floor(n / 2), n - 2, n - 1]
    .filter((i, k, all) => i >= 0 && i < n && all.indexOf(i) === k)
    .map((i) => prompt.answers[i])
    .filter((a) => a.id !== result.answerId)
    .slice(0, 5);

  const title = result.tier ? tier.name : result.timedOut && !result.typed ? "Time's up" : !result.typed ? "Skipped" : "Not valid";
  return (
    <>
      <section className="card reveal-card panel" aria-live="polite" style={{ ["--tier" as string]: tier.color }}>
        <div className="reveal-gem">
          {result.tier && <Sprite rows={SPARK} colors={{ Y: tier.color }} scale={4} />}
          <TierGem tier={result.tier} scale={12} />
          {result.tier && <Sprite rows={SPARK} colors={{ Y: tier.color }} scale={4} />}
        </div>
        <div className="reveal-tier">{title}</div>
        {result.typed && (
          <>
            <div className="muted">You said</div>
            <div className="reveal-answer">{answer?.id ?? result.typed}</div>
          </>
        )}
        <div className="reveal-gain">
          {result.points ? `+${result.points} pts · +${(result.points * METRES_PER_POINT).toLocaleString("en-US")} m` : "+0 m"}
        </div>
        {result.tier ? (
          <p className="muted">{rarityLine(answer?.share, result.tier)}</p>
        ) : (
          result.typed && <p className="muted">That isn’t one of the valid answers for this prompt.</p>
        )}
        <div className="others">
          <div className="label">Other valid answers</div>
          <div className="chips">
            {sample.map((a) => (
              <span key={a.id} className="chip" style={{ color: TIERS[a.tier].color, borderColor: TIERS[a.tier].color + "66" }}>{a.id}</span>
            ))}
            {n - sample.length - (answer ? 1 : 0) > 0 && <span className="chip more">+{n - sample.length - (answer ? 1 : 0)} more</span>}
          </div>
        </div>
      </section>
      <div className="controls">
        <button ref={button} type="button" className="btn-red btn-big" onClick={onDescend}>
          {last ? "See your dive" : "Descend ↓"}
        </button>
      </div>
    </>
  );
}
