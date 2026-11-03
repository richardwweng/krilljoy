import type { HistoryEntry } from "./storage";
import { METRES_PER_POINT } from "./tiers";

export function summarize(history: Record<string, HistoryEntry>, today: string) {
  const dates = Object.keys(history).sort();
  const depths = dates.map((d) => history[d].points * METRES_PER_POINT);
  const radiants = dates.reduce((n, d) => n + history[d].tiers.filter((t) => t === "one_in_a_krillion").length, 0);
  // Streak: consecutive days ending today (or yesterday, if today isn't played yet)
  let streak = 0;
  const day = new Date(today + "T12:00:00Z");
  if (!history[today]) day.setUTCDate(day.getUTCDate() - 1);
  while (history[day.toISOString().slice(0, 10)]) {
    streak++;
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return {
    played: dates.length,
    best: depths.length ? Math.max(...depths) : 0,
    average: depths.length ? Math.round(depths.reduce((a, b) => a + b, 0) / depths.length) : 0,
    streak,
    radiants,
  };
}
