import { useEffect, useRef, useState } from "react";
import { getSocket } from "./socket";

/** 😀 button: pick an emoji and it pops up above your seat for a few seconds. */
export default function EmojiButton({ emotes }: { emotes: string[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  // Number keys 1-8 send an emoji, unless you're typing in a box
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < emotes.length) getSocket().emit("emote", i);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [emotes.length]);

  return (
    <div className="emoji-wrap" ref={box}>
      {open && (
        <div className="emoji-pop panel" role="menu">
          {emotes.map((e, i) => (
            <button key={e} type="button" role="menuitem" onClick={() => { getSocket().emit("emote", i); setOpen(false); }} aria-label={`Send ${e}`}>
              {e}<small>{i + 1}</small>
            </button>
          ))}
        </div>
      )}
      <button type="button" className="btn-dark emoji-btn" aria-label="Send an emoji" aria-expanded={open} onClick={() => setOpen(!open)}>😀</button>
    </div>
  );
}
