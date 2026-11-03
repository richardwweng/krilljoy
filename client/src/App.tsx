import { useEffect, useState } from "react";
import type { DiveData } from "./types";
import { easternDate } from "./game/daily";
import { MAX_DEPTH } from "./game/tiers";
import { useDive } from "./game/useDive";
import Ocean from "./components/Ocean";
import Hud from "./components/Hud";
import DepthGauge from "./components/DepthGauge";
import Home from "./screens/Home";
import Question from "./screens/Question";
import Reveal from "./screens/Reveal";
import Results from "./screens/Results";
import HowTo from "./screens/HowTo";
import Stats from "./screens/Stats";

type Screen = "home" | "dive";
type Popup = "howto" | "stats" | null;

export default function App() {
  const [data, setData] = useState<DiveData | null>(null);
  const [error, setError] = useState(false);
  const [date, setDate] = useState(easternDate());
  const [screen, setScreen] = useState<Screen>("home");
  const [popup, setPopup] = useState<Popup>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dive = useDive(data, date);

  // Load the answer banks (published by the pipeline)
  useEffect(() => {
    fetch("/data/dive.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  // Roll over to the new dive at midnight Eastern if the tab stays open
  useEffect(() => {
    const id = setInterval(() => setDate(easternDate()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const begin = () => {
    dive.start();
    setScreen("dive");
  };

  const inDive = screen === "dive" && dive.started;
  const playing = inDive && !dive.finished;
  const offset = inDive ? Math.max(dive.depth / MAX_DEPTH, 0.001) : 0;

  let body;
  if (!inDive) {
    body = (
      <Home date={date} started={dive.started} finished={dive.finished} ready={!!data && dive.prompts.length > 0}
        onBegin={begin} onHowTo={() => setPopup("howto")} onStats={() => setPopup("stats")} />
    );
  } else if (dive.finished) {
    body = <Results date={date} prompts={dive.prompts} rounds={dive.rounds} onToast={setToast} />;
  } else {
    const roundNo = dive.awaitingDescend ? dive.rounds.length : dive.rounds.length + 1;
    body = (
      <main className="play">
        <Hud depth={dive.depth} points={dive.points} rounds={dive.rounds} total={dive.prompts.length}
          roundLabel={`Round ${roundNo} of ${dive.prompts.length}`} />
        <div className="stage">
          {dive.awaitingDescend ? (
            <Reveal key={`r${roundNo}`} prompt={dive.prompts[roundNo - 1]} result={dive.rounds[roundNo - 1]}
              last={roundNo === dive.prompts.length} onDescend={dive.descend} />
          ) : (
            <Question key={`q${roundNo}`} prompt={dive.prompts[roundNo - 1]} round={roundNo}
              startedAt={dive.roundStartedAt ?? Date.now()} onSubmit={dive.submit} />
          )}
        </div>
      </main>
    );
  }

  return (
    <>
      <Ocean offset={offset} />
      {playing && <DepthGauge depth={dive.depth} />}
      <div className={`shell${playing ? " with-gauge" : ""}`}>
        <header className="topbar">
          <button type="button" className="brand" onClick={() => setScreen("home")} aria-label="Krilljoy home">
            Krill<span>joy</span>
          </button>
          <nav className="topbar-tools">
            <button type="button" className="btn-small" onClick={() => setPopup("howto")}>How to play</button>
            <button type="button" className="btn-small" onClick={() => setPopup("stats")}>Stats</button>
          </nav>
        </header>
        {error ? (
          <main className="home"><p className="panel error">Couldn’t load today’s dive. Check your connection and refresh.</p></main>
        ) : (
          body
        )}
        {!playing && (
          <footer className="footer">
            Pro data: <a href="https://liquipedia.net/valorant/" target="_blank" rel="noreferrer">Liquipedia</a> (CC BY-SA 3.0) ·
            Game data: valorant-api.com · Not affiliated with Riot Games
          </footer>
        )}
      </div>
      {popup === "howto" && <HowTo onClose={() => setPopup(null)} />}
      {popup === "stats" && <Stats today={date} onClose={() => setPopup(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
