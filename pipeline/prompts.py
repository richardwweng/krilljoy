"""Step 2: turn the questions in prompts.json into answer banks (out/dive.json).

A question is a sentence plus a list of conditions. A player is a valid answer
when they match ALL conditions. Adding a new kind of condition = one entry in
CONDITIONS below.
"""
import json
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


# ---------- conditions ----------
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
    "played_for":     {"label": "Played for team",          "values": "teams",      "check": check_played_for},
    "not_played_for": {"label": "Never played for team",    "values": "teams",      "check": check_not_played_for},
    "country":        {"label": "Is from country",          "values": "countries",  "check": check_country},
    "won":            {"label": "Won international event",  "values": "intl_events", "check": check_won},
    "played_at":      {"label": "Played at event",          "values": "all_events", "check": check_played_at},
}


# ---------- options for the admin dropdowns ----------

def options(ds):
    events = ds["events"]
    intl = [e for e in events if e["international"]]
    kinds = [{"value": f"kind:{k}", "label": lbl} for k, lbl in KIND_LABELS.items()
             if any(e["kind"] == k for e in intl)]
    by_year = lambda evs: sorted(evs, key=lambda e: (-e["year"], e["name"]))
    return {
        "conditions": [{"type": k, "label": v["label"]} for k, v in CONDITIONS.items()],
        "values": {
            "teams": sorted(({"value": k, "label": v} for k, v in ds["teams"].items()),
                            key=lambda x: x["label"].lower()),
            "countries": [{"value": c, "label": c} for c in
                          sorted({c for p in ds["players"] for c in p["countries"]})],
            "intl_events": [{"value": "any", "label": "any international"}] + kinds +
                           [{"value": e["page"], "label": e["name"]}
                            for e in by_year([e for e in intl if e["finished"]])],
            "all_events": [{"value": "any", "label": "any international"}] + kinds +
                          [{"value": e["page"], "label": e["name"]} for e in by_year(events)],
        },
        "tiers": [{"name": n, "points": POINTS[n]} for n in POINTS],
    }


# ---------- scoring ----------

def fame(p, ctx, today):
    intl = sum(1 for e in p["events"] if ctx["events"].get(e, {}).get("international"))
    score = len(p["events"]) + 2 * intl + 4 * len(p["wins"])
    if p["last_year"] >= today.year - 1:
        score += 3
    if not p["starter"]:
        score -= 2
    return score, intl


def assign_tiers(scored):
    """scored: [(score, player, extra)] -> [(tier, score, player, extra)], most obvious first."""
    scored.sort(key=lambda x: (-x[0], x[1]["id"].lower()))
    n = len(scored)
    bounds, acc = [], 0.0
    for name, _, share in TIERS:
        acc += share
        bounds.append((acc, name))
    out, first_rank = [], {}
    for rank, (score, p, extra) in enumerate(scored):
        r = first_rank.setdefault(score, rank)  # ties share a tier
        pct = (r + 0.5) / n
        tier = next(name for limit, name in bounds if pct <= limit + 1e-9)
        out.append((tier, score, p, extra))
    return out


def context(ds):
    return {"events": {e["page"]: e for e in ds["events"]}, "teams": ds["teams"]}


def evaluate(prompt, ds, today=None, ctx=None):
    """All valid answers for one prompt, most obvious first."""
    today = today or date.today()
    ctx = ctx or context(ds)
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
            scored.append((base + bonus, p, extra))

    overrides = prompt.get("overrides", {})
    answers = []
    for tier, score, p, extra in assign_tiers(scored):
        final = overrides.get(p["id"], tier)
        answers.append({
            "id": p["id"],
            "aliases": p["aliases"],
            "tier": final,
            "auto_tier": tier,
            "points": POINTS[final],
            "score": score,
            "source": WIKI + p["page"].replace(" ", "_"),
            "evidence": extra,
        })
    return answers


# ---------- files ----------

def load_prompts():
    if not PROMPTS_FILE.exists():
        return []
    return json.loads(PROMPTS_FILE.read_text(encoding="utf-8"))


def save_prompts(prompts):
    PROMPTS_FILE.write_text(json.dumps(prompts, indent=2, ensure_ascii=False), encoding="utf-8")


def publish(prompts, ds, today=None):
    """Write every enabled prompt's answer bank to out/dive.json."""
    today = today or date.today()
    ctx = context(ds)
    built = []
    for pr in prompts:
        if not pr.get("enabled", True):
            continue
        answers = evaluate(pr, ds, today, ctx)
        for a in answers:
            a.pop("auto_tier", None)
        built.append({"id": pr["id"], "text": pr["text"], "answers": answers})
    out = {
        "generated": today.isoformat(),
        "data_generated": ds.get("generated"),
        "attribution": "Data from Liquipedia (liquipedia.net), licensed CC BY-SA 3.0.",
        "tier1_definition": "Appeared on a roster at a VCT international event or a "
                            f"franchised VCT league event ({config.FIRST_LEAGUE_YEAR}+).",
        "prompts": built,
    }
    path = Path(config.OUTPUT_FILE)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    return path, built
