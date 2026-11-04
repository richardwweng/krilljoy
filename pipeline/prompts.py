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
import re
from collections import defaultdict
from datetime import date
from pathlib import Path

import config

PROMPTS_FILE = Path(__file__).parent / "prompts.json"
FAMILIARITY_FILE = Path(__file__).parent / "familiarity.json"
WIKI = "https://liquipedia.net/valorant/"

# (code key, points, target share of a question's answers), most to least obvious.
# Shown to players as Silver, Platinum, Diamond, Immortal, Radiant (Gold = too_clever).
# Answers are ORDERED by estimated fame (familiarity.json); tier sizes lean slightly
# toward the common/middle tiers (Richard's call, Nov 2026). Like Krillion's
# "One in a Krillion", Radiant is ONE answer per question: the rarest valid one.
TIERS = [
    ("plankton", 10, 0.22),            # Silver
    ("schooler", 30, 0.30),            # Platinum
    ("rare", 60, 0.28),                # Diamond
    ("deep_cut", 85, 0.20),            # Immortal
    ("one_in_a_krillion", 100, None),  # Radiant: the single rarest answer
]
MIN_ANSWERS = 12  # questions with fewer valid answers are flagged in the admin page
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
                  "fields": {"effects": "Effect", "agent": "Agent", "role": "Agent role",
                             "slot": "Ability key"}},
    "weapons":   {"label": "Weapons", "fields": {"category": "Weapon type"}},
    "skins":     {"label": "Weapon skins",
                  "fields": {"weapon": "Weapon", "category": "Weapon type",
                             "edition": "Edition", "collection": "Collection",
                             "obtained": "How you get it"}},
    "maps":      {"label": "Maps", "fields": {"type": "Map type"}},
    "callouts":  {"label": "Map callouts",
                  "fields": {"map": "Map", "map_type": "Map type", "area": "Area"}},
}
POOL_SUBJECTS = {"players": "tier 1 players who…", "teams": "teams that…",
                 "list": "the answers you list below"}


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


# How recently a player was on the team asked about (years ago -> rating change):
# today's roster is what people remember.
TEAM_RECENCY = {0: 1.2, 1: 0.6, 2: 0.0, 3: -0.3}


def check_played_for(p, value, ctx):
    evs = p["teams"].get(value, [])
    share_of_career = len(evs) / max(len(p["events"]), 1)
    change = math.log2(0.3 + 0.7 * share_of_career) if evs else 0
    if evs:
        last = max(ctx["events"][e]["year"] for e in evs if e in ctx["events"])
        change += TEAM_RECENCY.get(ctx["today"].year - last, -0.6)
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


REGIONS = ["Americas", "EMEA", "Pacific", "China"]
KNOWN_IGLS = {r: set(pages) for r, pages in FAM.get("known_igls", {}).items()}  # pre-2026 IGLs, by hand
KNOWN_IGL_PAGES = set().union(*KNOWN_IGLS.values()) if KNOWN_IGLS else set()


def event_region(page):
    """'VCT/2026/Pacific_League/Stage_1' -> 'Pacific'; internationals -> None"""
    m = re.search(r"/(Americas|EMEA|Pacific|China)_League", page)
    return m[1] if m else None


def team_regions(ds):
    """Which league(s) each team plays in, from the league events its players were at."""
    out = defaultdict(set)
    for p in ds["players"]:
        for team, evs in p["teams"].items():
            out[team].update(r for r in map(event_region, evs) if r)
    return out


def igl_regions(p, ctx):
    """Regions a player was IGL in: Captain at a league event, Captain at an international
    for a team from that league, or on the hand list of earlier IGLs."""
    regs = set()
    for e in p.get("captain", []):
        r = event_region(e)
        if r:
            regs.add(r)
        else:
            for team, evs in p["teams"].items():
                if e in evs:
                    regs |= ctx["team_region"].get(team, set())
    regs |= {r for r, pages in KNOWN_IGLS.items() if p["page"] in pages}
    return regs


def check_captain_at(p, value, ctx):
    """Liquipedia marks the in-game leader as Captain on 2026 rosters (not earlier)."""
    # 'any' = any VCT event, leagues included, plus the hand list of earlier IGLs
    hit = _event_set(value, ctx, p.get("captain", []))
    known = value == "any" and p["page"] in KNOWN_IGL_PAGES
    return bool(hit) or known, 0, {"IGL at": _names(hit, ctx) or ["(earlier years)"]}


def check_igl_region(p, value, ctx):
    return value in igl_regions(p, ctx), 0, {"IGL in": f"VCT {value}"}


def check_played_region(p, value, ctx):
    evs = [e for e in p["events"] if event_region(e) == value]
    return bool(evs), 0.3 * min(len(evs), 6) / 6, {f"VCT {value} events": _names(evs, ctx)}


