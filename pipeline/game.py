"""Game-content answer pools from valorant-api.com -> pipeline/data/game.json.

Pools: agents, abilities, weapons, skins, maps, callouts. Every item looks like
    {"id": "Reaver Vandal", "aliases": [...], "icon": url, "attrs": {...}, "score": n}
`attrs` are what questions can filter on (weapon, collection, map, role...).

`score` is a PLACEHOLDER for how obvious an answer is (higher = more obvious).
There is no real popularity data yet; Richard will tune with admin overrides
until real rarity data replaces it.
"""
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import config

GAME_FILE = Path(config.GAME_FILE)
_FAM_FILE = Path(__file__).parent / "familiarity.json"
_FAM = json.loads(_FAM_FILE.read_text(encoding="utf-8")) if _FAM_FILE.exists() else {}
COMMUNITY_CALLOUTS = _FAM.get("callout_aliases", {})
# ability name -> effects ("damage", "flash", ...), hand-tagged in familiarity.json
ABILITY_EFFECTS = {}
for _effect, _names in _FAM.get("ability_tags", {}).items():
    if not _effect.startswith("_"):
        for _n in _names:
            ABILITY_EFFECTS.setdefault(_n.lower(), []).append(_effect)

# The 11 agents from VALORANT's June 2020 launch: the most familiar names
LAUNCH_AGENTS = {"Brimstone", "Breach", "Cypher", "Jett", "Omen", "Phoenix",
                 "Raze", "Reyna", "Sage", "Sova", "Viper"}
LAUNCH_MAPS = {"Bind", "Haven", "Split", "Ascent"}
SLOT_LABELS = {"Ability1": "Q", "Ability2": "E", "Grenade": "C",
               "Ultimate": "Ultimate (X)", "Passive": "Passive"}
CATEGORY_LABELS = {"Sidearm": "Sidearm", "SMG": "SMG", "Shotgun": "Shotgun",
                   "Rifle": "Rifle", "Sniper": "Sniper", "Heavy": "Machine gun",
                   "Melee": "Melee"}
# How much each gun gets used (placeholder): skins on popular guns are better known.
# Only matters for questions that span several weapons ("Name a Reaver skin").
WEAPON_POPULARITY = {"Vandal": 4, "Phantom": 4, "Operator": 3, "Melee": 3, "Sheriff": 2,
                     "Spectre": 2, "Classic": 1, "Ghost": 1, "Guardian": 1, "Marshal": 1,
                     "Outlaw": 1, "Judge": 1, "Odin": 1}
# Callout words that show up on most maps, so they're the obvious answers
GENERIC_CALLOUTS = {"Main", "Site", "Lobby", "Spawn", "Link", "Long", "Short",
                    "Top", "Bottom", "Mid", "Window", "Garden", "Back"}


def clean(s):
    return re.sub(r"\s+", " ", (s or "")).strip()


def fold(s):
    """'KAY/O' -> 'kayo', 'XERØFANG' -> 'xerofang', '.SYS' -> 'sys'."""
    s = s.lower().replace("ø", "o").replace("æ", "ae").replace("œ", "oe")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", "", s)).strip()


def aliases(*names):
    out = set()
    for n in names:
        n = clean(n)
        if not n:
            continue
        out.add(n.lower())
        f = fold(n)
        if f:
            out.add(f)
            out.add(f.replace(" ", ""))
    return sorted(a for a in out if a)


def item(name, attrs, score, icon=None, extra_aliases=()):
    return {"id": name, "aliases": aliases(name, *extra_aliases), "icon": icon,
            "attrs": attrs, "score": score}


def build_agents(raw):
    agents, abilities = [], []
    for a in raw["agents"]:
        name = clean(a["displayName"])
        role = a["role"]["displayName"] if a.get("role") else "Unknown"
        launch = name in LAUNCH_AGENTS
        agents.append(item(name, {"role": role}, 3 * launch + (1 if a.get("isBaseContent") else 0),
                           a.get("displayIcon")))
        for ab in a.get("abilities", []):
            ab_name = clean(ab.get("displayName"))
            if not ab_name:
                continue
            slot = SLOT_LABELS.get(ab.get("slot"), ab.get("slot") or "Other")
            score = 2 * launch + (1 if slot.startswith("Ultimate") else 0)
            effects = ABILITY_EFFECTS.get(ab_name.lower(), [])
            abilities.append(item(ab_name, {"agent": name, "role": role, "slot": slot,
                                            "effects": effects or ["other"]},
                                  score, ab.get("displayIcon")))
    return agents, abilities


def contract_skins(raw):
    """skin level uuid -> how you get it, for skins that come from contracts."""
    kinds = {"Season": "Battle pass", "Agent": "Agent contract", "Event": "Event pass"}
    out = {}
    for c in raw.get("contracts") or []:
        content = c.get("content") or {}
        kind = kinds.get(content.get("relationType"), "Battle pass")
        for ch in content.get("chapters") or []:
            for r in [lv.get("reward") for lv in ch.get("levels") or []] + (ch.get("freeRewards") or []):
                if r and r.get("type") == "EquippableSkinLevel":
                    out[r.get("uuid")] = kind
    return out


