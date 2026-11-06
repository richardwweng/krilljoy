import { useEffect, useRef, useState, type FormEvent } from "react";
import { getSocket } from "./socket";
import { colorFor } from "./colors";
import type { RoomView } from "./types";

function chatOffSaved(): boolean {
  try { return localStorage.getItem("krilljoy:chatOff") === "1"; } catch { return false; }
}

/** Room chat, like ERS: public rooms (strangers) get preset quick messages only;
 *  private rooms (friends) can type anything, with bad words starred out by the server. */
export default function ChatPanel({ room, className = "" }: { room: RoomView; className?: string }) {
  const [off, setOff] = useState(chatOffSaved);
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const s = getSocket();
  const color = (id: string | null) => colorFor(Math.max(0, room.players.findIndex((p) => p.id === id)));

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [room.chat.length, off]);

  const toggle = () => {
    setOff(!off);
    try { localStorage.setItem("krilljoy:chatOff", off ? "0" : "1"); } catch { /* fine */ }
  };
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    s.emit("chat", { text });
    setText("");
  };

  return (
    <aside className={`panel chat-panel ${className}`} aria-label="Chat">
      <div className="chat-head">
        <h2 className="section-title">Chat</h2>
        <button type="button" className="btn-ghost chat-toggle" onClick={toggle}>{off ? "Turn chat on" : "Turn chat off"}</button>
      </div>
      {off ? (
        <p className="race-note">Chat is off. You won’t see messages until you turn it back on.</p>
      ) : (
        <>
          <div className="chat-list" ref={list}>
            {room.chat.length === 0 && <p className="race-note">Say hi!</p>}
            {room.chat.map((l) => l.by ? (
              <p key={l.id} className="chat-line"><b style={{ color: color(l.by) }}>{l.name}</b> {l.text}</p>
            ) : (
              <p key={l.id} className="chat-line system">▸ {l.text}</p>
            ))}
          </div>
          <div className="chat-quick">
            {room.quickChat.map((q, i) => (
              <button key={q} type="button" className="chip" onClick={() => s.emit("chat", { quick: i })}>{q}</button>
            ))}
          </div>
          {room.isPublic ? (
            <p className="chat-note">Quick chat only in public rooms</p>
          ) : (
            <form className="chat-input" onSubmit={send}>
              <input className="race-input" value={text} maxLength={120} placeholder="say something…" aria-label="Chat message"
                onChange={(e) => setText(e.target.value)} autoComplete="off" />
              <button type="submit" className="btn-dark" disabled={!text.trim()}>Send</button>
            </form>
          )}
        </>
      )}
    </aside>
  );
}
