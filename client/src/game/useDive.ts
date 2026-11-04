import { useCallback, useEffect, useMemo, useState } from "react";
import type { DiveData, Prompt, RoundResult } from "../types";
import { pickDaily } from "./daily";
import { ambiguousOptions, knownNames, matchAnswer } from "./match";
import { loadDive, recordHistory, saveDive, type SavedDive } from "./storage";
import { METRES_PER_POINT } from "./tiers";

/** Everything about today's dive: which prompts, what's been answered, and the actions. */
export function useDive(data: DiveData | null, date: string) {
  const known = useMemo(() => (data ? knownNames(data.prompts) : new Set<string>()), [data]);
  const [saved, setSaved] = useState<SavedDive | null>(() => loadDive(date));

  // If the day changes while the tab is open, load that day's dive instead
  useEffect(() => setSaved(loadDive(date)), [date]);

  const prompts: Prompt[] = useMemo(() => {
    if (!data) return [];
    const picked = pickDaily(data.prompts, date, data.schedule);
    if (!saved) return picked;
    // Keep the prompts the player started with, even if the question list changed since
    const byId = new Map(data.prompts.map((p) => [p.id, p]));
    const kept = saved.promptIds.map((id) => byId.get(id));
    return kept.every(Boolean) ? (kept as Prompt[]) : picked;
  }, [data, date, saved]);

  const update = useCallback((next: SavedDive) => {
    saveDive(next);
    setSaved(next);
  }, []);

  const rounds = saved?.rounds ?? [];
  const finished = !!saved && rounds.length >= prompts.length && prompts.length > 0 && !saved.awaitingDescend;
  const points = rounds.reduce((n, r) => n + r.points, 0);

  const start = useCallback(() => {
    if (saved) return;
    update({ date, promptIds: prompts.map((p) => p.id), rounds: [], awaitingDescend: false, roundStartedAt: Date.now() });
  }, [saved, date, prompts, update]);

  /** Is this text a valid answer to the current prompt? (Doesn't end the round.) */
  const check = useCallback(
    (typed: string) => {
      const prompt = prompts[saved?.rounds.length ?? 0];
      return prompt ? matchAnswer(prompt, typed, known) : null;
    },
    [prompts, saved, known],
  );

  /** "reaver" could be Reaver Vandal or Reaver Phantom: a few options to suggest, or [] */
  const options = useCallback(
    (typed: string) => {
      const prompt = prompts[saved?.rounds.length ?? 0];
      return prompt ? ambiguousOptions(prompt, typed) : [];
    },
    [prompts, saved],
  );

  /** End the round: with a valid answer, or with whatever was typed when time ran out / they gave up. */
  const submit = useCallback(
    (typed: string, opts: { timedOut?: boolean; misses?: number } = {}) => {
      if (!saved || saved.awaitingDescend) return;
      const prompt = prompts[saved.rounds.length];
      if (!prompt) return;
      const match = matchAnswer(prompt, typed, known);
      const result: RoundResult = {
        promptId: prompt.id,
        typed: typed.trim(),
        answerId: match?.answer.id ?? null,
        tier: match?.answer.tier ?? null,
        points: match?.answer.points ?? 0,
        timedOut: !!opts.timedOut,
        corrected: !!match?.corrected,
        misses: opts.misses ?? 0,
      };
      update({ ...saved, rounds: [...saved.rounds, result], awaitingDescend: true, roundStartedAt: null });
    },
    [saved, prompts, known, update],
  );

  const descend = useCallback(() => {
    if (!saved) return;
    const done = saved.rounds.length >= prompts.length;
    update({ ...saved, awaitingDescend: false, roundStartedAt: done ? null : Date.now() });
    if (done) {
      recordHistory(saved.date, { points: saved.rounds.reduce((n, r) => n + r.points, 0), tiers: saved.rounds.map((r) => r.tier) });
    }
  }, [saved, prompts.length, update]);

  return {
    prompts,
    rounds,
    started: !!saved,
    finished,
    awaitingDescend: !!saved?.awaitingDescend,
    roundStartedAt: saved?.roundStartedAt ?? null,
    current: Math.min(rounds.length, Math.max(prompts.length - 1, 0)),
    points,
    depth: points * METRES_PER_POINT,
    start,
    check,
    options,
    submit,
    descend,
  };
}

export type Dive = ReturnType<typeof useDive>;
