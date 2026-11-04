// Answer matching, shared by the daily game (client/) and the race server (server/),
// so both judge answers exactly the same way. Keep it free of browser- or Node-only code.

/** The parts of an answer / prompt that matching needs (dive.json has more fields). */
export interface Answer { id: string; aliases: string[]; tier: string; points: number }
export interface Prompt<A extends Answer = Answer> { id: string; answers: A[] }

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

// How many typos a name forgives. Short names forgive less, or "sen" would match too much.
const allowedTypos = (len: number) => (len >= 10 ? 3 : len >= 6 ? 2 : len >= 4 ? 1 : 0);

export interface Match<A extends Answer = Answer> {
  answer: A;
  corrected: boolean; // true when we guessed what they meant ("jet" -> "Jett"); the player confirms
}

/** Words of a name, for "the start of a word" matching: "Prelude to Chaos Stinger" -> prelude, to, chaos, stinger */
const words = (text: string) =>
  text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(Boolean);

/** Answers whose name (or a word in it) starts with what was typed: "brim" -> Brimstone, "prelude" -> Prelude to Chaos */
function startsWithMatches<A extends Answer>(prompt: Prompt<A>, t: string): A[] {
  if (t.length < 3) return [];
  return prompt.answers.filter((a) =>
    [a.id, ...a.aliases].some((name) => norm(name).startsWith(t) || words(name).some((w) => w.length > 2 && w.startsWith(t))),
  );
}

/** The answer this text counts as, or null if it isn't a valid answer. */
export function matchAnswer<A extends Answer>(prompt: Prompt<A>, typed: string, known: Set<string>): Match<A> | null {
  const t = norm(typed);
  if (!t) return null;
  for (const a of prompt.answers) {
    if (norm(a.id) === t || a.aliases.some((x) => norm(x) === t)) return { answer: a, corrected: false };
  }
  if (known.has(t)) return null; // it's a real name, just not a right one here

  // 1) Shorthand: the start of an answer's name or word ("brim", "rgx", "prelude").
  //    If it fits several answers ("reaver"), don't guess: the game asks "which one?"
  const starts = startsWithMatches(prompt, t);
  if (starts.length === 1) return { answer: starts[0], corrected: true };
  if (starts.length > 1) return null;

  // 2) Typos: closest answer within a few letters
  let best: A | null = null;
  let bestDist = Infinity;
  let tie = false;
  const mine = new Set<string>();
  for (const a of prompt.answers) {
    for (const name of new Set([a.id, ...a.aliases].map(norm))) {
      mine.add(name);
      const allowed = allowedTypos(Math.min(name.length, t.length));
      if (!allowed) continue;
      const dist = distance(t, name, allowed);
      if (dist > allowed) continue;
      if (dist < bestDist) { best = a; bestDist = dist; tie = false; }
      else if (dist === bestDist && best !== a) tie = true;
    }
  }
  if (best && !tie) {
    // If the text is even closer to a real name that ISN'T valid here, it was probably that one
    for (const name of known) {
      if (!mine.has(name) && Math.abs(name.length - t.length) < bestDist && distance(t, name, bestDist - 1) < bestDist) return null;
    }
    return { answer: best, corrected: true };
  }

  return null;
}

/** When a short name fits several answers ("reaver" in a question about many guns), a few of them, to ask "which one?" */
export function ambiguousOptions<A extends Answer>(prompt: Prompt<A>, typed: string): string[] {
  const t = norm(typed);
  const hits = startsWithMatches(prompt, t);
  return hits.length > 1 ? hits.slice(0, 3).map((a) => a.id) : [];
}
