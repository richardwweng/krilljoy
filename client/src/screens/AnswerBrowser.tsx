import { useMemo, useState } from "react";
import type { Prompt, TierKey } from "../types";
import { norm } from "../game/match";
import { TIER_ORDER, TIERS } from "../game/tiers";
import TierGem from "../components/TierGem";
import { sound } from "../game/sound";

const RAREST_FIRST = [...TIER_ORDER].reverse();
const PAGE = 100; // rows shown at once; more load as you scroll

/** Every valid answer to a prompt: filter by rank, search, rarest first. Your answer is highlighted. */
export default function AnswerBrowser({ prompt, mine }: { prompt: Prompt; mine: string | null }) {
  const [tier, setTier] = useState<TierKey | "all">("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  const sorted = useMemo(
    () => [...prompt.answers].sort((a, b) => RAREST_FIRST.indexOf(a.tier) - RAREST_FIRST.indexOf(b.tier) || (a.share ?? 0) - (b.share ?? 0)),
    [prompt],
  );
  const counts = useMemo(() => {
    const c = new Map<TierKey, number>();
    for (const a of prompt.answers) c.set(a.tier, (c.get(a.tier) ?? 0) + 1);
    return c;
  }, [prompt]);

  const q = norm(query);
  const list = sorted.filter((a) => (tier === "all" || a.tier === tier) && (!q || norm(a.id).includes(q) || a.aliases.some((x) => norm(x).includes(q))));

  return (
    <div className="browser">
      <div className="chips" role="group" aria-label="Filter by rank">
        <button type="button" className={`chip${tier === "all" ? " on" : ""}`} onClick={() => { sound.click(); setTier("all"); setShown(PAGE); }}>
          All <span>{prompt.answers.length}</span>
        </button>
        {RAREST_FIRST.filter((t) => counts.get(t)).map((t) => (
          <button key={t} type="button" className={`chip${tier === t ? " on" : ""}`} style={{ color: TIERS[t].color }}
            onClick={() => { sound.click(); setTier(t); setShown(PAGE); }}>
            {TIERS[t].name} <span>{counts.get(t)}</span>
          </button>
        ))}
      </div>
      <input className="browser-filter" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }}
        placeholder="Search all answers…" aria-label="Search all answers" />
      <div className="browser-list" onScroll={(e) => {
        const el = e.currentTarget;
        if (el.scrollTop + el.clientHeight > el.scrollHeight - 80) setShown((n) => n + PAGE);
      }}>
        {list.slice(0, shown).map((a) => (
          <div key={a.id} className={`browser-row${a.id === mine ? " mine" : ""}`} style={{ ["--tier" as string]: TIERS[a.tier].color }}>
            <TierGem tier={a.tier} scale={3} />
            <span className="browser-name">
              {a.id}
              {a.id === mine && <small className="you">you</small>}
              {a.source?.startsWith("http") && <a href={a.source} target="_blank" rel="noreferrer" className="src" aria-label={`${a.id} on Liquipedia`}>↗</a>}
            </span>
            <span className="browser-pts">+{a.points}</span>
          </div>
        ))}
        {!list.length && <p className="muted empty">No answers match “{query}”.</p>}
      </div>
      <div className="browser-foot">
        <span>{Math.min(shown, list.length)} of {list.length} answers</span>
        {list.length > shown && <span>Scroll for more</span>}
      </div>
    </div>
  );
}
