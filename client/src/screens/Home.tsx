import { diveNumber, prettyDate, PROMPTS_PER_DIVE, SECONDS_PER_PROMPT } from "../game/daily";

interface Props {
  date: string;
  started: boolean;
  finished: boolean;
  ready: boolean;
  onBegin: () => void;
  onHowTo: () => void;
  onStats: () => void;
  onRace: () => void;
}

export default function Home({ date, started, finished, ready, onBegin, onHowTo, onStats, onRace }: Props) {
  const label = finished ? "See your dive" : started ? "Continue dive" : "Begin dive";
  return (
    <main className="home">
      <div className="masthead">
        <h1>Krilljoy</h1>
        <div className="subtitle">The daily Valorant dive</div>
        <p className="desc">{PROMPTS_PER_DIVE} prompts. Name the answer nobody else thinks of.</p>
      </div>
      <div className="launch">
        <div className="label accent-cyan">Dive #{diveNumber(date)} · {prettyDate(date)}</div>
        <p className="launch-desc">Pro scene, skins, maps and agents. {SECONDS_PER_PROMPT} seconds each.</p>
        <button type="button" className="btn-red btn-big" onClick={onBegin} disabled={!ready}>
          {ready ? label : "Loading…"}
        </button>
        <div className="launch-tools">
          <button type="button" className="btn-dark" onClick={onHowTo}>How to play</button>
          <button type="button" className="btn-dark" onClick={onStats}>Stats</button>
        </div>
        <button type="button" className="btn-dark race-cta" onClick={onRace}>⚑ Play with friends · Treasure race & Spike splash</button>
      </div>
    </main>
  );
}