def check_mvp(p, value, ctx):
    # 'any' = any VCT event, league finals included
    hit = _event_set(value, ctx, p.get("mvps", []))
    return bool(hit), 0.5 * max(len(hit) - 1, 0), {"MVP at": _names(hit, ctx)}


# Teams pool: each check gets a team from team_info
def team_played_at(t, value, ctx):
    pool = t["events"]
    if value == "any" or value.startswith("kind:"):
        pool = [e for e in pool if ctx["events"].get(e, {}).get("international")]
    hit = _event_set(value, ctx, pool)
    return bool(hit), 0, {"matching events": _names(hit, ctx)}


def team_won(t, value, ctx):
    won = _event_set(value, ctx, t["wins"])
    return bool(won), 0.4 * max(len(won) - 1, 0), {}


TEAM_CONDITIONS = {
    "played_at": {"label": "Played at event", "values": "all_events", "check": team_played_at},
    "won":       {"label": "Won international event", "values": "intl_events", "check": team_won},
}


CONDITIONS = {
    "played_for":     {"label": "Played for team",          "values": "teams",       "check": check_played_for},
    "not_played_for": {"label": "Never played for team",    "values": "teams",       "check": check_not_played_for},
    "country":        {"label": "Is from country",          "values": "countries",   "check": check_country},
    "won":            {"label": "Won international event",  "values": "intl_events", "check": check_won},
    "played_at":      {"label": "Played at event",          "values": "all_events",  "check": check_played_at},
    "captain_at":     {"label": "Was IGL at event (2025+)", "values": "captain_events", "check": check_captain_at},
    "mvp":            {"label": "Was finals MVP (2022+)",   "values": "mvp_events",  "check": check_mvp},
    "igl_region":     {"label": "Was IGL in league",        "values": "regions",     "check": check_igl_region},
    "played_region":  {"label": "Played in league",         "values": "regions",     "check": check_played_region},
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
        "captain_events": [{"value": "any", "label": "any VCT event"}] + kinds +
                          [{"value": e["page"], "label": e["name"]}
                           for e in by_year([e for e in events if e["year"] >= 2025])],
        "regions": [{"value": r, "label": f"VCT {r}"} for r in REGIONS],
        "mvp_events": [{"value": "any", "label": "any VCT event"}] + kinds +
                      [{"value": e["page"], "label": e["name"]}
                       for e in by_year([e for e in events if e.get("mvp")])],
    }


def options(ds, game=None):
    pv = _player_values(ds)
    pools = [{
        "id": "players", "label": "Pro players (Liquipedia)", "subject": POOL_SUBJECTS["players"],
        "conditions": [{"type": k, "label": v["label"], "values": pv[v["values"]]}
                       for k, v in CONDITIONS.items()],
        "fields": {},
    }, {
        "id": "teams", "label": "Teams (Liquipedia)", "subject": POOL_SUBJECTS["teams"],
        "conditions": [{"type": k, "label": v["label"], "values": pv[v["values"]]}
                       for k, v in TEAM_CONDITIONS.items()],
        "fields": {},
    }]
    for pid, spec in GAME_POOLS.items():
        items = (game or {}).get("pools", {}).get(pid)
        if not items:
            continue
        conds = []
        for field, label in spec["fields"].items():
            vals = set()
            for i in items:
                v = i["attrs"].get(field)
                vals.update(v if isinstance(v, list) else [v] if v else [])
            vals = sorted(vals, key=str.lower)
            values = [{"value": v, "label": v} for v in vals]
            conds.append({"type": f"is:{field}", "label": f"{label} is", "values": values})
            conds.append({"type": f"not:{field}", "label": f"{label} is not", "values": values})
        pools.append({"id": pid, "label": spec["label"],
                      "subject": f"{spec['label'].lower()} where…",
                      "conditions": conds, "fields": spec["fields"]})
    pools.append({"id": "list", "label": "Hand-written list", "subject": POOL_SUBJECTS["list"],
                  "conditions": [], "fields": {}})
    return {"pools": pools, "tiers": [{"name": n, "points": POINTS[n]} for n in POINTS]}


# ---------- fame ratings ----------

def fame(p, ctx, today):
    """Stat-based score for players nobody hand-rated (higher = more obvious)."""
    intl = sum(1 for e in p["events"] if ctx["events"].get(e, {}).get("international"))
    score = len(p["events"]) + 2 * intl + 4 * len(p["wins"])
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


# Recency (Richard, Nov 2026): fresh winners are on everyone's mind, long-gone
# players fade a little. Added to every player's rating, hand-rated or not.
RECENT_WIN = {"champions": 4.0, "masters": 2.0, "lockin": 1.5}   # this year's win
WIN_DECAY = {0: 1.0, 1: 0.5, 2: 0.2}                             # by years ago
ACTIVE = {0: 0.8, 1: 0.3, 2: 0.0, 3: -0.4}                       # last played, years ago


