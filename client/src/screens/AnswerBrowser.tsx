import { useState } from "react";
import type { Prompt } from "../types";
import { norm } from "../game/match";
import { TIER_ORDER, TIERS } from "../game/tiers";

/** Every valid answer to a prompt, grouped by rank, with your answer highlighted. */
export default function AnswerBrowser({ prompt, mine }: { prompt: Prompt; mine: string | null }) {
  const [filter, setFilter] = useState("");
  const f = norm(filter);
  const shown = prompt.answers.filter((a) => !f || norm(a.id).includes(f) || a.aliases.some((x) => norm(x).includes(f)));
  return (
    <div className="browser">
      <input
        className="browser-filter"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={`Filter ${prompt.answers.length} answers…`}
        aria-label="Filter answers"
      />
      <div className="browser-grid">
        {TIER_ORDER.map((t) => {
          const list = shown.filter((a) => a.tier === t);
          if (!list.length) return null;
          return (
            <div key={t} className="browser-col" style={{ ["--tier" as string]: TIERS[t].color }}>
              <div className="browser-head"><span>{TIERS[t].name}</span><span>{list.length}</span></div>
              {list.map((a) => (
                <div key={a.id} className={`browser-row${a.id === mine ? " mine" : ""}`}>
                  {a.source ? <a href={a.source} target="_blank" rel="noreferrer">{a.id}</a> : <span>{a.id}</span>}
                  {a.id === mine && <small>You</small>}
                </div>
              ))}
            </div>
          );
        })}
        {!shown.length && <p className="muted">No answers match “{filter}”.</p>}
      </div>
    </div>
  );
}
