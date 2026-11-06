import { useEffect, useState, type FormEvent } from "react";
import { navigate } from "../nav";
import { sound } from "../game/sound";
import { ask, getSocket, playerToken, saveName, savedName, useConnected } from "./socket";
import { LENGTHS, MODES, modeInfo, type Mode, type PublicRoom, type RaceLength } from "./types";
import RaceHowTo from "./RaceHowTo";
import { setHowToMode } from "./mode";

function savedMode(): Mode {
  try { return localStorage.getItem("krilljoy:mode") === "spike" ? "spike" : "race"; } catch { return "race"; }
}

/** The multiplayer page: pick a mode, your name, Quick play, Host a room, Join by code,
 *  and the public rooms. */
export default function RaceHome() {
  const connected = useConnected();
  const [mode, setMode] = useState<Mode>(savedMode);
  const [name, setName] = useState(savedName());
  const [length, setLength] = useState<RaceLength>("normal");
  const [maxPlayers, setMaxPlayers] = useState(modeInfo(savedMode()).quick);
  const [isPublic, setIsPublic] = useState(false);
  const [code, setCode] = useState("");
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState(false);
  const info = modeInfo(mode);

  useEffect(() => {
    setHowToMode(mode);
    try { localStorage.setItem("krilljoy:mode", mode); } catch { /* fine */ }
  }, [mode]);

  const pickMode = (m: Mode) => {
    sound.click();
    setMode(m);
    setMaxPlayers(modeInfo(m).quick);
  };

  useEffect(() => {
    const s = getSocket();
    const watch = () => ask<{ rooms: PublicRoom[] }>("watchRooms").then((r) => setRooms(r.rooms));
    s.on("rooms", setRooms);
    s.on("connect", watch);
    if (s.connected) watch();
    return () => {
      s.off("rooms", setRooms);
      s.off("connect", watch);
      s.emit("unwatchRooms");
    };
  }, []);

  const go = async (event: string, payload: Record<string, unknown>) => {
    sound.click();
    setBusy(true);
    setError(null);
    saveName(name.trim());
    const r = await ask<{ ok: boolean; code?: string; error?: string }>(event, { token: playerToken, name: name.trim(), ...payload });
    setBusy(false);
    if (r.ok && r.code) navigate(`/race/${r.code}`);
    else setError(r.error ?? "Something went wrong. Try again.");
  };

  const joinCode = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim().length === 4) go("join", { code: code.trim().toUpperCase() });
  };

  return (
    <main className="race-home">
      <div className="race-top">
        <button type="button" className="btn-dark race-back" onClick={() => { sound.click(); navigate("/"); }}><span className="wide-only">◂ Daily dive · play solo</span><span className="narrow-only">◂ Daily dive</span></button>
        <button type="button" className="btn-dark race-rules-btn" onClick={() => { sound.click(); setRules(true); }}><span className="wide-only">? How it works</span><span className="narrow-only">? Rules</span></button>
      </div>
      {rules && <RaceHowTo mode={mode} onClose={() => setRules(false)} />}
      <div className="mode-tabs" role="tablist" aria-label="Game mode">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} className={`mode-tab${mode === m.id ? " on" : ""}`} onClick={() => pickMode(m.id)}>
            <span className="mode-icon" aria-hidden="true">{m.icon}</span>
            <span><b>{m.name}</b><small>{m.blurb}</small></span>
          </button>
        ))}
      </div>
      {!connected && <p className="panel race-warn">Connecting to the race server…</p>}
      {error && <p className="panel race-error" role="alert">{error}</p>}

      <div className="race-cols">
        <div className="race-left">
          <section className="panel race-box">
            <h2 className="section-title">Who’s playing</h2>
            <label className="label" htmlFor="race-name">Your name</label>
            <input id="race-name" className="race-input" value={name} maxLength={16} placeholder="what the lobby calls you"
              onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
          </section>

          <section className="panel race-box">
            <h2 className="section-title">Play now</h2>
            <button type="button" className="btn-red btn-big" disabled={!connected || busy} onClick={() => go("quickplay", { mode })}>Quick play</button>
            <p className="race-note">Joins a public {info.name} lobby (or opens one). Games start 30 s after the lobby fills up ({info.quick} players), or when the host presses Start.{mode === "race" ? " Normal length, 5,000 m." : ""}</p>
          </section>

          <section className="panel race-box">
            <h2 className="section-title">Host</h2>
            {mode === "race" ? (
              <div className="race-field">
                <span className="label">Race length</span>
                <div className="seg" role="group" aria-label="Race length">
                  {LENGTHS.map((l) => (
                    <button key={l.id} type="button" aria-pressed={length === l.id} onClick={() => { sound.click(); setLength(l.id); }}>
                      {l.label}<small>{l.metres.toLocaleString("en-US")} m</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="race-field">
              <label className="label" htmlFor="race-max">Players</label>
              <select id="race-max" className="race-input" value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))}>
                {Array.from({ length: info.max - 1 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>up to {n}</option>)}
              </select>
            </div>
            <label className="race-check"><input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> List it publicly (anyone can join from the list)</label>
            <button type="button" className="btn-dark race-host" disabled={!connected || busy} onClick={() => go("host", { mode, length, maxPlayers: Math.min(maxPlayers, info.max), isPublic })}>Host a room</button>
          </section>

          <form className="panel race-box" onSubmit={joinCode}>
            <h2 className="section-title">Join by code</h2>
            <div className="race-join">
              <input className="race-input code" value={code} maxLength={4} placeholder="ABCD" aria-label="Room code"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} autoCapitalize="characters" />
              <button type="submit" className="btn-red" disabled={!connected || busy || code.length !== 4}>Join</button>
            </div>
          </form>
        </div>

        <section className="panel race-box race-rooms">
          <h2 className="section-title">Public rooms <span>{rooms.length || "none yet"}</span></h2>
          {rooms.length === 0 && <p className="race-note">No public rooms right now. Press Quick play to open one; others will find it here.</p>}
          {rooms.map((r) => {
            const open = r.phase === "lobby" && r.players < r.maxPlayers;
            return (
              <div key={r.code} className="room-row">
                <span className="room-code">{r.code}</span>
                <span className="room-info"><b>{r.host}</b><small>{modeInfo(r.mode ?? "race").name} · {r.players}/{r.maxPlayers} · {r.phase === "lobby" ? "in the lobby" : "playing"}{r.mode === "spike" ? "" : ` · ${LENGTHS.find((l) => l.id === r.length)?.label}`}</small></span>
                {open ? <button type="button" className="btn-ghost room-join" disabled={busy} onClick={() => go("join", { code: r.code })}>Join ▸</button>
                      : <span className="room-full">{r.phase === "lobby" ? "Full" : "Playing"}</span>}
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
