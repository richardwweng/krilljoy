import { useState } from "react";
import Modal from "../components/Modal";
import TierGem from "../components/TierGem";
import { TIER_ORDER, TIERS } from "../game/tiers";
import { LENGTHS, MODES, type Mode } from "./types";

// Metres per rank in a race (points x 10, the same as the daily dive)
const METRES: Record<string, number> = { plankton: 100, too_clever: 150, schooler: 300, rare: 600, deep_cut: 850, one_in_a_krillion: 1000 };

/** "How to play" for the multiplayer modes (the top bar shows this one on /race pages). */
export default function RaceHowTo({ onClose, mode = "race" }: { onClose: () => void; mode?: Mode }) {
  const [tab, setTab] = useState<Mode>(mode);
  return (
    <Modal title={MODES.find((m) => m.id === tab)!.name} onClose={onClose}>
      <div className="seg howto-tabs" role="tablist" aria-label="Game mode">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={tab === m.id} aria-pressed={tab === m.id} onClick={() => setTab(m.id)}>{m.icon} {m.name}</button>
        ))}
      </div>
      {tab === "race" ? <RaceRules /> : <SpikeRules />}
    </Modal>
  );
}

function RaceRules() {
  return (
    <>
      <p>Everyone in the room gets <b>the same questions in the same order</b>. There’s <b>no timer</b>: lock in a valid answer and the next question appears right away. Race to the treasure chest at the bottom.</p>
      <p>Any valid answer sinks you, but <b>rarer answers sink you deeper</b>:</p>
      <div className="howto-tiers race-howto-tiers">
        {TIER_ORDER.map((t) => (
          <div key={t} className="howto-tier">
            <TierGem tier={t} scale={4} />
            <b style={{ color: TIERS[t].color }}>{TIERS[t].name}</b>
            <span />
            <b>{METRES[t].toLocaleString("en-US")} m</b>
          </div>
        ))}
      </div>
      <ul className="race-howto-list">
        <li><b>Wrong guesses are free.</b> Keep typing. Close spellings get suggested: press Enter again to confirm.</li>
        <li><b>Stuck?</b> After 25 seconds you can skip (0 m).</li>
        <li><b>First to the chest wins.</b> Everyone else then gets a 1-minute last call. Reach the chest in time and you place by finish order; after that, places go by depth.</li>
        <li><b>Race length</b> is picked by the host: {LENGTHS.map((l) => `${l.label} ${l.metres.toLocaleString("en-US")} m`).join(" · ")}. Quick play is Normal.</li>
        <li><b>Watch the others</b> on the gauge and leaderboard as they dive.</li>
      </ul>
      <p className="muted">Quick play joins a public lobby, which starts 30 seconds after it fills up (or when its host presses Start). Host a room to play with friends: share the 4-letter code or invite link, and press Start when everyone’s in.</p>
    </>
  );
}

function SpikeRules() {
  return (
    <>
      <p>Everyone sits in a circle with <b>the spike</b> in the middle. It’s passed around: on your turn, <b>name a valid answer before your time runs out</b> and the spike moves on to the next player.</p>
      <ul className="race-howto-list">
        <li><b>Run out of time and the spike goes off on you:</b> you lose a life. Lose both lives and you’re out.</li>
        <li><b>Last one standing wins.</b></li>
        <li><b>Your clock</b> starts at 15 seconds and gets 1 second shorter every lap around the table, down to 7.</li>
        <li><b>No repeats.</b> Every answer said is off the table for that question. Wrong guesses are free while your time lasts, and close spellings get suggested: press Enter again to confirm.</li>
        <li><b>New question</b> after the spike goes off, or once a question has had its share of answers (8 to 18, depending on how many it has). The host can make questions shorter or longer.</li>
        <li><b>Extra lives:</b> every answer fills your meter by its rank (Silver 10 points … Radiant 100). Every 400 points = <b>+1 life</b>, up to 4. So rare answers keep you alive longer.</li>
      </ul>
      <p className="muted">Up to 8 players. Only questions with 15 or more answers are used. Quick play joins a public lobby that starts 30 seconds after it fills up (6 players), or when its host presses Start.</p>
    </>
  );
}
