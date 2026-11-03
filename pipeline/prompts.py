"""Step 2: turn the questions in prompts.json into answer banks (dive.json).

A question is a sentence, an answer POOL, and a list of conditions. An item
from the pool is a valid answer when it matches ALL conditions.

Pools:
  players                   pro players from Liquipedia (data.py)
  agents, abilities, weapons,
  skins, maps, callouts     game content from valorant-api.com (game.py)

How rare an answer is: every answer has a fame rating (1-10, mostly from
familiarity.json). Within a question, an answer's estimated share of fans is
2**rating / sum of 2**rating over all valid answers, and tiers come from that
share (TIER_THRESHOLDS), not from fixed proportions.

Adding a condition for players = one check function + one entry in CONDITIONS.
Adding a filter for a game pool = one attribute in game.py + one line in GAME_POOLS.
"""
import json
import math
from collections import defaultdict
from datetime import date
from pathlib import Path

import config

PROMPTS_FILE = Path(__file__).parent / "prompts.json"
FAMILIARITY_FILE = Path(__file__).parent / "familiarity.json"
WIKI = "https://liquipedia.net/valorant/"

# (code key, points, minimum estimated share of fans), most to least obvious.
# Shown to players as Silver, Platinum, Diamond, Immortal, Radiant (Gold = too_clever).
# Like Krillion's "One in a Krillion", Radiant is ONE answer per question: the
# rarest valid answer. Everything else obscure is Immortal (Krillion's Deep Cut).
TIERS = [
    ("plankton", 10, 0.10),            # Silver:   10%+ of fans would say it
    ("schooler", 30, 0.03),            # Platinum: 3-10%
    ("rare", 60, 0.01),                # Diamond:  1-3%
    ("deep_cut", 85, 0.0),             # Immortal: under 1%
    ("one_in_a_krillion", 100, None),  # Radiant:  the single rarest answer
]
POINTS = {name: pts for name, pts, _ in TIERS} | {"too_clever": 15}


def _load_familiarity():
    if not FAMILIARITY_FILE.exists():
        return {}
    data = json.loads(FAMILIARITY_FILE.read_text(encoding="utf-8"))
    return {k: ({kk: vv for kk, vv in v.items() if not kk.startswith("_")} if isinstance(v, dict) else v)
            for k, v in data.items() if not k.startswith("_")}


FAM = _load_familiarity()
EDITION_RANK = {"Select": 0, "Deluxe": 1, "Premium": 2, "Exclusive": 3, "Ultra": 4}
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
# Each check returns (matches, rating_change, evidence) for one player.
# rating_change adjusts fame for THIS question (e.g. TenZ is "a Sentinels player"
# far more than someone who spent one split there).

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
    share_of_career = len(evs) / max(len(p["events"]), 1)
    change = math.log2(0.3 + 0.7 * share_of_career) if evs else 0
    return bool(evs), change, {f"{ctx['teams'].get(value, value)} events": _names(evs, ctx)}


def check_country(p, value, ctx):
    return value in p["countries"], 0, {"countries": p["countries"]}


def check_won(p, value, ctx):
    won = _event_set(value, ctx, p["wins"])
    return bool(won), 0.4 * max(len(won) - 1, 0), {}


def check_played_at(p, value, ctx):
    if value == "any" or value.startswith("kind:"):
        pool = [e for e in p["events"] if ctx["events"].get(e, {}).get("international")]
    else:
        pool = p["events"]
    hit = _event_set(value, ctx, pool)
    return bool(hit), 0, {"matching events": _names(hit, ctx)}


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


# ---------- fame ratings ----------

def fame(p, ctx, today):
    """Stat-based score for players nobody hand-rated (higher = more obvious)."""
    intl = sum(1 for e in p["events"] if ctx["events"].get(e, {}).get("international"))
    score = len(p["events"]) + 2 * intl + 4 * len(p["wins"])
    if p["last_year"] >= today.year - 1:
        score += 3
    if not p["starter"]:
        score -= 2
    return score, intl


def player_rating(p, stat_score):
    """1-10. Hand ratings from familiarity.json win; others come from stats (1-5)."""
    hand = FAM.get("players", {})
    for key in (p["id"].lower(), p["page"].lower()):
        if key in hand:
            return float(hand[key])
    return 1 + 4 * min(max(stat_score, 0), 60) / 60