# A fresh winner is famous right now however little career data they have:
# their rating can't drop below this floor. (kind, years ago) -> minimum rating
WIN_FLOOR = {("champions", 0): 7.5, ("champions", 1): 6.0,
             ("masters", 0): 6.0, ("masters", 1): 5.0, ("lockin", 0): 6.0}


def recency_floor(p, ctx, today):
    floor = 0.0
    for page in p["wins"]:
        e = ctx["events"].get(page)
        if e:
            floor = max(floor, WIN_FLOOR.get((e["kind"], today.year - e["year"]), 0.0))
    return floor


def recency_bonus(p, ctx, today):
    years_away = today.year - p["last_year"]
    bonus = ACTIVE.get(years_away, -0.8)
    wins = 0.0
    for page in p["wins"]:
        e = ctx["events"].get(page)
        if e:
            wins += RECENT_WIN.get(e["kind"], 1.0) * WIN_DECAY.get(today.year - e["year"], 0)
    return bonus + min(wins, 4.5)


# Recency for game content: released N years ago -> rating boost (newer = more remembered)
GAME_RECENCY = {0: 1.5, 1: 0.8, 2: 0.3}


def release_year(it, pool):
    """Best known release year of a game item, or None."""
    ry, a = FAM.get("release_year", {}), it["attrs"]
    agents, maps = ry.get("agents", {}), ry.get("maps", {})
    if pool in ("agents", "abilities"):
        return agents.get(a.get("agent", it["id"]))
    if pool in ("maps", "callouts"):
        return maps.get(a.get("map", it["id"]))
    if pool == "weapons":
        w = ry.get("weapons", {})
        return w.get(it["id"], w.get("_default"))
    if pool == "skins":
        coll, years = a.get("collection", ""), ry.get("collections", {})
        if coll in years:
            return years[coll]
        if coll.startswith("VCT x "):
            return years.get("_vct_team_bundles")
        if coll in agents:  # agent-themed sets came out with the agent
            return agents[coll]
        if coll and coll not in FAM.get("collections", {}):
            return date.today().year  # unknown to Claude = released after its knowledge
    return None


def game_rating(it, pool):
    """1-10 fame for a game-content item (familiarity.json) plus a recency boost."""
    year = release_year(it, pool)
    boost = GAME_RECENCY.get(date.today().year - year, 0) if year else 0
    return _base_game_rating(it, pool) + boost


def _base_game_rating(it, pool):
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

def _snap(cut, ratings, lo, hi, max_shift):
    """Move a tier boundary so answers rated the same aren't split, if it's a small move.

    A big group of equal ratings (e.g. 80 forgettable skins) gets split instead,
    since there's no information to tell them apart anyway."""
    if cut <= lo or cut >= hi or abs(ratings[cut - 1] - ratings[cut]) > 1e-9:
        return cut
    start = cut
    while start > lo and abs(ratings[start - 1] - ratings[cut]) <= 1e-9:
        start -= 1
    end = cut
    while end < hi and abs(ratings[end] - ratings[cut - 1]) <= 1e-9:
        end += 1
    options = [c for c in (start, end) if lo < c < hi and abs(c - cut) <= max_shift]
    return min(options, key=lambda c: abs(c - cut)) if options else cut


def assign_tiers(scored):
    """scored: [(rating, item, extra)] -> [(tier, rating, share, item, extra)], most obvious first.

    share = estimated share of fans who'd give the answer (2**rating, normalized);
    it sets the ORDER. The rarest answer is Radiant; the rest are cut into
    Silver/Platinum/Diamond/Immortal by the TIERS target sizes, every tier used.
    """
    scored.sort(key=lambda x: (-x[0], x[1]["id"].lower()))
    n = len(scored)
    if not n:
        return []
    ratings = [r for r, _, _ in scored]
    top = max(ratings)
    weights = [2 ** (r - top) for r in ratings]
    total = sum(weights)
    shares = [w / total for w in weights]
    names = [name for name, _, _ in TIERS]
    k = len(TIERS)

    if n < k:  # too few answers for every tier: spread from Silver to Radiant
        tiers = [names[round(i * (k - 1) / max(n - 1, 1))] for i in range(n)] if n > 1 else [names[0]]
    else:
        m = n - 1  # everyone but the Radiant gem
        cuts, acc = [], 0.0
        for _, _, part in TIERS[:-2]:
            acc += part
            cuts.append(round(acc * m))
        # every tier at least one answer, then avoid splitting equal ratings
        fixed, prev = [], 0
        for i, c in enumerate(cuts):
            c = max(prev + 1, min(c, m - (len(cuts) - i)))
            c = _snap(c, ratings, prev, m - (len(cuts) - i) + 1, max(1, round(0.06 * m)))
            fixed.append(c)
            prev = c
        bounds = [0] + fixed + [m]
        tiers = [names[i] for i in range(k - 1) for _ in range(bounds[i + 1] - bounds[i])] + [names[-1]]
    return [(t, r, sh, it, ex) for t, sh, (r, it, ex) in zip(tiers, shares, scored)]


