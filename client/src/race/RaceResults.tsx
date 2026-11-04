import { useEffect, useRef } from "react";
import { navigate } from "../nav";
import { sound } from "../game/sound";
import { TIERS } from "../game/tiers";
import type { TierKey } from "../types";
import TierGem from "../components/TierGem";
import Sprite from "../components/Sprite";
import { OPEN_CHEST, CHEST_COLORS } from "../components/sprites";
import { getSocket } from "./socket";
import { useTicker } from "./useRoom";
import type { RoomView } from "./types";

const time = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

/** After the race: podium, full standings, and every answer you gave. */
export default function RaceResults({ room, serverNow }: { room: RoomView; serverNow: () => number }) {
  useTicker(500);
  const rows = room.results ?? [];
  const mine = rows.find((r) => r.id === room.you);
  const isHost = room.hostId === room.you;
  const backIn = room.returnAt ? Math.max(0, Math.ceil((room.returnAt - serverNow()) / 1000)) : null;
  const pinged = useRef(false);
  useEffect(() => {
    if (pinged.current) return;
    pinged.current = true;
    sound.sonar();
    if (mine?.place === 1) setTimeout(() => sound.fanfare(), 900);
  }, [mine?.place]);

  return (
    <main className="results race-results">
      <div className="results-head">
        <div className="label accent">Race over · room {room.code}</div>
        {room.endReason === "idle" && <p className="race-idle-note">Nobody answered for 15 minutes, so the race ended here.</p>}
        <div className="podium">
          {[1, 0, 2].map((i) => rows[i] && (
            <div key={rows[i].id} className={`podium-step p${i + 1}`}>
              {i === 0 && <Sprite rows={OPEN_CHEST} colors={CHEST_COLORS} scale={5} label="Treasure chest" />}
              <div className="podium-name">{rows[i].name}</div>
              <div className="podium-meta">{rows[i].finished && rows[i].timeMs !== null ? `chest in ${time(rows[i].timeMs!)}` : `${rows[i].depth.toLocaleString("en-US")} m`}</div>
              <div className="podium-block">{i + 1}</div>
            </div>
          ))}
        </div>
        {mine && <p className="results-sub">You placed <b>#{mine.place}</b> of {rows.length} · {mine.depth.toLocaleString("en-US")} m</p>}
      </div>

      <section className="results-section">
        <h2 className="section-title">Standings</h2>
        <div className="standings">
          {rows.map((r) => (
            <div key={r.id} className={`stand-row${r.id === room.you ? " me" : ""}`}>
              <span className="board-place">{r.place}</span>
              <span className="board-name">{r.name}</span>
              <span className="stand-meta">{r.history.filter((h) => h.answerId).length} answers{r.skips ? ` · ${r.skips} skipped` : ""}</span>
              <span className="board-depth">{r.finished ? `🏁 ${time(r.timeMs ?? 0)}` : `${r.depth.toLocaleString("en-US")} m`}</span>
            </div>
          ))}
        </div>
      </section>

      {mine && (
        <section className="results-section">
          <h2 className="section-title">Your answers</h2>
          <div className="catch">
            {mine.history.map((h, i) => {
              const tier = h.tier as TierKey | null;
              return (
                <div key={i} className="catch-row" style={{ ["--tier" as string]: tier ? TIERS[tier].color : "#6f86a3" }}>
                  <div className="catch-summary static">
                    <span className="catch-num">{i + 1}</span>
                    <TierGem tier={tier} scale={4} />
                    <span className="catch-text">
                      <span className="catch-q">{h.text}</span>
                      <span className="catch-a">{h.answerId ?? "Skipped"}</span>
                    </span>
                    <span className="catch-pts">{h.points ? `+${(h.points * 10).toLocaleString("en-US")} m` : "0"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="results-actions race-actions">
        {isHost && !room.isPublic && <button type="button" className="btn-red" onClick={() => { sound.click(); getSocket().emit("again"); }}>Race again</button>}
        {room.isPublic && backIn !== null && <p className="race-note big">Back to the lobby in {backIn}s</p>}
        {!isHost && !room.isPublic && <p className="race-note big">Waiting for the host to start another race…</p>}
        <button type="button" className="btn-dark" onClick={() => { getSocket().emit("leave"); navigate("/race"); }}>Leave room</button>
      </div>
    </main>
  );
}
