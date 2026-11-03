import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Prompt } from "../types";
import { isProScene, SECONDS_PER_PROMPT } from "../game/daily";

interface Props {
  prompt: Prompt;
  round: number;
  startedAt: number;
  onSubmit: (typed: string, timedOut?: boolean) => void;
}

const POOL_LABELS: Record<string, string> = {
  players: "Pro scene", teams: "Pro scene", skins: "Skins", callouts: "Maps", maps: "Maps",
  agents: "Agents", abilities: "Agents", weapons: "Weapons", list: "Valorant",
};

/** Highlight the last word of the prompt in red, like "Name a callout on ASCENT". */
function PromptText({ text }: { text: string }) {
  const m = text.match(/^(.*\s)(\S+?)([?.!]?)$/);
  if (!m) return <>{text}</>;
  return <>{m[1]}<span className="accent">{m[2]}</span>{m[3]}</>;
}

export default function Question({ prompt, round, startedAt, onSubmit }: Props) {
  const [typed, setTyped] = useState("");
  const typedRef = useRef("");
  const [left, setLeft] = useState(SECONDS_PER_PROMPT);
  const sent = useRef(false);

  useEffect(() => {
    sent.current = false;
    setTyped("");
    typedRef.current = "";
  }, [prompt.id]);

  // Clock counts from when the round started (saved), so reloading doesn't buy time
  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, SECONDS_PER_PROMPT - (Date.now() - startedAt) / 1000);
      setLeft(remaining);
      if (remaining <= 0 && !sent.current) {
        sent.current = true;
        onSubmit(typedRef.current, true);
      }
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [startedAt, onSubmit]);

  const lockIn = (e: FormEvent) => {
    e.preventDefault();
    if (sent.current || !typed.trim()) return;
    sent.current = true;
    onSubmit(typed);
  };

  const seconds = Math.ceil(left);
  const urgent = seconds <= 5;
  return (
    <>
      <section className="card question-card panel">
        <div className="label accent">{POOL_LABELS[prompt.pool] ?? (isProScene(prompt) ? "Pro scene" : "Valorant")} · Round {round}</div>
        <h1 className="prompt"><PromptText text={prompt.text} /></h1>
        <p className="hint">One answer. The rarer it is, the deeper you sink.</p>
      </section>

      <form className="controls" onSubmit={lockIn}>
        <div className="input-row">
          <div className={`clock${urgent ? " urgent" : ""}`} role="timer" aria-label={`${seconds} seconds left`}>{seconds}</div>
          <input
            className="answer-input"
            value={typed}
            onChange={(e) => { setTyped(e.target.value); typedRef.current = e.target.value; }}
            placeholder="Type your answer"
            aria-label="Your answer"
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={60}
          />
          <button type="submit" className="btn-red" disabled={!typed.trim()}>Lock in</button>
        </div>
        <div className="time-bar" aria-hidden="true">
          {Array.from({ length: SECONDS_PER_PROMPT }, (_, i) => <i key={i} className={i < seconds ? (urgent ? "on urgent" : "on") : ""} />)}
        </div>
        <div className="below-input">
          <span><span className="desktop-only">Enter to lock in · </span>Small typos are fine</span>
          <button type="button" className="btn-ghost" onClick={() => { if (!sent.current) { sent.current = true; onSubmit(""); } }}>Skip →</button>
        </div>
      </form>
    </>
  );
}
