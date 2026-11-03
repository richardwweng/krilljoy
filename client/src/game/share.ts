import type { RoundResult } from "../types";
import { METRES_PER_POINT, MISS, TIERS } from "./tiers";

export function shareText(number: number, rounds: RoundResult[]): string {
  const points = rounds.reduce((n, r) => n + r.points, 0);
  const squares = rounds.map((r) => (r.tier ? TIERS[r.tier].emoji : MISS.emoji)).join("");
  return `Krilljoy #${number} · ${(points * METRES_PER_POINT).toLocaleString("en-US")} m\n${squares}\n${location.origin}`;
}

/** Phone share sheet when there is one, otherwise copy to the clipboard. Returns what happened. */
export async function shareResult(text: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ text });
      return "shared";
    }
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
