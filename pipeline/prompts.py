"""Step 2: turn the questions in prompts.json into answer banks (dive.json).

A question is a sentence, an answer POOL, and a list of conditions. An item
from the pool is a valid answer when it matches ALL conditions.

Pools:
  players                   pro players from Liquipedia (data.py)
  agents, abilities, weapons,
  skins, maps, callouts     game content from valorant-api.com (game.py)

Adding a condition for players = one check function + one entry in CONDITIONS.
Adding a filter for a game pool = one attribute in game.py + one line in GAME_POOLS.
"""
import json
from collections import defaultdict
from datetime import date
from pathlib import Path

import config

PROMPTS_FILE = Path(__file__).parent / "prompts.json"
WIKI = "https://liquipedia.net/valorant/"

TIERS = [  # (name, points, share of answers), most to least obvious
    ("plankton", 10, 0.15),
    ("schooler", 30, 0.20),
    ("rare", 60, 0.30),
    ("deep_cut", 85, 0.25),
    ("one_in_a_krillion", 100, 0.10),
]
POINTS = {name: pts for name, pts, _ in TIERS} | {"too_clever": 15}
KIND_LABELS = {"masters": "any Masters", "champions": "any Champions", "lockin": "LOCK//IN"}

# Game pools and the attributes questions can filter on (attribute: label)
GAME_POOLS = {
    "agents":    {"label": "Agents", "fields": {"role": "Role"}},
    "abilities": {"label": "Agent abilities",
                  "fields": {"agent": "Agent", "role": "Agent role", "slot": "Ability key"}},
    "weapons":   {"label": "Weapons", "fields": {"category": "Weapon type"}},
    "skins":     {"label": "Weapon skins",
                  "fields": {"weapon": "Weapon", "category": "Weapon type",
                             "edition": "Edition", "collection": "Collection"}},
    "maps":      {"label": "Maps", "fields": {"type": "Map type"}},
    "callouts":  {"label": "Map callouts",
                  "fields": {"map": "Map", "map_type": "Map type", "area": "Area"}},
}
POOL_SUBJECTS = {"players": "tier 1 players who…"}


# ---------- player conditions ----------
# Each check returns (matches, score_bonus, evidence) for one player.

def _event_set(value, ctx, pool):
    """Events in `pool` selected by value: 'any', 'kind:masters', or an event page."""
    if value == "any":
        return set(pool)
    if value.startswith("kind:"):
        kind = value[5:]
        return {e for e in pool if ctx["events"].get(e, {}).get("kind") == kind}
    return {value} & set(pool)


def _names(pages, ctx):
    return sorted(ctx["events"][p]["name"] for p in pages if p in ctx["events"])


def check_played_for(p, value, ctx):
    evs = p["teams"].get(value, [])
    return bool(evs), 2 * len(evs), {f"{ctx['teams'].get(value, value)} events": _names(evs, ctx)}


def check_country(p, value, ctx):
    return value in p["countries"], 0, {"countries": p["countries"]}


def check_won(p, value, ctx):
    won = _event_set(value, ctx, p["wins"])
    return bool(won), 3 * len(won), {}


def check_played_at(p, value, ctx):
    if value == "any" or value.startswith("kind:"):
        pool = [e for e in p["events"] if ctx["events"].get(e, {}).get("international")]
    else:
        pool = p["events"]
    hit = _event_set(value, ctx, pool)
    return bool(hit), len(hit), {"matching events": _names(hit, ctx)}


def check_not_played_for(p, value, ctx):
    return value not in p["teams"], 0, {}


CONDITIONS = {
    "played_for":     {"label": "Played for team",          "values": "teams",       "check": check_played_for},
    "not_played_for": {"label": "Never played for team",    "values": "teams",       "check": check_not_played_for},
    "country":        {"label": "Is from country",          "values": "countries",   "check": check_country},
    "won":            {"label": "Won international event",  "values": "intl_events", "check": check_won},
    "played_at":      {"label": "Played at event",          "values": "all_events",  "check": check_played_at},
}


# ---------- options for the admin dropdowns ----------

