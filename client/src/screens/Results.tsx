import { useEffect, useState } from "react";
import type { Prompt, RoundResult } from "../types";
import { diveNumber, msUntilNextDive } from "../game/daily";
import { shareResult, shareText } from "../game/share";
import { METRES_PER_POINT, MISS, TIERS } from "../game/tiers";
import TierGem from "../components/TierGem";
import AnswerBrowser from "./AnswerBrowser";

interface Props {
  date: string;
  prompts: Prompt[];
  rounds: RoundResult[];
  onToast: (text: string) => void;
}

function useCountdown() {
  const [ms, setMs] = useState(msUntilNextDive());
  useEffect(() => {
    const id = setInterval(() => setMs(msUntilNextDive()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function Results({ date, prompts, rounds, onToast }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const next = useCountdown();
  const points = rounds.reduce((n, r) => n + r.points, 0);
  const radiants = rounds.filter((r) => r.tier === "one_in_a_krillion").length;
  const number = diveNumber(date);

  const share = async () => {
    const how = await shareResult(shareText(number, rounds));
    if (how === "copied") onToast("Result copied. Paste it anywhere!");
    if (how === "failed") onToast("Couldn't share. Try a screenshot instead.");
  };

  return (
    <main className="results">
      <div className="results-head">
        <div className="label accent">Dive #{number} complete</div>
        <div className="big-depth">{(points * METRES_PER_POINT).toLocaleString("en-US")}<span> m</span></div>
        <p className="results-sub">
          {points} points{radiants ? ` · ${radiants} Radiant${radiants > 1 ? "s" : ""}` : ""}
        </p>
        <div className="share-squares" role="img" aria-label="One square per round, colored by rank">
          {rounds.map((r, i) => <i key={i} style={{ background: r.tier ? TIERS[r.tier].color : "#22344b" }} />)}
        </div>
        <div className="results-actions">
          <button type="button" className="btn-red" onClick={share}>Share</button>
        </div>
      </div>

      <div className="log">
        {rounds.map((r, i) => {
          const prompt = prompts.find((p) => p.id === r.promptId);
          if (!prompt) return null;
          const tier = r.tier ? TIERS[r.tier] : MISS;
          const isOpen = open === i;
          return (
            <div key={r.promptId} className={`log-row panel${r.tier === "one_in_a_krillion" ? " glow" : ""}`} style={{ ["--tier" as string]: tier.color }}>
              <button type="button" className="log-summary" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)}>
                <span className="log-num">{i + 1}</span>
                <TierGem tier={r.tier} scale={4} />
                <span className="log-text">
                  <span className="log-q">{prompt.text}</span>
                  <span className="log-a">
                    {r.typed ? <>You said <b>{r.answerId ?? r.typed}</b></> : r.timedOut ? "Time ran out" : "Skipped"}
                  </span>
                </span>
                <span className="log-score">
                  <span className="pts">{r.points ? `+${r.points}` : "0"}</span>
                  <span className="tier-name">{tier.name}{r.tier === "too_clever" ? " · too clever" : ""}</span>
                </span>
                <span className="log-caret" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && <AnswerBrowser prompt={prompt} mine={r.answerId} />}
            </div>
          );
        })}
      </div>
      <p className="next-dive">Next dive in {next}</p>
    </main>
  );
}
