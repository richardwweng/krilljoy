import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Prompt } from "../types";
import type { Match } from "../game/match";
import { isProScene, SECONDS_PER_PROMPT } from "../game/daily";
import { sound } from "../game/sound";

interface Props {
  prompt: Prompt;
  round: number;
  startedAt: number;
  check: (typed: string) => Match | null;
  options: (typed: string) => string[];
  onSubmit: (typed: string, opts?: { timedOut?: boolean; misses?: number }) => void;
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

export default function Question({ prompt, round, startedAt, check, options, onSubmit }: Props) {
  const [typed, setTyped] = useState("");
  const [left, setLeft] = useState(SECONDS_PER_PROMPT);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  // A close spelling was found: the box now holds the real name; Enter again confirms
  const [suggestion, setSuggestion] = useState<{ from: string; to: string } | null>(null);
  const typedRef = useRef("");
  const misses = useRef(0);
  const sent = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const lastTick = useRef(SECONDS_PER_PROMPT + 1);

  // Clock counts from when the round started (saved), so reloading doesn't buy time.
  // When it runs out, whatever is in the box counts if it's valid; otherwise 0.
  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, SECONDS_PER_PROMPT - (Date.now() - startedAt) / 1000);
      setLeft(remaining);
      // Countdown tick each second for the last 5 seconds
      const whole = Math.ceil(remaining);
      if (whole <= 5 && whole >= 1 && whole < lastTick.current && !sent.current) sound.tick(whole === 1);
      lastTick.current = whole;
      if (remaining <= 0 && !sent.current) {
        sent.current = true;
        onSubmit(typedRef.current, { timedOut: true, misses: misses.current });
      }
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [startedAt, onSubmit]);

  // Wrong answers don't end the round (like Krillion): shake, say so, keep guessing
  const lockIn = (e: FormEvent) => {
    e.preventDefault();
    if (sent.current || !typed.trim()) return;
    const match = check(typed);
    if (!match) {
      const several = options(typed);
      if (several.length) {
        // Not wrong, just not specific enough: doesn't count as a miss
        setError(`Which one? e.g. ${several.join(", ")}`);
        sound.suggest();
        input.current?.focus();
        return;
      }
      misses.current++;
      sound.wrong();
      setError(`“${typed.trim()}” isn’t valid. Try again!`);
      setShake(true);
      input.current?.select();
      return;
    }
    if (match.corrected) {
      // Like Krillion: show what it would count as, and let them confirm or keep editing
      setSuggestion({ from: typed.trim(), to: match.answer.id });
      sound.suggest();
      setTyped(match.answer.id);
      typedRef.current = match.answer.id;
      return;
    }
    sent.current = true;
    onSubmit(typed, { misses: misses.current });
  };

  const giveUp = () => {
    if (sent.current) return;
    sent.current = true;
    onSubmit("", { misses: misses.current });
  };

  const seconds = Math.ceil(left);
  const urgent = seconds <= 5;
  return (
    <>
      <section className="card question-card panel">
        <div className="label accent">{POOL_LABELS[prompt.pool] ?? (isProScene(prompt) ? "Pro scene" : "Valorant")} · Prompt {round}</div>
        <h1 className="prompt"><PromptText text={prompt.text} /></h1>
        <p className="hint">▼ rarer answers sink deeper ▼</p>
      </section>

      <form className="controls" onSubmit={lockIn}>
        <div className="input-note" role="alert">
          {suggestion ? (
            <div className="suggest panel">
              <div>“{suggestion.from}” <span className="arrow">→</span> <b>“{suggestion.to}”</b></div>
              <small>submit again to confirm · or edit</small>
            </div>
          ) : (
            <p className="inline-error">{error ?? ""}</p>
          )}
        </div>
        <div className="input-row">
          <div className={`clock${urgent ? " urgent" : ""}`} role="timer" aria-label={`${seconds} seconds left`}>{seconds}</div>
          <input
            ref={input}
            className={`answer-input${shake ? " shake" : ""}`}
            onAnimationEnd={() => setShake(false)}
            value={typed}
            onChange={(e) => { setTyped(e.target.value); typedRef.current = e.target.value; if (error) setError(null); if (suggestion) setSuggestion(null); }}
            placeholder="type one answer…"
            aria-label="Your answer"
            aria-invalid={!!error}
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
          <span>Wrong guesses are free<span className="desktop-only"> · typos get fixed</span></span>
          <button type="button" className="btn-ghost" onClick={giveUp}>Give up →</button>
        </div>
      </form>
    </>
  );
}
