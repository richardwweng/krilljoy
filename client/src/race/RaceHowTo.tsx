import Modal from "../components/Modal";
import TierGem from "../components/TierGem";
import { TIER_ORDER, TIERS } from "../game/tiers";
import { LENGTHS } from "./types";

// Metres per rank in a race (points x 10, the same as the daily dive)
const METRES: Record<string, number> = { plankton: 100, too_clever: 150, schooler: 300, rare: 600, deep_cut: 850, one_in_a_krillion: 1000 };

/** "How to play" for the treasure race (the top bar shows this one on /race pages). */
export default function RaceHowTo({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Treasure race" onClose={onClose}>
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
        <li><b>First to the chest wins.</b> Everyone else then gets a 30-second last call. Reach the chest in time and you place by finish order; after that, places go by depth.</li>
        <li><b>Race length</b> is picked by the host: {LENGTHS.map((l) => `${l.label} ${l.metres.toLocaleString("en-US")} m`).join(" · ")}. Quick play is Normal.</li>
        <li><b>Watch the others</b> on the gauge and leaderboard as they dive.</li>
      </ul>
      <p className="muted">Quick play joins a public lobby, which starts 30 seconds after it fills up (or when its host presses Start). Host a room to play with friends: share the 4-letter code or invite link, and press Start when everyone’s in.</p>
    </Modal>
  );
}
