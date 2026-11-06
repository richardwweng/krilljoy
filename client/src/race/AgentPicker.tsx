import { useState } from "react";
import { useAgents } from "./agents";
import { sound } from "../game/sound";
import Modal from "../components/Modal";
import { ask } from "./socket";
import type { RoomView } from "./types";
import AgentAvatar from "./AgentAvatar";

export const AGENT_KEY = "krilljoy:agent"; // your last pick, used again in the next room

/** Agent select: tap an agent to sit as them. Each agent once per room. */
export default function AgentPicker({ room, onClose }: { room: RoomView; onClose: () => void }) {
  const [error, setError] = useState("");
  const agents = useAgents();
  const mine = room.players.find((p) => p.id === room.you)?.avatar;
  const holder = new Map(room.players.filter((p) => !p.left && p.id !== room.you).map((p) => [p.avatar, p.name]));
  const pick = async (name: string) => {
    sound.click();
    const r = await ask<{ ok: boolean; error?: string }>("avatar", name);
    if (!r.ok) return setError(r.error ?? "Couldn't switch.");
    try { localStorage.setItem(AGENT_KEY, name); } catch { /* fine */ }
    onClose();
  };
  return (
    <Modal title="Pick your agent" onClose={onClose}>
      <div className="agent-grid">
        {agents.map((a) => {
          const by = holder.get(a.name);
          return (
            <button key={a.name} type="button" className={`agent-pick${a.name === mine ? " on" : ""}`} disabled={!!by} onClick={() => pick(a.name)}
              title={by ? `${by} has ${a.name}` : a.name}>
              <AgentAvatar name={a.name} size={56} />
              <span>{by ? by : a.name}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="inline-error">{error}</p>}
    </Modal>
  );
}