def context(ds, today=None):
    return {"events": {e["page"]: e for e in ds["events"]}, "teams": ds["teams"],
            "team_region": team_regions(ds), "today": today or date.today()}


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
            rating = max(player_rating(p, stat_score) + recency_bonus(p, ctx, today),
                         recency_floor(p, ctx, today))
            scored.append((rating + bonus, item, extra))
    return scored


def _game_matches(prompt, game):
    pool = prompt.get("pool")
    items = (game or {}).get("pools", {}).get(pool, [])
    conds = [c for c in prompt.get("conditions", [])
             if c.get("value") and ":" in c.get("type", "")]
    # no condition = every item in the pool ("Name any agent")
    # Same name in several places (e.g. "A Main" on many maps) = one answer
    merged = {}
    for it in items:
        ok = True
        for c in conds:
            op, field = c["type"].split(":", 1)
            v = it["attrs"].get(field)
            has = c["value"] in v if isinstance(v, list) else v == c["value"]
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


def team_rating(t, ctx, today):
    """Fame for a team: familiarity.json rating (or stats), plus recency like players."""
    hand = {k.lower(): v for k, v in FAM.get("teams", {}).items()}
    intl = sum(1 for e in t["events"] if ctx["events"].get(e, {}).get("international"))
    base = hand.get(t["name"].lower())
    if base is None:
        base = 1 + 4 * min(len(t["events"]) + 2 * intl + 4 * len(t["wins"]), 40) / 40
    return max(base + recency_bonus(t, ctx, today), recency_floor(t, ctx, today)), intl


TEAM_ALIASES = FAM.get("team_aliases", {})  # tags like "prx", from familiarity.json


def team_aliases(t):
    """'Team Heretics' -> also 'heretics'; 'G2 Esports' -> 'g2'; plus tags like 'prx' from familiarity.json."""
    name = t["name"]
    out = {name.lower(), t["key"]}
    short = re.sub(r"^(team)\s+|\s+(esports club|esports|gaming|club)$", "", name, flags=re.I).strip()
    if short and short.lower() != name.lower():
        out.add(short.lower())
    out.update(a.lower() for a in TEAM_ALIASES.get(name, []))
    return sorted(out)


def _team_matches(prompt, ds, today, ctx):
    conds = [c for c in prompt.get("conditions", []) if c.get("type") in TEAM_CONDITIONS and c.get("value")]
    if not conds:
        return []
    scored = []
    for t in ds.get("team_info", []):
        bonus, extra, ok = 0, {}, True
        for c in conds:
            hit, b, ev = TEAM_CONDITIONS[c["type"]]["check"](t, c["value"], ctx)
            if not hit:
                ok = False
                break
            bonus += b
            extra.update(ev)
        if ok:
            rating, intl = team_rating(t, ctx, today)
            extra = {"international_events": intl, "international_wins": _names(t["wins"], ctx), **extra}
            item = {"id": t["name"], "aliases": team_aliases(t), "icon": None,
                    "source": WIKI + t["name"].replace(" ", "_")}
            scored.append((rating + bonus, item, extra))
    return scored


def _list_matches(prompt):
    """Hand-written answers, most obvious first. Each line may add '| other spelling'."""
    items = [a for a in prompt.get("answers", []) if a.get("text", "").strip()]
    n = len(items)
    scored = []
    for i, a in enumerate(items):
        text = a["text"].strip()
        rating = a.get("rating", 9 - 7 * i / max(n - 1, 1))  # list order = obviousness
        aliases = {text.lower(), *[x.strip().lower() for x in a.get("aliases", []) if x.strip()]}
        scored.append((rating, {"id": text, "aliases": sorted(aliases), "icon": None, "source": ""},
                       {"listed": f"#{i + 1} of {n}"}))
    return scored


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
    pool = prompt.get("pool", "players")
    if pool == "players":
        scored = _player_matches(prompt, ds, today, ctx or context(ds, today))
    elif pool == "teams":
        scored = _team_matches(prompt, ds, today, ctx or context(ds, today))
    elif pool == "list":
        scored = _list_matches(prompt)
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
    """Write every enabled prompt's answer bank to dive.json, plus the day-by-day schedule."""
    import schedule as S
    today = today or date.today()
    ctx = context(ds, today)
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
    # Plan the next weeks of daily sets and send them with the answers
    plan = S.plan(prompts, S.load_schedule())
    S.save_schedule(plan)
    out["schedule"] = S.for_game(plan)
    path = Path(config.OUTPUT_FILE)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    return path, built
