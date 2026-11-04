import { useState } from "react";
import { navigate } from "../nav";
import { sound } from "../game/sound";
import { getSocket } from "./socket";
import { useTicker } from "./useRoom";
import { colorFor } from "./colors";
import { LENGTHS, type RoomView } from "./types";

/** Waiting room: share the code, see who's in, the host sets the race up and starts it. */
export default function RoomLobby({ room, serverNow }: { room: RoomView; serverNow: () => number }) {
  useTicker(500);
  const [copied, setCopied] = useState(false);
  const isHost = room.hostId === room.you;
  const s = getSocket();
  const link = `${location.origin}/race/${room.code}`;
  const startsIn = room.autoStartAt ? Math.max(0, Math.ceil((room.autoStartAt - serverNow()) / 1000)) : null;
  const seated = room.players.filter((p) => !p.left);

  const copy = async () => {
    sound.click();
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the link is shown to select by hand */
    }
  };

  return (
    <main className="race-lobby">
      <section className="panel race-box lobby-head">
        <div>
          <div className="label">{room.isPublic ? "Public room" : "Private room"} · code</div>
          <div className="lobby-code">{room.code}</div>
        </div>
        <div className="lobby-share">
          <input className="race-input" readOnly value={link} aria-label="Invite link" onFocus={(e) => e.target.select()} />
          <button type="button" className="btn-dark" onClick={copy}>{copied ? "Copied!" : "Copy invite link"}</button>
        </div>
      </section>

      <div className="race-cols">
        <section className="panel race-box">
          <h2 className="section-title">Divers <span>{seated.length}/{room.maxPlayers}</span></h2>
          {seated.map((p) => (
            <div key={p.id} className="lobby-player" style={{ ["--c" as string]: colorFor(room.players.indexOf(p)) }}>
              <i className="swatch" />
              <span className="lp-name">{p.name}{p.id === room.you && <small> (you)</small>}</span>
              {p.id === room.hostId && <span className="lp-host">Host</span>}
              {!p.connected && <span className="lp-away">reconnecting…</span>}
              {isHost && p.id !== room.you && (
                <button type="button" className="btn-ghost lp-kick" aria-label={`Remove ${p.name}`} onClick={() => s.emit("kick", p.id)}>✕</button>
              )}
            </div>
          ))}
        </section>

        <section className="panel race-box">
          <h2 className="section-title">The race</h2>
          {isHost ? (
            <>
              <div className="race-field">
                <span className="label">Length</span>
                <div className="seg" role="group" aria-label="Race length">
                  {LENGTHS.map((l) => (
                    <button key={l.id} type="button" aria-pressed={room.length === l.id} onClick={() => { sound.click(); s.emit("settings", { length: l.id }); }}>
                      {l.label}<small>{l.metres.toLocaleString("en-US")} m</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="race-field">
                <label className="label" htmlFor="lobby-max">Players</label>
                <select id="lobby-max" className="race-input" value={room.maxPlayers} onChange={(e) => s.emit("settings", { maxPlayers: Number(e.target.value) })}>
                  {Array.from({ length: 9 }, (_, i) => i + 2).filter((n) => n >= seated.length).map((n) => <option key={n} value={n}>up to {n}</option>)}
                </select>
              </div>
              <label className="race-check"><input type="checkbox" checked={room.isPublic} onChange={(e) => s.emit("settings", { isPublic: e.target.checked })} /> Listed publicly</label>
            </>
          ) : (
            <p className="race-note big">Chest at <b>{room.target.toLocaleString("en-US")} m</b> ({LENGTHS.find((l) => l.id === room.length)?.label})</p>
          )}
          <ul className="race-rules">
            <li>Same questions, same order for everyone. No timer.</li>
            <li>Rarer answers sink you further. Wrong guesses are free.</li>
            <li>Stuck? Skip unlocks after 25 seconds (0 m).</li>
            <li>First to the chest wins; everyone else gets 30 seconds to make it too.</li>
          </ul>
          {room.isPublic && (
            <p className="race-note big">{startsIn !== null ? <>Starting in <b>{startsIn}s</b></> : "Waiting for one more diver…"}</p>
          )}
          {isHost && (
            <button type="button" className="btn-red btn-big" onClick={() => { sound.splash(); s.emit("start"); }}>
              {seated.length < 2 ? "Start solo" : "Start race"}
            </button>
          )}
          {!isHost && !room.isPublic && <p className="race-note big">Waiting for the host to start…</p>}
          <button type="button" className="btn-ghost race-leave" onClick={() => { s.emit("leave"); navigate("/race"); }}>← Leave room</button>
        </section>
      </div>
    </main>
  );
}