def _player_values(ds):
    events = ds["events"]
    intl = [e for e in events if e["international"]]
    kinds = [{"value": f"kind:{k}", "label": lbl} for k, lbl in KIND_LABELS.items()
             if any(e["kind"] == k for e in intl)]
    by_year = lambda evs: sorted(evs, key=lambda e: (-e["year"], e["name"]))
    return {
        "teams": sorted(({"value": k, "label": v} for k, v in ds["teams"].items()),
                        key=lambda x: x["label"].lower()),
        "countries": [{"value": c, "label": c} for c in
                      sorted({c for p in ds["players"] for c in p["countries"]})],
        "intl_events": [{"value": "any", "label": "any international"}] + kinds +
                       [{"value": e["page"], "label": e["name"]}
                        for e in by_year([e for e in intl if e["finished"]])],
        "all_events": [{"value": "any", "label": "any international"}] + kinds +
                      [{"value": e["page"], "label": e["name"]} for e in by_year(events)],
    }


def options(ds, game=None):
    pv = _player_values(ds)
    pools = [{
        "id": "players", "label": "Pro players (Liquipedia)", "subject": POOL_SUBJECTS["players"],
        "conditions": [{"type": k, "label": v["label"], "values": pv[v["values"]]}
                       for k, v in CONDITIONS.items()],
        "fields": {},
    }]
    for pid, spec in GAME_POOLS.items():
        items = (game or {}).get("pools", {}).get(pid)
        if not items:
            continue
        conds = []
        for field, label in spec["fields"].items():
            vals = sorted({i["attrs"].get(field) for i in items if i["attrs"].get(field)},
                          key=str.lower)
            values = [{"value": v, "label": v} for v in vals]
            conds.append({"type": f"is:{field}", "label": f"{label} is", "values": values})
            conds.append({"type": f"not:{field}", "label": f"{label} is not", "values": values})
        pools.append({"id": pid, "label": spec["label"],
                      "subject": f"{spec['label'].lower()} where…",
                      "conditions": conds, "fields": spec["fields"]})
    return {"pools": pools, "tiers": [{"name": n, "points": POINTS[n]} for n in POINTS]}


# ---------- scoring ----------

def fame(p, ctx, today):
    """PLACEHOLDER obviousness for players (higher = more obvious)."""
    intl = sum(1 for e in p["events"] if ctx["events"].get(e, {}).get("international"))
    score = len(p["events"]) + 2 * intl + 4 * len(p["wins"])
    if p["last_year"] >= today.year - 1:
        score += 3
    if not p["starter"]:
        score -= 2
    return score, intl


def assign_tiers(scored):
    """scored: [(score, item, extra)] -> [(tier, score, item, extra)], most obvious first."""
    scored.sort(key=lambda x: (-x[0], x[1]["id"].lower()))
    n = len(scored)
    bounds, acc = [], 0.0
    for name, _, share in TIERS:
        acc += share
        bounds.append((acc, name))
    # Tied scores share a tier, placed at the middle of the tie (so a pool with no
    # popularity info yet lands in the middle tiers instead of all at the bottom)
    tie_mid = {}
    for rank, (score, _, _) in enumerate(scored):
        lo, hi = tie_mid.get(score, (rank, rank))
        tie_mid[score] = (lo, rank)
    out = []
    for score, p, extra in scored:
        lo, hi = tie_mid[score]
        pct = ((lo + hi) / 2 + 0.5) / n
        tier = next(name for limit, name in bounds if pct <= limit + 1e-9)
        out.append((tier, score, p, extra))
    return out


def context(ds):
    return {"events": {e["page"]: e for e in ds["events"]}, "teams": ds["teams"]}


def _player_matches(prompt, ds, today, ctx):
    conds = [c for c in prompt.get("conditions", []) if c.get("type") in CONDITIONS and c.get("value")]
    if not conds:
        return []
    scored = []
    for p in ds["players"]:
        bonus, extra, ok = 0, {}, True
        for c in conds:
            hit, b, ev = CONDITIONS[c["type"]]["check"](p, c["value"], ctx)
            if not hit:
                ok = False
                break
            bonus += b
            extra.update(ev)
        if ok:
            base, intl = fame(p, ctx, today)
            extra = {"tier1_events": len(p["events"]), "international_events": intl,
                     "international_wins": _names(p["wins"], ctx), **extra}
            item = {"id": p["id"], "aliases": p["aliases"], "icon": None,
                    "source": WIKI + p["page"].replace(" ", "_")}
            scored.append((base + bonus, item, extra))
    return scored


