// Room chat and emoji reactions.
// Public rooms (strangers): only the preset quick messages. Private rooms (friends):
// anything, with slurs and swears starred out. Both have spam limits.
import {
  RegExpMatcher, TextCensor, asteriskCensorStrategy, englishDataset, englishRecommendedTransformers,
} from "obscenity";

export const QUICK_CHAT = [
  "Good luck!", "Nice one!", "GG", "Unlucky", "Too fast!", "Oops", "That was rare!", "Close one!", "Hurry up!", "One more?",
];
export const EMOTES = ["😂", "🔥", "😤", "💀", "👏", "🤯", "😭", "🫡"];
export const CHAT_KEEP = 40; // lines each room remembers
const MAX_LEN = 120;
const EMOTE_SHOW_MS = 3_000;

export interface ChatLine {
  id: number;
  by: string | null; // player id; null = a system line ("Ana joined")
  name: string;
  text: string;
  at: number;
}

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
const censor = new TextCensor().setStrategy(asteriskCensorStrategy());

/** Free text from a private room: tidied, shortened, bad words starred out. */
export function cleanChat(raw: unknown): string | null {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LEN);
  if (!text) return null;
  return censor.applyTo(text, matcher.getAllMatches(text));
}

/** At most 5 messages in 5 seconds, and not two within 0.6 s. Returns false = too fast. */
export function allowChat(times: number[], now: number): boolean {
  while (times.length && now - times[0] > 5_000) times.shift();
  if (times.length >= 5 || (times.length && now - times[times.length - 1] < 600)) return false;
  times.push(now);
  return true;
}

/** One emoji per second each. */
export function allowEmote(last: number, now: number): boolean {
  return now - last >= 1_000;
}

export const emoteVisible = (at: number, now: number) => now - at < EMOTE_SHOW_MS;
