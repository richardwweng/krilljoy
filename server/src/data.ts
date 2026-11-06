// The answer banks: the same dive.json the daily game reads (written by the pipeline).
// The server reloads it when the file changes, so a new deploy or a nightly rebuild
// is picked up without restarting.
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { knownNames } from "../../shared/match.ts";

export interface Answer { id: string; aliases: string[]; tier: string; points: number; share?: number }
export interface Prompt { id: string; text: string; pool: string; answers: Answer[] }

// Where dive.json lives. On Render the whole repo is there, so this default works;
// DIVE_JSON can point somewhere else if needed.
const FILE = process.env.DIVE_JSON ?? fileURLToPath(new URL("../../client/public/data/dive.json", import.meta.url));

let loadedMtime = 0;
let prompts: Prompt[] = [];
let byId = new Map<string, Prompt>();
let known = new Set<string>();

function reloadIfChanged() {
  try {
    const mtime = statSync(FILE).mtimeMs;
    if (mtime === loadedMtime) return;
    const data = JSON.parse(readFileSync(FILE, "utf8")) as { prompts: Prompt[] };
    // A race needs answers to check: skip empty questions
    prompts = data.prompts.filter((p) => p.answers.length > 0);
    byId = new Map(prompts.map((p) => [p.id, p]));
    known = knownNames(prompts);
    loadedMtime = mtime;
    console.log(`Loaded ${prompts.length} questions from ${FILE}`);
  } catch (e) {
    if (!prompts.length) throw new Error(`Couldn't read the answer file at ${FILE}: ${(e as Error).message}`);
    console.error("Couldn't reload the answer file, keeping the old one:", (e as Error).message);
  }
}

export function allPrompts(): Prompt[] {
  reloadIfChanged();
  return prompts;
}
export function getPrompt(id: string): Prompt | undefined {
  reloadIfChanged();
  return byId.get(id);
}
export function knownAnswerNames(): Set<string> {
  reloadIfChanged();
  return known;
}

// ---------- agent select (Spike splash) ----------
// agents.json is written by the pipeline from valorant-api.com on every build (the nightly
// rebuild included), so new agents appear without code changes. Reloaded when it changes.
export interface Agent { name: string; icon: string }
const AGENTS_FILE = process.env.AGENTS_JSON ?? fileURLToPath(new URL("../../client/public/data/agents.json", import.meta.url));
let agentsMtime = 0;
let agents: Agent[] = [];

export function allAgents(): Agent[] {
  try {
    const mtime = statSync(AGENTS_FILE).mtimeMs;
    if (mtime !== agentsMtime) {
      agents = (JSON.parse(readFileSync(AGENTS_FILE, "utf8")) as Agent[]).filter((a) => a && a.name);
      agentsMtime = mtime;
    }
  } catch (e) {
    if (!agents.length) console.error(`Couldn't read the agent list at ${AGENTS_FILE}:`, (e as Error).message);
  }
  return agents;
}