def game_rating(it, pool):
    """1-10 fame for a game-content item, from familiarity.json (+ fallbacks)."""
    a, name = it["attrs"], it["id"]
    if pool == "agents":
        return FAM.get("agents", {}).get(name, 3)
    if pool == "abilities":
        r = FAM.get("agents", {}).get(a.get("agent"), 3) + FAM.get("ability_bonus", {}).get(name, 0)
        if a.get("slot", "").startswith("Ultimate"):
            r += 0.5
        if a.get("slot") == "Passive":
            r -= 2
        return r
    if pool == "weapons":
        return FAM.get("weapons", {}).get(name, 3)
    if pool == "skins":
        coll = FAM.get("collections", {}).get(a.get("collection"))
        if coll is None:  # not rated: guess from the edition
            coll = 1.5 + 0.5 * EDITION_RANK.get(a.get("edition"), 0)
        return coll + FAM.get("weapon_skin_bonus", {}).get(a.get("weapon"), 0) + 0.01 * it.get("score", 0)
    if pool == "maps":
        return FAM.get("maps", {}).get(name, 2)
    if pool == "callouts":
        spot = FAM.get("callout_spots", {}).get(a.get("spot"), 2)
        return spot + 0.4 * (FAM.get("maps", {}).get(a.get("map"), 5) - 5) + 0.01 * it.get("score", 0)
    return it.get("score", 0)


# ---------- tiers ----------

def assign_tiers(scored):
    """scored: [(rating, item, extra)] -> [(tier, rating, share, item, extra)], most obvious first.

    share = how many fans we estimate would give this answer (2**rating, normalized).
    The rarest answer is Radiant; the rest get Silver/Platinum/Diamond/Immortal by
    TIERS thresholds. With 5+ answers every tier is used: if one comes out empty,
    the nearest answer next to it moves in. With fewer, answers are spread out.
    """
    scored.sort(key=lambda x: (-x[0], x[1]["id"].lower()))
    n = len(scored)
    if not n:
        return []
    top = max(r for r, _, _ in scored)
    weights = [2 ** (r - top) for r, _, _ in scored]
    total = sum(weights)
    shares = [w / total for w in weights]
    names = [name for name, _, _ in TIERS]
    k = len(TIERS)

    if n < k:  # too few answers for every tier: spread from Silver to Radiant
        tiers = [names[round(i * (k - 1) / max(n - 1, 1))] for i in range(n)] if n > 1 else [names[0]]
    else:
        counts = [0] * (k - 1)
        for sh in shares[:-1]:
            counts[next(i for i, (_, _, low) in enumerate(TIERS[:-1]) if sh >= low)] += 1
        while 0 in counts:
            empty = counts.index(0)
            donor = min((abs(j - empty), j) for j, c in enumerate(counts) if c >= 2)[1]
            counts[donor] -= 1
            counts[empty] += 1
        tiers = [names[i] for i, c in enumerate(counts) for _ in range(c)] + [names[-1]]
    return [(t, r, sh, it, ex) for t, sh, (r, it, ex) in zip(tiers, shares, scored)]


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
            stat_score, intl = fame(p, ctx, today)
            extra = {"tier1_events": len(p["events"]), "international_events": intl,
                     "international_wins": _names(p["wins"], ctx), **extra}
            item = {"id": p["id"], "aliases": p["aliases"], "icon": None,
                    "source": WIKI + p["page"].replace(" ", "_")}
            scored.append((player_rating(p, stat_score) + bonus, item, extra))
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
        rating = game_rating(it, pool)
        if key not in merged:
            merged[key] = {"item": {"id": it["id"], "aliases": list(it["aliases"]),
                                    "icon": it.get("icon"), "source": "valorant-api.com"},
                           "score": rating, "attrs": defaultdict(list)}
        m = merged[key]
        m["score"] = max(m["score"], rating)
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
    for tier, rating, share, it, extra in assign_tiers(scored):
        final = overrides.get(it["id"], tier)
        answers.append({**it, "tier": final, "auto_tier": tier, "points": POINTS[final],
                        "score": round(rating, 2), "share": round(100 * share, 2),
                        "evidence": extra})
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
