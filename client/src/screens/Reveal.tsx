import { useEffect, useRef } from "react";
import { sound } from "../game/sound";
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
  // The rank chime (or the buzz for no answer) when the result appears, once
  const chimed = useRef(false);
  useEffect(() => {
    if (chimed.current) return;
    chimed.current = true;
    if (result.tier) sound.rank(result.tier);
    else sound.wrong();
  }, [result.tier]);

  const answer = prompt.answers.find((a) => a.id === result.answerId);
  const tier = result.tier ? TIERS[result.tier] : MISS;
  const title = result.tier ? tier.name : result.timedOut ? "Time’s up" : "Gave up";
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
            <div className="muted">{result.tier ? "You said" : "Last guess"}</div>
            <div className="reveal-answer">{answer?.id ?? result.typed}</div>
          </>
        )}
        <div className="reveal-gain">
          {result.points ? `+${result.points} pts · +${(result.points * METRES_PER_POINT).toLocaleString("en-US")} m` : "+0 m"}
        </div>
        {result.tier ? (
          <p className="muted">{rarityLine(answer?.share, result.tier)}</p>
        ) : (
          <p className="muted">{result.timedOut ? "The clock ran out before a valid answer." : "No answer this round."}</p>
        )}
        {!!result.misses && <p className="misses">{result.misses} wrong guess{result.misses > 1 ? "es" : ""} first</p>}
      </section>
      <div className="controls">
        <button ref={button} type="button" className="btn-red btn-big" onClick={onDescend}>
          {last ? "See your dive" : "Descend ↓"}
        </button>
      </div>
    </>
  );
}
