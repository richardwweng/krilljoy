import { useEffect, useRef, useState } from "react";
import { sound } from "../game/sound";
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

// Where your total lands (max 700). Named after the ranks.
const BEARING = [
  { from: 0, to: 150, tier: "plankton", text: "Still in the shallows. Plenty of ocean left down there." },
  { from: 151, to: 250, tier: "schooler", text: "Swimming with the pack." },
  { from: 251, to: 350, tier: "rare", text: "Below the thermocline. Nice." },
  { from: 351, to: 449, tier: "deep_cut", text: "Deep cut. Seriously deep dive." },
  { from: 450, to: Infinity, tier: "one_in_a_krillion", text: "Radiant. Trench dweller. Absurd." },
] as const;

function useCountdown() {
  const [ms, setMs] = useState(msUntilNextDive());
  useEffect(() => {
    const id = setInterval(() => setMs(msUntilNextDive()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function shareLine(share: number | undefined) {
  if (share === undefined) return "";
  return share >= 1 ? `est. ${Math.round(share)}% of fans say this` : "est. under 1% of fans say this";
}

/** One line per round dropping to the points it earned, like a depth sounding. */
function DiveLog({ rounds }: { rounds: RoundResult[] }) {
  return (
    <div className="divelog" role="img" aria-label={`Points per round: ${rounds.map((r) => r.points).join(", ")}`}>
      {[0, 25, 50, 75, 100].map((v) => (
        <div key={v} className="divelog-grid" style={{ top: `${v}%` }}><span>{v ? `-${v}` : "0m"}</span></div>
      ))}
      {rounds.map((r, i) => {
        const x = `${((i + 0.5) / rounds.length) * 100}%`;
        const color = r.tier ? TIERS[r.tier].color : MISS.color;
        return (
          <div key={i} className="divelog-round" style={{ left: x }}>
            <span className="divelog-line" style={{ height: `${r.points}%`, background: color }} />
            <span className="divelog-gem" style={{ top: `${r.points}%` }}><TierGem tier={r.tier} scale={4} /></span>
            <span className="divelog-x">{i + 1}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Results({ date, prompts, rounds, onToast }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const next = useCountdown();
  const points = rounds.reduce((n, r) => n + r.points, 0);
  const number = diveNumber(date);
  const band = BEARING.find((b) => points >= b.from && points <= b.to) ?? BEARING[0];

  // Sonar ping as the dive log appears; a fanfare for a big dive (Immortal band and up). Once.
  const pinged = useRef(false);
  useEffect(() => {
    if (pinged.current) return;
    pinged.current = true;
    sound.sonar();
    if (points >= 351) setTimeout(() => sound.fanfare(), 1100);
  }, [points]);

  const share = async () => {
    sound.click();
    const how = await shareResult(shareText(number, rounds));
    if (how === "copied") onToast("Result copied. Paste it anywhere!");
    if (how === "failed") onToast("Couldn't share. Try a screenshot instead.");
  };

  return (
    <main className="results">
      <div className="results-top">
        <div className="score-line">
          <span className="big-score">{points}</span>
          <span className="score-depth">-{(points * METRES_PER_POINT).toLocaleString("en-US")}m</span>
        </div>
        <div className="label">Dive #{number} complete</div>
      </div>

      <section className="results-section">
        <h2 className="section-title">Dive log <span>deeper = rarer</span></h2>
        <DiveLog rounds={rounds} />
      </section>

      <section className="results-section">
        <h2 className="section-title">The bearing</h2>
        <div className="bearing">
          {BEARING.map((b) => (
            <div key={b.tier} className={`bearing-row${b === band ? " here" : ""}`} style={{ ["--tier" as string]: TIERS[b.tier].color }}>
              <TierGem tier={b.tier} scale={4} />
              <span className="bearing-range">{b.to === Infinity ? `${b.from}+` : `${b.from}–${b.to}`}</span>
              <span className="bearing-text">{b.text}</span>
            </div>
          ))}
        </div>
      </section>

      <button type="button" className="btn-red btn-big share-btn" onClick={share}>Share your dive</button>

      <section className="results-section">
        <h2 className="section-title">The catch <span>tap a round for every answer</span></h2>
        <div className="catch">
          {rounds.map((r, i) => {
            const prompt = prompts.find((p) => p.id === r.promptId);
            if (!prompt) return null;
            const answer = prompt.answers.find((a) => a.id === r.answerId);
            const tier = r.tier ? TIERS[r.tier] : MISS;
            const isOpen = open === i;
            return (
              <div key={r.promptId} className={`catch-row${isOpen ? " open" : ""}`} style={{ ["--tier" as string]: tier.color }}>
                <button type="button" className="catch-summary" aria-expanded={isOpen} onClick={() => { sound.click(); setOpen(isOpen ? null : i); }}>
                  <span className="catch-num">{i + 1}</span>
                  <TierGem tier={r.tier} scale={5} />
                  <span className="catch-text">
                    <span className="catch-q">{prompt.text}</span>
                    <span className="catch-a">{r.answerId ?? (r.timedOut ? "Time ran out" : "Gave up")}</span>
                    <span className="catch-meta">
                      {answer ? shareLine(answer.share) : `${prompt.answers.length} valid answers`}
                      {!!r.misses && ` · ${r.misses} wrong guess${r.misses > 1 ? "es" : ""}`}
                    </span>
                  </span>
                  <span className="catch-pts">{r.points}</span>
                  <span className="catch-caret" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
                </button>
                {isOpen && <AnswerBrowser prompt={prompt} mine={r.answerId} />}
              </div>
            );
          })}
        </div>
      </section>
      <p className="next-dive">Next dive in {next}</p>
    </main>
  );
}