def _game_matches(prompt, game):
    pool = prompt.get("pool")
    items = (game or {}).get("pools", {}).get(pool, [])
    conds = [c for c in prompt.get("conditions", [])
             if c.get("value") and ":" in c.get("type", "")]
    if not conds:
        return []
    # Same name in several places (e.g. "A Main" on many maps) = one answer
    merged = {}
    for it in items:
        ok = True
        for c in conds:
            op, field = c["type"].split(":", 1)
            has = it["attrs"].get(field) == c["value"]
            if (op == "is" and not has) or (op == "not" and has):
                ok = False
                break
        if not ok:
            continue
        key = it["id"].lower()
        if key not in merged:
            merged[key] = {"item": {"id": it["id"], "aliases": list(it["aliases"]),
                                    "icon": it.get("icon"), "source": "valorant-api.com"},
                           "score": it["score"], "attrs": defaultdict(list)}
        m = merged[key]
        m["score"] = max(m["score"], it["score"])
        m["item"]["aliases"] = sorted(set(m["item"]["aliases"]) | set(it["aliases"]))
        for k, v in it["attrs"].items():
            if v not in m["attrs"][k]:
                m["attrs"][k].append(v)
    return [(m["score"], m["item"],
             {k: (v[0] if len(v) == 1 else v) for k, v in m["attrs"].items()})
            for m in merged.values()]


def _drop_ambiguous_aliases(answers):
    """An alias like 'main' or 'reaver' only counts if it points to ONE answer."""
    owners = defaultdict(set)
    for a in answers:
        for al in a["aliases"]:
            owners[al].add(a["id"])
    for a in answers:
        own = a["id"].lower()
        a["aliases"] = sorted(al for al in a["aliases"] if al == own or len(owners[al]) == 1)


def evaluate(prompt, ds, today=None, ctx=None, game=None):
    """All valid answers for one prompt, most obvious first."""
    today = today or date.today()
    if prompt.get("pool", "players") == "players":
        scored = _player_matches(prompt, ds, today, ctx or context(ds))
    else:
        scored = _game_matches(prompt, game)

    overrides = prompt.get("overrides", {})
    answers = []
    for tier, score, it, extra in assign_tiers(scored):
        final = overrides.get(it["id"], tier)
        answers.append({**it, "tier": final, "auto_tier": tier, "points": POINTS[final],
                        "score": score, "evidence": extra})
    _drop_ambiguous_aliases(answers)
    return answers


# ---------- files ----------

def load_prompts():
    if not PROMPTS_FILE.exists():
        return []
    return json.loads(PROMPTS_FILE.read_text(encoding="utf-8"))


def save_prompts(prompts):
    PROMPTS_FILE.write_text(json.dumps(prompts, indent=2, ensure_ascii=False), encoding="utf-8")


def publish(prompts, ds, today=None, game=None):
    """Write every enabled prompt's answer bank to dive.json."""
    today = today or date.today()
    ctx = context(ds)
    built = []
    for pr in prompts:
        if not pr.get("enabled", True):
            continue
        answers = evaluate(pr, ds, today, ctx, game)
        for a in answers:
            a.pop("auto_tier", None)
        built.append({"id": pr["id"], "text": pr["text"], "pool": pr.get("pool", "players"),
                      "answers": answers})
    out = {
        "generated": today.isoformat(),
        "data_generated": ds.get("generated"),
        "game_version": (game or {}).get("game_version"),
        "attribution": "Pro-scene data from Liquipedia (liquipedia.net), licensed CC BY-SA 3.0. "
                       "Game data from valorant-api.com.",
        "tier1_definition": "Appeared on a roster at a VCT international event or a "
                            f"franchised VCT league event ({config.FIRST_LEAGUE_YEAR}+).",
        "prompts": built,
    }
    path = Path(config.OUTPUT_FILE)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    return path, built
