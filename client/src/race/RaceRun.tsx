import { useEffect, useRef, useState, type FormEvent } from "react";
import { sound } from "../game/sound";
import { TIERS } from "../game/tiers";
import type { TierKey } from "../types";
import TierGem from "../components/TierGem";
import Sprite from "../components/Sprite";
import { OPEN_CHEST, CHEST_COLORS } from "../components/sprites";
import { ask } from "./socket";
import { useTicker } from "./useRoom";
import { colorFor } from "./colors";
import RaceGauge from "./RaceGauge";
import type { AnswerReply, RoomView } from "./types";

const POOL_LABELS: Record<string, string> = {
  players: "Pro scene", teams: "Pro scene", skins: "Skins", callouts: "Maps", maps: "Maps",
  agents: "Agents", abilities: "Agents", weapons: "Weapons", list: "Valorant",
};

function PromptText({ text }: { text: string }) {
  const m = text.match(/^(.*\s)(\S+?)([?.!]?)$/);
  if (!m) return <>{text}</>;
  return <>{m[1]}<span className="accent">{m[2]}</span>{m[3]}</>;
}

/** The race: questions back to back, the shared gauge, and the live leaderboard. */
export default function RaceRun({ room, serverNow }: { room: RoomView; serverNow: () => number }) {
  useTicker(250);
  const now = serverNow();
  const me = room.players.find((p) => p.id === room.you)!;
  const q = room.question;
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState<{ kind: "error" | "suggest" | "gain"; text: string; tier?: TierKey; from?: string } | null>(null);
  const [shake, setShake] = useState(false);
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const lastCount = useRef(-1);

  // New question: clear the box and focus it
  useEffect(() => {
    setTyped("");
    input.current?.focus();
  }, [q?.n]);

  // Countdown ticks before the start
  const countdown = room.phase === "countdown" && room.countdownEndsAt ? Math.max(0, Math.ceil((room.countdownEndsAt - now) / 1000)) : null;
  useEffect(() => {
    if (countdown !== null && countdown !== lastCount.current && countdown > 0) sound.tick(countdown === 1);
    lastCount.current = countdown ?? -1;
  }, [countdown]);

  // Someone opened the chest: the last call starts
  const lastCall = room.lastCallEndsAt ? Math.max(0, Math.ceil((room.lastCallEndsAt - now) / 1000)) : null;
  const pinged = useRef(false);
  useEffect(() => {
    if (lastCall !== null && !pinged.current) { pinged.current = true; if (!me.finished) sound.sonar(); }
  }, [lastCall, me.finished]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!typed.trim() || sending || !q) return;
    setSending(true);
    const r = await ask<AnswerReply>("answer", typed);
    setSending(false);
    if (r.kind === "ok") {
      const tier = r.tier as TierKey;
      sound.rank(tier);
      if (r.finished) setTimeout(() => sound.fanfare(), 500);
      setNote({ kind: "gain", text: `${TIERS[tier].name} · +${(r.points * 10).toLocaleString("en-US")} m`, tier, from: r.answerId });
    } else if (r.kind === "suggest") {
      sound.suggest();
      setNote({ kind: "suggest", text: r.name, from: typed.trim() });
      setTyped(r.name);
    } else if (r.kind === "which") {
      sound.suggest();
      setNote({ kind: "error", text: `Which one? e.g. ${r.options.join(", ")}` });
    } else if (r.kind === "invalid") {
      sound.wrong();
      setShake(true);
      setNote({ kind: "error", text: `“${typed.trim()}” isn’t valid. Try again!` });
      input.current?.select();
    }
  };

  const skipIn = q ? Math.max(0, Math.ceil((q.skipAt - now) / 1000)) : 0;
  const doSkip = async () => {
    if (skipIn > 0) return;
    const r = await ask<{ ok: boolean }>("skip");
    if (r.ok) { sound.wrong(); setNote({ kind: "error", text: "Skipped · +0 m" }); }
  };

  const ranked = [...room.players].sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
  const myPlace = me.place ?? ranked.indexOf(me) + 1;

  return (
    <main className="play race-run">
      {countdown !== null && (
        <div className="race-countdown" role="status"><span>{countdown > 0 ? countdown : "Dive!"}</span><small>Same questions for everyone · chest at {room.target.toLocaleString("en-US")} m</small></div>
      )}

      <div className="hud race-hud">
        <div className="hud-box">
          <div className="label">Depth</div>
          <div className="hud-value depth">{me.depth.toLocaleString("en-US")}<small> m</small></div>
        </div>
        <div className="hud-rounds">
          <div className="race-progress" aria-hidden="true"><i style={{ width: `${Math.min(me.depth / room.target, 1) * 100}%` }} /></div>
          <div className="label">{q ? `Question ${q.n}` : me.finished ? "At the chest" : "Waiting"} · chest {room.target.toLocaleString("en-US")} m</div>
        </div>
        <div className="hud-box right">
          <div className="label">Place</div>
          <div className="hud-value score">{myPlace}<small> / {room.players.length}</small></div>
        </div>
      </div>

      {lastCall !== null && (
        <div className="last-call panel" role="status">
          <b>{room.firstFinisher}</b> opened the chest! {me.finished ? "Waiting for the others:" : "Last call:"} <span className="lc-time">{Math.floor(lastCall / 60)}:{String(lastCall % 60).padStart(2, "0")}</span>
        </div>
      )}

      <div className="stage">
        {me.finished ? (
          <section className="card panel race-done">
            <Sprite rows={OPEN_CHEST} colors={CHEST_COLORS} scale={9} label="Open treasure chest" />
            <div className="reveal-tier" style={{ ["--tier" as string]: "#f2c14e" }}>{myPlace === 1 ? "First to the chest!" : `You made it! #${myPlace}`}</div>
            <p className="muted">{me.depth.toLocaleString("en-US")} m · {me.answered} answers{me.skips ? ` · ${me.skips} skipped` : ""}. Results when the race ends.</p>
          </section>
        ) : q ? (
          <>
            <section className="card question-card panel">
              <div className="label accent">{POOL_LABELS[q.pool] ?? "Valorant"} · Question {q.n}</div>
              <h1 className="prompt"><PromptText text={q.text} /></h1>
              <p className="hint">▼ rarer answers sink deeper ▼</p>
            </section>
            <form className="controls" onSubmit={submit}>
              <div className="input-note" role="alert">
                {note?.kind === "suggest" ? (
                  <div className="suggest panel">
                    <div>“{note.from}” <span className="arrow">→</span> <b>“{note.text}”</b></div>
                    <small>submit again to confirm · or edit</small>
                  </div>
                ) : note?.kind === "gain" && note.tier ? (
                  <div className="gain-flash" key={note.from} style={{ ["--tier" as string]: TIERS[note.tier].color }}>
                    <TierGem tier={note.tier} scale={4} /><span><b>{note.from}</b> {note.text}</span>
                  </div>
                ) : (
                  <p className="inline-error">{note?.text ?? ""}</p>
                )}
              </div>
              <div className="input-row race-input-row">
                <input
                  ref={input}
                  className={`answer-input${shake ? " shake" : ""}`}
                  onAnimationEnd={() => setShake(false)}
                  value={typed}
                  onChange={(e) => { setTyped(e.target.value); if (note?.kind !== "gain") setNote(null); }}
                  placeholder="type one answer…"
                  aria-label="Your answer"
                  autoFocus autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="go" maxLength={60}
                />
                <button type="submit" className="btn-red" disabled={!typed.trim() || sending}>Lock in</button>
              </div>
              <div className="below-input">
                <span><span className="desktop-only">No timer · </span>Wrong guesses are free</span>
                <button type="button" className="btn-ghost" disabled={skipIn > 0} onClick={doSkip}>
                  {skipIn > 0 ? `Skip in ${skipIn}s` : "Skip (+0 m) →"}
                </button>
              </div>
            </form>
          </>
        ) : room.phase === "racing" ? (
          <section className="card panel"><p className="muted">You’ve answered every question we have! Waiting for the race to end.</p></section>
        ) : null}

        <section className="panel race-board" aria-label="Live standings">
          {ranked.map((p) => (
            <div key={p.id} className={`board-row${p.id === room.you ? " me" : ""}${p.left ? " gone" : ""}`} style={{ ["--c" as string]: colorFor(room.players.indexOf(p)) }}>
              <span className="board-place">{p.place}</span>
              <i className="swatch" />
              <span className="board-name">{p.name}{p.id === room.you ? " (you)" : ""}{!p.connected && !p.left ? " · away" : ""}{p.left ? " · left" : ""}</span>
              <span className="board-bar"><i style={{ width: `${Math.min(p.depth / room.target, 1) * 100}%` }} /></span>
              <span className="board-depth">{p.finished ? "🏁 " : ""}{p.depth.toLocaleString("en-US")} m</span>
            </div>
          ))}
        </section>
      </div>
      <RaceGauge players={room.players} target={room.target} you={room.you} />
    </main>
  );
}
