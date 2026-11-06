import { useEffect, useRef, useState, type FormEvent } from "react";
import { sound } from "../game/sound";
import type { TierKey } from "../types";
import Sprite from "../components/Sprite";
import { BOOM, BOOM_COLORS } from "../components/sprites";
import { ask } from "./socket";
import { useTicker } from "./useRoom";
import { colorFor } from "./colors";
import SplashScene, { type Slot } from "./SplashScene";
import ChatPanel from "./ChatPanel";
import EmojiButton from "./EmojiButton";
import { Hearts } from "./Hearts";
import LifeMeter from "./LifeMeter";
import type { RoomView, SpikeReply } from "./types";

const POOL_LABELS: Record<string, string> = {
  players: "Pro scene", teams: "Pro scene", skins: "Skins", callouts: "Maps", maps: "Maps",
  agents: "Agents", abilities: "Agents", weapons: "Weapons", list: "Valorant",
};
const BREAK_MS = 3000; // matches the server's pause after a detonation / new question

/** Spike splash: everyone on a rock around the spike, taking turns answering. */
export default function SpikeRun({ room, serverNow }: { room: RoomView; serverNow: () => number }) {
  useTicker(100);
  const now = serverNow();
  const s = room.spike!;
  const name = (id: string) => room.players.find((p) => p.id === id)?.name ?? "?";
  const color = (id: string) => colorFor(room.players.findIndex((p) => p.id === id));
  const meSeat = s.seats.find((x) => x.id === room.you);
  const q = s.question;

  const onBreak = now < s.turnStartsAt;
  const turnMs = s.turnEndsAt - s.turnStartsAt;
  const leftMs = onBreak ? turnMs : Math.max(0, s.turnEndsAt - now);
  const frac = turnMs ? leftMs / turnMs : 0;
  const myTurn = s.turn === room.you && !onBreak && room.phase === "racing" && !!meSeat && !meSeat.out;
  const secs = Math.ceil(leftMs / 1000);

  const [typed, setTyped] = useState("");
  const [note, setNote] = useState<{ kind: "error" | "suggest"; text: string; from?: string } | null>(null);
  const [shake, setShake] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Your turn: clear the box and focus it
  useEffect(() => {
    if (myTurn) { setTyped(""); setNote(null); input.current?.focus(); }
  }, [myTurn, s.turnStartsAt]);

  // The spike beeps faster as the turn runs out (louder when it's yours)
  const lastBeep = useRef(0);
  if (room.phase === "racing" && !onBreak && leftMs > 0) {
    const gap = frac > 0.5 ? 1000 : frac > 0.25 ? 500 : 250;
    if (now - lastBeep.current >= gap) {
      lastBeep.current = now;
      queueMicrotask(() => sound.beep(myTurn || frac <= 0.25));
    }
  }

  // Splashes and new questions
  const lastEvent = useRef(s.event.at);
  useEffect(() => {
    if (s.event.at === lastEvent.current) return;
    lastEvent.current = s.event.at;
    if (s.event.kind === "detonate") sound.boom();
    else if (s.event.kind === "next") sound.tick(true);
  }, [s.event]);

  // Someone filled their meter: +1 life
  const lastLife = useRef(s.lastLife?.at ?? 0);
  useEffect(() => {
    if (!s.lastLife || s.lastLife.at === lastLife.current) return;
    lastLife.current = s.lastLife.at;
    setTimeout(() => sound.life(), s.lastLife.on === room.you ? 350 : 0);
  }, [s.lastLife, room.you]);

  // Someone else answered: a little "pass" sound
  const saidCount = useRef(s.said.length);
  useEffect(() => {
    const last = s.said[s.said.length - 1];
    if (s.said.length > saidCount.current && last && last.by !== room.you) sound.pass();
    saidCount.current = s.said.length;
  }, [s.said, room.you]);

  // 3, 2, 1 before the start
  const countdown = room.phase === "countdown" && room.countdownEndsAt ? Math.max(0, Math.ceil((room.countdownEndsAt - now) / 1000)) : null;
  const lastCount = useRef(-1);
  useEffect(() => {
    if (countdown !== null && countdown !== lastCount.current && countdown > 0) sound.tick(countdown === 1);
    lastCount.current = countdown ?? -1;
  }, [countdown]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!typed.trim() || sending || !myTurn) return;
    setSending(true);
    const r = await ask<SpikeReply>("answer", typed);
    setSending(false);
    if (r.kind === "ok") {
      sound.rank(r.tier as TierKey);
      setTyped("");
      setNote(null);
    } else if (r.kind === "suggest") {
      sound.suggest();
      setNote({ kind: "suggest", text: r.name, from: typed.trim() });
      setTyped(r.name);
    } else if (r.kind === "which") {
      sound.suggest();
      setNote({ kind: "error", text: `Which one? e.g. ${r.options.join(", ")}` });
    } else if (r.kind === "used") {
      sound.wrong();
      setShake(true);
      setNote({ kind: "error", text: `${r.answerId} was already said by ${r.byName}` });
      input.current?.select();
    } else if (r.kind === "invalid") {
      sound.wrong();
      setShake(true);
      setNote({ kind: "error", text: `“${typed.trim()}” isn’t valid. Try again!` });
      input.current?.select();
    }
  };

  const ev = s.event;
  const showEvent = (ev.kind === "detonate" || ev.kind === "next") && now - ev.at < BREAK_MS;
  const alive = s.seats.filter((x) => !x.out).length;
  const turnIndex = s.seats.findIndex((x) => x.id === s.turn);
  const slots: Slot[] = s.seats.map((seat) => {
    const p = room.players.find((x) => x.id === seat.id);
    return {
      id: seat.id, name: name(seat.id), color: color(seat.id), you: seat.id === room.you, away: p ? !p.connected && !p.left : false,
      lives: seat.lives, startLives: s.lives, meter: seat.meterParts, lifeEvery: s.lifeEvery, out: seat.out,
      plusOne: s.lastLife?.on === seat.id && now - s.lastLife.at < 2500,
      said: seat.last, // their latest answer, until they answer again
      emote: p?.emote?.emoji ?? null, avatar: p?.avatar,
    };
  });

  return (
    <main className="splash">
      {countdown !== null && (
        <div className="race-countdown" role="status"><span>{countdown > 0 ? countdown : "Go!"}</span><small>Spike splash · {alive} players · {s.lives} lives each</small></div>
      )}
      <div className="splash-main">
        <div className="splash-top">
          <div className="top-box"><small>{room.isPublic ? "Public" : "Private"}</small><b>{room.code}</b></div>
          <div className="top-mid">
            <div className="label">Question {s.qNumber}</div>
          </div>
          <div className="top-box right"><small>Still in</small><b>{alive}/{s.seats.length}</b></div>
        </div>

        <SplashScene slots={slots} turn={room.phase === "racing" ? turnIndex : undefined}
          spike={{ frac, label: onBreak ? "ready…" : `${secs}s`, hot: frac <= 0.25 && !onBreak, boom: s.event.kind === "detonate" && now - s.event.at < 900 }}>
          {q && (
            <div className="panel splash-q">
              <div className="label accent">{POOL_LABELS[q.pool] ?? "Valorant"} · question {s.qNumber}</div>
              <h1 className="splash-prompt">{q.text}</h1>
              <p className="splash-hint">▼ any valid answer passes the spike · no repeats ▼</p>
            </div>
          )}
          {showEvent && (
            <div className="spike-event" role="status">
              {ev.kind === "detonate" ? (
                <>
                  <Sprite rows={BOOM} colors={BOOM_COLORS} scale={7} />
                  <b>Splash! {ev.on === room.you ? "It went off on you" : `It went off on ${name(ev.on)}`}</b>
                  <span>{ev.out ? `${ev.on === room.you ? "You’re" : name(ev.on) + " is"} out.` : "−1 life"} · New question</span>
                </>
              ) : (
                <><b>Answers used up!</b><span>New question</span></>
              )}
            </div>
          )}
        </SplashScene>

        <form className="splash-bottom answer-bar" onSubmit={submit}>
          <div className="input-note" role="alert">
            {note?.kind === "suggest" ? (
              <div className="suggest panel">
                <div>“{note.from}” <span className="arrow">→</span> <b>“{note.text}”</b></div>
                <small>submit again to confirm · or edit</small>
              </div>
            ) : note ? <p className="inline-error">{note.text}</p>
              : <p className="bar-status">{myTurn ? <><span className="accent">▸ your spike</span> · type an answer</> : meSeat?.out ? "You’re out: cheer on the rest" : onBreak ? "Get ready…" : <>▸ <b style={{ color: color(s.turn) }}>{name(s.turn)}</b> has the spike</>}</p>}
          </div>
          <div className="bar-row">
            <div className="lives-badge" title={meSeat ? `${meSeat.meter}/${s.lifeEvery} toward +1 life` : ""}>
              {meSeat && !meSeat.out ? <Hearts lives={meSeat.lives} max={s.lives} scale={2} /> : <small>out</small>}
              {meSeat && !meSeat.out && <LifeMeter parts={meSeat.meterParts} lifeEvery={s.lifeEvery} />}
            </div>
            <input
              ref={input}
              className={`answer-input${shake ? " shake" : ""}${myTurn ? " my-turn" : ""}`}
              onAnimationEnd={() => setShake(false)}
              value={typed}
              onChange={(e) => { setTyped(e.target.value); setNote(null); }}
              placeholder={myTurn ? "your spike! type…" : meSeat?.out ? "you’re out" : "wait your turn"}
              disabled={!myTurn}
              aria-label="Your answer"
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="go" maxLength={60}
            />
            <button type="submit" className="btn-red lock-btn" disabled={!myTurn || !typed.trim() || sending}>Lock in</button>
            <EmojiButton emotes={room.emotes} />
            <button type="button" className="btn-dark chat-open-btn" aria-label="Chat" onClick={() => setChatOpen(!chatOpen)}>💬</button>
          </div>
          <div className="turn-bar" aria-hidden="true"><i style={{ width: `${(myTurn ? frac : 0) * 100}%` }} /></div>
        </form>
      </div>
      <ChatPanel room={room} className={chatOpen ? "open" : ""} />
    </main>
  );
}
