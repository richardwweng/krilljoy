import { useEffect, useRef, useState } from "react";
import { navigate } from "../nav";
import { sound } from "../game/sound";
import Modal from "../components/Modal";
import { getSocket } from "./socket";
import { useTicker } from "./useRoom";
import { colorFor } from "./colors";
import SplashScene, { type Slot } from "./SplashScene";
import ChatPanel from "./ChatPanel";
import EmojiButton from "./EmojiButton";
import RaceHowTo from "./RaceHowTo";
import AgentPicker, { AGENT_KEY } from "./AgentPicker";
import AgentAvatar from "./AgentAvatar";
import { ask } from "./socket";
import { MODES, PACES, type RoomView } from "./types";

/** Spike splash waiting room: everyone on their rock, empty rocks for open seats. */
export default function SpikeLobby({ room, serverNow }: { room: RoomView; serverNow: () => number }) {
  useTicker(250);
  const now = serverNow();
  const s = getSocket();
  const isHost = room.hostId === room.you;
  const seated = room.players.filter((p) => !p.left);
  const [settings, setSettings] = useState(false);
  const [rules, setRules] = useState(false);
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const meP = room.players.find((p) => p.id === room.you);

  // Sit as the agent you picked last time, if nobody here has them
  const triedSaved = useRef(false);
  useEffect(() => {
    if (triedSaved.current || !meP) return;
    triedSaved.current = true;
    let saved: string | null = null;
    try { saved = localStorage.getItem(AGENT_KEY); } catch { /* fine */ }
    if (saved && saved !== meP.avatar) void ask("avatar", saved);
  }, [meP]);
  const startsIn = room.autoStartAt ? Math.max(0, Math.ceil((room.autoStartAt - now) / 1000)) : null;
  const link = `${location.origin}/race/${room.code}`;

  const slots: Slot[] = Array.from({ length: room.maxPlayers }, (_, i) => {
    const p = seated[i];
    if (!p) return { id: null, name: "", color: "#3a4b63" };
    return {
      id: p.id, name: p.name, color: colorFor(room.players.indexOf(p)), you: p.id === room.you, host: p.id === room.hostId,
      away: !p.connected, lives: 2, startLives: 2, emote: p.emote?.emoji ?? null, avatar: p.avatar,
    };
  });

  const invite = async () => {
    sound.click();
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* shown in settings */ }
  };

  return (
    <main className="splash">
      <div className="splash-main">
        <div className="splash-top">
          <div className="top-box"><small>{room.isPublic ? "Public" : "Private"}</small><b>{room.code}</b></div>
          <div className="top-mid label">Lobby</div>
          <div className="top-box right"><small>In</small><b>{seated.length}/{room.maxPlayers}</b></div>
        </div>

        <SplashScene slots={slots} spike={{ frac: 1, label: "z z", hot: false, asleep: true }} onPickMine={() => { sound.click(); setPicking(true); }}>
          <div className="splash-title">
            <h1>Spike <span>splash</span></h1>
            <p>pass the spike · don’t let it splash on you</p>
          </div>
        </SplashScene>

        <div className="splash-bottom">
          {isHost ? (
            <button type="button" className="btn-red btn-big arm-btn" onClick={() => { sound.splash(); s.emit("start"); }}>
              ▼ {seated.length < 2 ? "Practise solo" : "Arm the spike"} ▼
            </button>
          ) : (
            <div className="arm-wait panel">{room.isPublic && startsIn !== null ? `Lobby full! Starting in ${startsIn}s` : "Waiting for the host to start…"}</div>
          )}
          {room.isPublic && isHost && startsIn !== null && <p className="race-note big">Lobby full! Starting in <b>{startsIn}s</b></p>}
          <div className="splash-links">
            <span>{seated.length} in · {room.maxPlayers - seated.length} open</span>
            <button type="button" className="btn-ghost agent-link" onClick={() => { sound.click(); setPicking(true); }}>
              <AgentAvatar name={meP?.avatar} size={28} /> {meP?.avatar ?? "Agent"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => { sound.click(); setRules(true); }}>How to play</button>
            <button type="button" className="btn-ghost" onClick={() => { sound.click(); setSettings(true); }}>Room settings</button>
            <button type="button" className="btn-ghost" onClick={invite}>{copied ? "Link copied!" : "Invite"}</button>
            <button type="button" className="btn-ghost chat-open-btn" onClick={() => setChatOpen(!chatOpen)}>Chat{room.chat.length ? ` (${room.chat.filter((l) => l.by).length})` : ""}</button>
            <EmojiButton emotes={room.emotes} />
            <button type="button" className="btn-ghost" onClick={() => { s.emit("leave"); navigate("/race"); }}>Leave</button>
          </div>
        </div>
      </div>

      <ChatPanel room={room} className={chatOpen ? "open" : ""} />
      {picking && <AgentPicker room={room} onClose={() => setPicking(false)} />}
      {rules && <RaceHowTo mode="spike" onClose={() => setRules(false)} />}
      {settings && (
        <Modal title="Room settings" onClose={() => setSettings(false)}>
          {isHost ? (
            <>
              <div className="race-field">
                <span className="label">Game</span>
                <div className="seg two" role="group" aria-label="Game mode">
                  {MODES.map((m) => (
                    <button key={m.id} type="button" aria-pressed={room.mode === m.id} disabled={seated.length > m.max}
                      onClick={() => { sound.click(); s.emit("settings", { mode: m.id }); }}>
                      {m.icon} {m.name}<small>up to {m.max}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="race-field">
                <span className="label">Questions last</span>
                <div className="seg" role="group" aria-label="How long each question lasts">
                  {PACES.map((p) => (
                    <button key={p.id} type="button" aria-pressed={room.pace === p.id} onClick={() => { sound.click(); s.emit("settings", { pace: p.id }); }}>
                      {p.label}<small>{p.note}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="race-field">
                <label className="label" htmlFor="splash-max">Seats</label>
                <select id="splash-max" className="race-input" value={room.maxPlayers} onChange={(e) => s.emit("settings", { maxPlayers: Number(e.target.value) })}>
                  {Array.from({ length: 7 }, (_, i) => i + 2).filter((n) => n >= seated.length).map((n) => <option key={n} value={n}>{n} seats</option>)}
                </select>
              </div>
              <label className="race-check"><input type="checkbox" checked={room.isPublic} onChange={(e) => s.emit("settings", { isPublic: e.target.checked })} /> Public (anyone can join from the list; quick chat only)</label>
            </>
          ) : (
            <p>Questions last: <b>{PACES.find((p) => p.id === room.pace)?.label}</b> ({PACES.find((p) => p.id === room.pace)?.note}) · {room.maxPlayers} seats · {room.isPublic ? "public" : "private"}. Only the host can change these.</p>
          )}
          <div className="race-field">
            <span className="label">Invite link</span>
            <input className="race-input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invite link" />
          </div>
          {isHost && seated.length > 1 && (
            <div className="race-field">
              <span className="label">Remove a player</span>
              <div className="kick-list">
                {seated.filter((p) => p.id !== room.you).map((p) => (
                  <button key={p.id} type="button" className="btn-ghost" onClick={() => s.emit("kick", p.id)}>✕ {p.name}</button>
                ))}
              </div>
            </div>
          )}
        </Modal>
      )}
    </main>
  );
}
