import { useEffect, useRef } from "react";
import { navigate } from "../nav";
import { sound } from "../game/sound";
import { TIERS } from "../game/tiers";
import type { TierKey } from "../types";
import TierGem from "../components/TierGem";
import AgentAvatar from "./AgentAvatar";
import { colorFor } from "./colors";
import { getSocket } from "./socket";
import { useTicker } from "./useRoom";
import { Hearts } from "./Hearts";
import ChatPanel from "./ChatPanel";
import type { RoomView } from "./types";

const ORDER = ["plankton", "too_clever", "schooler", "rare", "deep_cut", "one_in_a_krillion"];
const rarest = <T extends { tier: string; points: number }>(list: T[]) =>
  [...list].sort((a, b) => ORDER.indexOf(b.tier) - ORDER.indexOf(a.tier) || b.points - a.points)[0];

/** After Spike splash: last one standing on top, then everyone by when they went out. */
export default function SpikeResults({ room, serverNow }: { room: RoomView; serverNow: () => number }) {
  useTicker(500);
  const s = room.spike!;
  const rows = s.results ?? [];
  const mine = rows.find((r) => r.id === room.you);
  const isHost = room.hostId === room.you;
  const backIn = room.returnAt ? Math.max(0, Math.ceil((room.returnAt - serverNow()) / 1000)) : null;
  const pinged = useRef(false);
  useEffect(() => {
    if (pinged.current) return;
    pinged.current = true;
    sound.sonar();
    if (mine?.place === 1 && rows.length > 1) setTimeout(() => sound.fanfare(), 900);
  }, [mine?.place, rows.length]);

  const all = rows.flatMap((r) => r.said.map((x) => ({ ...x, name: r.name })));
  const best = rarest(all);

  return (
    <div className="splash splash-results">
    <main className="results race-results spike-results">
      <div className="results-head">
        <div className="label accent">Spike splash · room {room.code}</div>
        <div className="podium">
          {[1, 0, 2].map((i) => rows[i] && (
            <div key={rows[i].id} className={`podium-step p${i + 1}`}>
              <span className="podium-agent" style={{ ["--c" as string]: colorFor(room.players.findIndex((p) => p.id === rows[i].id)) }}>
                <AgentAvatar name={room.players.find((p) => p.id === rows[i].id)?.avatar} size={i === 0 ? 64 : 48} />
              </span>
              <div className="podium-name">{rows[i].name}</div>
              <div className="podium-meta">{i === 0 && !rows[i].out ? <Hearts lives={rows[i].lives} max={s.lives} /> : `${rows[i].said.length} answers`}</div>
              <div className="podium-block">{i + 1}</div>
            </div>
          ))}
        </div>
        {mine && <p className="results-sub">{mine.place === 1 && rows.length > 1 ? <>Last one standing!</> : <>You placed <b>#{mine.place}</b> of {rows.length}</>} · {mine.said.length} answers</p>}
        {best && (
          <p className="results-sub spike-best" style={{ ["--tier" as string]: TIERS[best.tier as TierKey].color }}>
            Rarest answer: <TierGem tier={best.tier as TierKey} scale={3} /> <b>{best.answerId}</b> by {best.name}
          </p>
        )}
      </div>

      <section className="results-section">
        <h2 className="section-title">Standings</h2>
        <div className="standings">
          {rows.map((r) => (
            <div key={r.id} className={`stand-row${r.id === room.you ? " me" : ""}`}>
              <span className="board-place">{r.place}</span>
              <span className="board-name">{r.name}</span>
              <span className="stand-meta">{r.said.length} answers{r.livesGained ? ` · +${r.livesGained} ♥` : ""}{r.detonations ? ` · ${r.detonations} went off` : ""}</span>
              <span className="board-depth">{r.out ? "out" : <Hearts lives={r.lives} max={s.lives} />}</span>
            </div>
          ))}
        </div>
      </section>

      {mine && mine.said.length > 0 && (
        <section className="results-section">
          <h2 className="section-title">Your answers</h2>
          <div className="catch">
            {mine.said.map((h, i) => (
              <div key={i} className="catch-row" style={{ ["--tier" as string]: TIERS[h.tier as TierKey].color }}>
                <div className="catch-summary static">
                  <span className="catch-num">{i + 1}</span>
                  <TierGem tier={h.tier as TierKey} scale={4} />
                  <span className="catch-text">
                    <span className="catch-q">{h.text}</span>
                    <span className="catch-a">{h.answerId}</span>
                  </span>
                  <span className="catch-pts">{TIERS[h.tier as TierKey].name}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="results-actions race-actions">
        {isHost && !room.isPublic && <button type="button" className="btn-red" onClick={() => { sound.click(); getSocket().emit("again"); }}>Play again</button>}
        {room.isPublic && backIn !== null && <p className="race-note big">Back to the lobby in {backIn}s</p>}
        {!isHost && !room.isPublic && <p className="race-note big">Waiting for the host to start another game…</p>}
        <button type="button" className="btn-dark" onClick={() => { getSocket().emit("leave"); navigate("/race"); }}>Leave room</button>
      </div>
    </main>
    <ChatPanel room={room} />
    </div>
  );
}
