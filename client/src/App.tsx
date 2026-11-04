import { useCallback, useEffect, useState } from "react";
import { navigate, usePath } from "./nav";
import RacePage from "./race/RacePage";
import { getSocket } from "./race/socket";
import type { DiveData } from "./types";
import { easternDate } from "./game/daily";
import { MAX_DEPTH } from "./game/tiers";
import { useDive } from "./game/useDive";
import { isMuted, setMuted, sound } from "./game/sound";
import Sprite from "./components/Sprite";
import { SPEAKER_OFF, SPEAKER_ON } from "./components/sprites";
import Ocean from "./components/Ocean";
import Hud from "./components/Hud";
import DepthGauge from "./components/DepthGauge";
import Home from "./screens/Home";
import Question from "./screens/Question";
import Reveal from "./screens/Reveal";
import Results from "./screens/Results";
import HowTo from "./screens/HowTo";
import RaceHowTo from "./race/RaceHowTo";
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
  const [muted, setMutedState] = useState(isMuted());
  const dive = useDive(data, date);
  const path = usePath();
  const inRace = path.startsWith("/race");
  const [raceOcean, setRaceOcean] = useState({ offset: 0, chest: false });
  // Back to the daily dive. Inside a race room this leaves the room (after asking,
  // so a stray tap mid-race doesn't throw the race away).
  const goDaily = () => {
    const inRoom = path.split("/")[2];
    if (inRoom) {
      if (!window.confirm("Leave this race room and go back to the daily dive?")) return;
      getSocket().emit("leave");
    }
    sound.click();
    setScreen("home");
    navigate("/");
  };
  const onOcean = useCallback((offset: number, chest: boolean) => setRaceOcean({ offset, chest }), []);

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

  const toggleSound = () => {
    setMuted(!muted);
    setMutedState(!muted);
    if (muted) sound.click(); // just turned on: a tap so you hear it worked
  };

  const begin = () => {
    if (!dive.started) sound.splash();
    else sound.click();
    dive.start();
    setScreen("dive");
  };

  const inDive = !inRace && screen === "dive" && dive.started;
  const playing = inDive && !dive.finished;
  const offset = inDive ? Math.max(dive.depth / MAX_DEPTH, 0.001) : 0;

  let body;
  if (inRace) {
    body = <RacePage path={path} onOcean={onOcean} />;
  } else if (!inDive) {
    body = (
      <Home date={date} started={dive.started} finished={dive.finished} ready={!!data && dive.prompts.length > 0}
        onBegin={begin} onHowTo={() => setPopup("howto")} onStats={() => setPopup("stats")}
        onRace={() => { sound.click(); navigate("/race"); }} />
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
              last={roundNo === dive.prompts.length} onDescend={() => { if (roundNo < dive.prompts.length) sound.descend(); dive.descend(); }} />
          ) : (
            <Question key={`q${roundNo}`} prompt={dive.prompts[roundNo - 1]} round={roundNo}
              startedAt={dive.roundStartedAt ?? Date.now()} check={dive.check} options={dive.options} onSubmit={dive.submit} />
          )}
        </div>
      </main>
    );
  }

  return (
    <>
      <Ocean offset={inRace ? raceOcean.offset : offset} chest={inRace && raceOcean.chest} />
      {playing && <DepthGauge depth={dive.depth} />}
      <div className={`shell${playing ? " with-gauge" : ""}`}>
        <header className="topbar">
          <button type="button" className="brand" onClick={goDaily} aria-label="Krilljoy home">
            Krill<span>joy</span>
          </button>
          <nav className="topbar-tools">
            <button type="button" className="btn-small howto-btn" onClick={() => { sound.click(); setPopup("howto"); }} aria-label="How to play"><span className="wide-only">How to play</span><span className="narrow-only">?</span></button>
            <button type="button" className="btn-small" onClick={() => { sound.click(); setPopup("stats"); }}>Stats</button>
            <button type="button" className="btn-small btn-icon" onClick={toggleSound} aria-pressed={!muted}
              aria-label={muted ? "Sound is off. Turn sound on" : "Sound is on. Turn sound off"} title={muted ? "Sound off" : "Sound on"}>
              <Sprite rows={muted ? SPEAKER_OFF : SPEAKER_ON} colors={{ W: "#b9c9df", S: "#5de3f9", M: "#ff4655" }} scale={2} />
            </button>
          </nav>
        </header>
        {error ? (
          <main className="home"><p className="panel error">Couldn’t load today’s dive. Check your connection and refresh.</p></main>
        ) : (
          body
        )}
        {!playing && (
          <footer className="footer">
            <span className="footer-credit">Made by <b>Raspberri</b></span>
            Pro data: <a href="https://liquipedia.net/valorant/" target="_blank" rel="noreferrer">Liquipedia</a> (CC BY-SA 3.0) ·
            Game data: valorant-api.com
            <small>Krilljoy was created under Riot Games’ “Legal Jibber Jabber” policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.</small>
            <small className="footer-thanks">Thanks to BionicLettuce</small>
          </footer>
        )}
      </div>
      {popup === "howto" && (inRace ? <RaceHowTo onClose={() => setPopup(null)} /> : <HowTo onClose={() => setPopup(null)} />)}
      {popup === "stats" && <Stats today={date} onClose={() => setPopup(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
