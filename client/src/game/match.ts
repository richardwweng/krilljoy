import type { Answer, Prompt } from "../types";

/** "KAY/O" -> "kayo", "Reykjavík" -> "reykjavik", "C Waterfall" -> "cwaterfall" */
export function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/ø/g, "o").replace(/æ/g, "ae").replace(/œ/g, "oe")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Every name that is a valid answer to ANY prompt. Used so a typo-match never
 *  turns a different real player/skin into a correct answer. */
export function knownNames(prompts: Prompt[]): Set<string> {
  const out = new Set<string>();
  for (const p of prompts) for (const a of p.answers) for (const n of [a.id, ...a.aliases]) out.add(norm(n));
  return out;
}

// Edit distance where swapping two neighbouring letters counts as one typo
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// How many typos a name forgives: none for short names (too easy to hit another name)
const allowedTypos = (len: number) => (len >= 9 ? 2 : len >= 5 ? 1 : 0);

/** The answer this text counts as, or null if it isn't a valid answer. */
export function matchAnswer(prompt: Prompt, typed: string, known: Set<string>): Answer | null {
  const t = norm(typed);
  if (!t) return null;
  for (const a of prompt.answers) {
    if (norm(a.id) === t || a.aliases.some((x) => norm(x) === t)) return a;
  }
  if (known.has(t)) return null; // it's a real name, just not a right one here

  let best: Answer | null = null;
  let bestDist = Infinity;
  let tie = false;
  for (const a of prompt.answers) {
    for (const name of new Set([a.id, ...a.aliases].map(norm))) {
      const allowed = allowedTypos(name.length);
      if (!allowed) continue;
      const dist = distance(t, name, allowed);
      if (dist > allowed) continue;
      if (dist < bestDist) { best = a; bestDist = dist; tie = false; }
      else if (dist === bestDist && best !== a) tie = true;
    }
  }
  return tie ? null : best; // two answers equally close: don't guess
}
