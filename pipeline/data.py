"""Step 1: pull tier 1 events and players from Liquipedia into out/players.json.

Everything here is cached by liquipedia.py, so after the first run this is fast.
"""
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import config
from extract import (
    league_info, navbox_event_links, norm, player_info, prize_pool_winner, team_cards,
    team_participants, team_participants_html,
)

DATASET_FILE = Path(config.DATASET_FILE)


def league_candidates(today):
    pages = []
    for year in range(config.FIRST_LEAGUE_YEAR, today.year + 1):
        for region in config.LEAGUE_REGIONS:
            for stage in config.LEAGUE_STAGES:
                base = f"VCT/{year}/{region}_League"
                pages.append(f"{base}/{stage}" if stage else base)
    return pages


def collect_events(lp, today):
    navboxes = lp.wikitext(config.INTERNATIONAL_NAVBOXES)
    intl = [t for text in navboxes.values() for t in navbox_event_links(text)]
    intl = list(dict.fromkeys(intl + config.EXTRA_INTERNATIONAL))
    domestic = league_candidates(today) + config.EXTRA_TIER1_EVENTS

    texts = lp.wikitext(intl + domestic)
    events = []
    for title in dict.fromkeys(intl + domestic):
        text = texts.get(title)
        if not text:
            continue
        info = league_info(text) or {}
        if info.get("start_date") and info["start_date"] > today:
            continue  # hasn't started yet
        cards = team_cards(text)  # pages up to 2024 use {{TeamCard}}
        if not cards:
            # 2025+ pages use {{TeamParticipants}}; teams marked import=true only
            # appear on the rendered page (action=parse, 30 s each, cached)
            cards, needs_html = team_participants(text)
            if needs_html:
                cards = team_participants_html(lp.html(title))
        cards = [c for c in cards if c["players"]]
        if not cards:
            print(f"  ! no rosters found on {title}")
            continue
        year = int(re.search(r"/(\d{4})/", title)[1])
        last = title.rsplit("/", 1)[-1].lower()  # 2021 Masters live under "VALORANT Champions Tour/..."
        kind = ("masters" if last == "masters" else
                "champions" if last == "champions" else
                "lockin" if "lock" in last else "league")
        name = info.get("name") or title
        if title in intl and kind == "champions":
            name = f"Champions {year}"  # some infoboxes just say "VCT 2021"
        elif title in intl and kind == "lockin":
            name = f"LOCK//IN {year}"
        events.append({
            "page": title,
            "name": name,
            "kind": kind if title in intl else "league",
            "international": title in intl,
            "finished": bool(info.get("end_date") and info["end_date"] < today),
            "year": year,
            "cards": cards,
        })
    return events


def find_winners(lp, events):
    for ev in events:
        ev["winner"] = None
        if not (ev["international"] and ev["finished"]):
            continue
        winner = config.WINNER_OVERRIDES.get(ev["page"]) or prize_pool_winner(lp.html(ev["page"]))
        ev["winner"] = winner
        if not winner:
            print(f"  ! no winner found for {ev['page']} (add it to WINNER_OVERRIDES)")
        elif not any(norm(c["team"]) == norm(winner) for c in ev["cards"]):
            print(f"  ! winner '{winner}' of {ev['page']} doesn't match a TeamCard team name")


def build_players(lp, events):
    raw = defaultdict(lambda: {"ids": set(), "events": set(), "wins": set(),
                               "teams": defaultdict(set), "last_year": 0, "starter": False})
    team_names = defaultdict(Counter)
    for ev in events:
        for card in ev["cards"]:
            tkey = norm(card["team"])
            team_names[tkey][card["team"]] += 1
            won = bool(ev["winner"]) and tkey == norm(ev["winner"])
            for pl in card["players"]:
                p = raw[pl["page"]]
                p["ids"].add(pl["id"])
                p["events"].add(ev["page"])
                p["teams"][tkey].add(ev["page"])
                p["last_year"] = max(p["last_year"], ev["year"])
                p["starter"] |= not pl["sub"]
                if won:
                    p["wins"].add(ev["page"])

    print(f"Fetching {len(raw)} player pages...")
    pages = lp.wikitext(list(raw), with_titles=True)

    merged = {}
    for page, p in raw.items():
        final, text = pages.get(page, (page, None))
        info = player_info(text) or {"id": "", "countries": [], "alt_ids": []}
        m = merged.setdefault(norm(final), {
            "page": final,
            "id": info["id"] or re.sub(r"\s*\(.*\)$", "", final),
            "countries": info["countries"],
            "ids": set(info["alt_ids"]),
            "events": set(), "wins": set(), "teams": defaultdict(set),
            "last_year": 0, "starter": False, "has_page": text is not None,
        })
        m["ids"] |= p["ids"]
        m["events"] |= p["events"]
        m["wins"] |= p["wins"]
        for team, evs in p["teams"].items():
            m["teams"][team] |= evs
        m["last_year"] = max(m["last_year"], p["last_year"])
        m["starter"] |= p["starter"]

    players = []
    for m in merged.values():
        aliases = {m["id"], *m["ids"], re.sub(r"\s*\(.*\)$", "", m["page"])}
        players.append({
            "page": m["page"],
            "id": m["id"],
            "aliases": sorted({a.lower() for a in aliases if a}),
            "countries": m["countries"],
            "events": sorted(m["events"]),
            "wins": sorted(m["wins"]),
            "teams": {t: sorted(e) for t, e in m["teams"].items()},
            "last_year": m["last_year"],
            "starter": m["starter"],
            "has_page": m["has_page"],
        })
    teams = {k: c.most_common(1)[0][0] for k, c in team_names.items()}
    return players, teams


def build_dataset(lp, today):
    print("Collecting events...")
    events = collect_events(lp, today)
    print(f"  {len(events)} tier 1 events ({sum(e['international'] for e in events)} international)")
    print("Finding international winners (slow on first run: 30 s per event)...")
    find_winners(lp, events)
    players, teams = build_players(lp, events)
    print(f"  {len(players)} tier 1 players")

    no_page = [p["page"] for p in players if not p["has_page"]]
    if no_page:
        print(f"  note: {len(no_page)} players have no Liquipedia page (country unknown): "
              f"{', '.join(no_page[:10])}{'...' if len(no_page) > 10 else ''}")

    dataset = {
        "generated": today.isoformat(),
        "events": [{k: ev[k] for k in ("page", "name", "kind", "international", "finished",
                                       "year", "winner")} for ev in events],
        "teams": teams,
        "players": players,
    }
    DATASET_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATASET_FILE.write_text(json.dumps(dataset, indent=1, ensure_ascii=False), encoding="utf-8")
    return dataset


def load_dataset():
    if not DATASET_FILE.exists():
        raise SystemExit(f"{DATASET_FILE} not found. Run `python pipeline/build.py` once first.")
    return json.loads(DATASET_FILE.read_text(encoding="utf-8"))