def build_weapons(raw):
    themes = {t["uuid"]: clean(t["displayName"]) for t in raw["themes"]}
    from_contract = contract_skins(raw)
    tiers = {t["uuid"]: (t.get("devName") or t["displayName"].replace(" Edition", ""), t.get("rank", 0))
             for t in raw["contenttiers"]}
    weapons, skins = [], []
    collection_size = Counter()
    for w in raw["weapons"]:
        for s in w["skins"]:
            if s.get("contentTierUuid"):
                collection_size[themes.get(s.get("themeUuid"), "")] += 1

    for w in raw["weapons"]:
        wname = clean(w["displayName"])
        cat = CATEGORY_LABELS.get(w["category"].split("::")[-1], w["category"].split("::")[-1])
        cost = (w.get("shopData") or {}).get("cost", 0)
        weapons.append(item(wname, {"category": cat}, cost // 500, w.get("displayIcon")))
        for s in w["skins"]:
            tier_id = s.get("contentTierUuid")
            if not tier_id:  # "Standard Vandal", "Random Favorite Skin", default melee
                continue
            name = clean(s["displayName"])
            tier, rank = tiers.get(tier_id, ("Unknown", 0))
            collection = themes.get(s.get("themeUuid"), "")
            short = clean(name[: -len(wname)]) if name.lower().endswith(" " + wname.lower()) else ""
            icon = s.get("displayIcon") or next(
                (c.get("fullRender") for c in s.get("chromas", []) if c.get("fullRender")), None)
            # Placeholder: pricier editions, more upgrade levels/colors and bigger
            # collections are usually the better-known skins
            score = round(3 * rank + len(s.get("levels") or []) + len(s.get("chromas") or []) / 2
                          + min(collection_size[collection], 12) / 4
                          + 2 * WEAPON_POPULARITY.get(wname, 0), 2)
            obtained = next((from_contract[lv.get("uuid")] for lv in s.get("levels") or []
                             if lv.get("uuid") in from_contract), "Store (VP)")
            skins.append(item(name, {"weapon": wname, "category": cat, "edition": tier,
                                     "collection": collection, "obtained": obtained},
                              score, icon, extra_aliases=[short, collection, wname if wname != "Melee" else ""]))
            # Aliases like "reaver" or "vandal" only count when they point to one
            # answer in a question; prompts.py drops them when they're ambiguous.
    return weapons, skins


def map_type(m):
    url = m.get("mapUrl") or ""
    if m.get("tacticalDescription"):
        return "Standard"
    if "/HURM/" in url:
        return "Team Deathmatch"
    if "/Duel/" in url:
        return "Skirmish"
    return "Other"


def build_maps(raw):
    maps, seen = [], set()
    callouts = []
    for m in raw["maps"]:
        name = clean(m["displayName"])
        mtype = map_type(m)
        if name not in seen:
            seen.add(name)
            score = (2 if mtype == "Standard" else 0) + (2 if name in LAUNCH_MAPS else 0)
            maps.append(item(name, {"type": mtype}, score, m.get("displayIcon")))
        names_here = set()
        for c in m.get("callouts") or []:
            region, area = clean(c.get("regionName")), clean(c.get("superRegionName"))
            if not region:
                continue
            extra = [f"{area} {region}", region]
            if area in ("Attacker Side", "Defender Side"):
                side = area.split()[0]
                cname = f"{side} {region}"
                if region == "Spawn":
                    extra += ["T Spawn" if side == "Attacker" else "CT Spawn",
                              f"{side}s Spawn"]
            else:
                cname = f"{area} {region}"
                if region == "Site":
                    extra += [area, f"Site {area}"]
                elif len(area) == 1:
                    extra.append(f"{region} {area}")  # "Main A"
            extra += COMMUNITY_CALLOUTS.get(name, {}).get(cname, [])  # "Hookah", "Heaven"...
            if cname in names_here:
                continue
            names_here.add(cname)
            callouts.append({"id": cname, "aliases": aliases(cname, *extra), "icon": None,
                             "attrs": {"map": name, "map_type": mtype, "area": area,
                                       "spot": region},
                             "score": 0})
    # Placeholder obviousness: callouts that exist on many standard maps
    # ("A Main", "B Site") are the obvious ones; one-off names ("Pizza") are rare.
    on_maps = Counter(c["id"] for c in callouts if c["attrs"]["map_type"] == "Standard")
    for c in callouts:
        c["score"] = on_maps[c["id"]] + (3 if c["attrs"]["spot"] in GENERIC_CALLOUTS else 0)
    return maps, callouts


def build_game(api):
    raw = api.all()
    agents, abilities = build_agents(raw)
    weapons, skins = build_weapons(raw)
    maps, callouts = build_maps(raw)
    game = {
        "game_version": raw["version"].get("version"),
        "source": "valorant-api.com",
        "pools": {"agents": agents, "abilities": abilities, "weapons": weapons,
                  "skins": skins, "maps": maps, "callouts": callouts},
    }
    GAME_FILE.parent.mkdir(parents=True, exist_ok=True)
    GAME_FILE.write_text(json.dumps(game, indent=1, ensure_ascii=False), encoding="utf-8")
    counts = ", ".join(f"{len(v)} {k}" for k, v in game["pools"].items())
    print(f"  game data {game['game_version']}: {counts}")
    return game


def load_game():
    if not GAME_FILE.exists():
        return None
    return json.loads(GAME_FILE.read_text(encoding="utf-8"))
