import Modal from "../components/Modal";
import TierGem from "../components/TierGem";
import { PROMPTS_PER_DIVE, SECONDS_PER_PROMPT } from "../game/daily";
import { TIER_ORDER, TIERS } from "../game/tiers";

const MEANING: Record<string, string> = {
  plankton: "The answer everyone blurts out",
  too_clever: "The “obscure” pick everyone thinks of",
  schooler: "Common, but not the first thought",
  rare: "Most people won’t think of it",
  deep_cut: "Real knowledge",
  one_in_a_krillion: "The rarest answer. Almost nobody finds it",
};
const POINTS: Record<string, number> = { plankton: 10, too_clever: 15, schooler: 30, rare: 60, deep_cut: 85, one_in_a_krillion: 100 };

export default function HowTo({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How to play" onClose={onClose}>
      <p>Every day there are {PROMPTS_PER_DIVE} prompts, the same for everyone. You have {SECONDS_PER_PROMPT} seconds to lock in one valid answer for each. Wrong guesses don’t count against you: keep trying until the clock runs out.</p>
      <p>Any valid answer scores, but <b>rarer answers score more</b> and sink you deeper. Every point is 10 metres.</p>
      <div className="howto-tiers">
        {TIER_ORDER.map((t) => (
          <div key={t} className="howto-tier">
            <TierGem tier={t} scale={4} />
            <b style={{ color: TIERS[t].color }}>{TIERS[t].name}</b>
            <span>{MEANING[t]}</span>
            <b>{POINTS[t]}</b>
          </div>
        ))}
      </div>
      <p className="muted">Close spellings get fixed for you. Pro-scene prompts mean tier 1: anyone on a roster at a VCT international or a franchised VCT league event (2023+).</p>
    </Modal>
  );
}
