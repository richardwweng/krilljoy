// The agents players can sit as in Spike splash. The list (name + Riot's official icon from
// valorant-api.com) is written by the pipeline into public/data/agents.json on every build,
// so new agents show up in agent select after the nightly rebuild with no code changes.
import { useSyncExternalStore } from "react";

export interface Agent { name: string; icon: string }

let agents: Agent[] = [];
let started = false;
const listeners = new Set<() => void>();

function load() {
  if (started) return;
  started = true;
  fetch("/data/agents.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : []))
    .then((list: Agent[]) => { agents = Array.isArray(list) ? list : []; listeners.forEach((f) => f()); })
    .catch(() => { started = false; }); // try again next time something asks
}

/** Every agent, alphabetical (empty for a moment while the list loads). */
export function useAgents(): Agent[] {
  load();
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => agents);
}
