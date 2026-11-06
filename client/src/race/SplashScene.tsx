import type { ReactNode } from "react";
import Sprite from "../components/Sprite";
import TierGem from "../components/TierGem";
import { ROCKS, ROCK_COLORS, SPIKE, SPIKE_COLORS } from "../components/sprites";
import { TIERS } from "../game/tiers";
import type { TierKey } from "../types";
import { Hearts } from "./Hearts";
import AgentAvatar from "./AgentAvatar";
import LifeMeter, { type MeterPart } from "./LifeMeter";

export interface Slot {
  id: string | null; // null = an empty seat (lobby)
  name: string;
  color: string;
  you?: boolean;
  host?: boolean;
  away?: boolean;
  lives?: number;
  startLives?: number;
  meter?: MeterPart[]; // what has filled their extra-life bar so far
  lifeEvery?: number;
  out?: boolean;
  plusOne?: boolean;
  said?: { answerId: string; tier: string } | null;
  emote?: string | null;
  avatar?: string; // agent name
}

/** The seabed: everyone on a rock around the spike, you at the bottom (like Krillion's
 *  Puffer Party, with our own art). Used by the lobby and the game. */
export default function SplashScene({ slots, turn, spike, children, onPickMine }: {
  slots: Slot[];
  onPickMine?: () => void; // lobby: tap your own agent to change it
  turn?: number; // index of whose turn it is (the spike drifts toward them)
  spike?: { frac: number; label: string; hot: boolean; asleep?: boolean };
  children?: ReactNode; // the title (lobby) or the question card (game)
}) {
  const n = slots.length;
  const me = Math.max(0, slots.findIndex((s) => s.you));
  const angleOf = (i: number) => 90 + (360 / n) * (i - me); // 90deg = straight down: you're at the bottom
  const toward = turn !== undefined && turn >= 0 ? angleOf(turn) : null;
  return (
    <div className="scene">
      <div className="scene-top">{children}</div>
      <div className="scene-ring">
        <div className="scene-floor" aria-hidden="true" />
        {slots.map((s, i) => (
          <div
            key={s.id ?? `empty-${i}`}
            className={`rock-seat${s.id ? "" : " empty"}${i === turn ? " turn" : ""}${s.out ? " out" : ""}${s.you ? " me" : ""}${s.plusOne ? " gained" : ""}`}
            style={{ ["--a" as string]: `${angleOf(i)}deg`, ["--c" as string]: s.color }}
          >
            {s.emote && <span className="emote-bubble" key={s.emote}>{s.emote}</span>}
            {s.said && !s.emote && (
              <span className="said-bubble" style={{ ["--tier" as string]: TIERS[s.said.tier as TierKey]?.color }}>
                <TierGem tier={s.said.tier as TierKey} scale={2} /><span className="said-text">{s.said.answerId}</span>
              </span>
            )}
            {s.id && (s.you && onPickMine ? (
              <button type="button" className="avatar-btn" onClick={onPickMine} aria-label="Change your agent" title="Change your agent">
                <AgentAvatar name={s.avatar} />
                <span className="avatar-edit" aria-hidden="true">✎</span>
              </button>
            ) : <AgentAvatar name={s.avatar} />)}
            <Sprite className="rock-sprite" rows={ROCKS[i % ROCKS.length]} colors={ROCK_COLORS} scale={6} />
            {s.id ? (
              <div className="rock-label">
                <span className="rock-name">{s.name}{s.host ? " ★" : ""}</span>
                {s.out ? <span className="rock-out">OUT</span>
                  : s.lives !== undefined && <Hearts lives={s.lives} max={s.startLives ?? 2} />}
                {s.plusOne ? <span className="plus-life">+1 ♥</span>
                  : s.meter !== undefined && !s.out && <LifeMeter parts={s.meter} lifeEvery={s.lifeEvery ?? 400} className="rock-meter" />}
                {s.away && <span className="rock-away">reconnecting…</span>}
              </div>
            ) : (
              <div className="rock-label"><span className="rock-open">open</span></div>
            )}
          </div>
        ))}
        {spike && (
          <div
            className={`scene-spike${spike.hot ? " hot" : ""}${spike.asleep ? " asleep" : ""}`}
            style={{ ["--p" as string]: spike.frac, ["--t" as string]: toward !== null ? `${toward}deg` : "90deg", ["--pull" as string]: toward !== null ? 1 : 0 }}
          >
            <div className="spike-ring" />
            <Sprite rows={SPIKE} colors={SPIKE_COLORS} scale={5} label="The spike" />
            <div className="spike-time">{spike.label}</div>
          </div>
        )}
      </div>
    </div>
  );
}
