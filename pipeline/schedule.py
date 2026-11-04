"""Which 7 questions appear on which day.

pipeline/schedule.json holds one entry per day:
    {"days": {"2026-11-05": {"prompts": ["vct_igl", ...], "pinned": false}, ...}}

Rules:
- Days before today are history: never changed (that's how we know what was used when).
- Today never changes once it has a set: people may be mid-dive.
- Future days are planned automatically, PLAN_DAYS ahead, every time the answers are
  published (build.py, "Publish to game", the nightly GitHub run).
- A day you pick by hand in the admin page is "pinned": the planner keeps it, only
  swapping out questions that were turned off or deleted.
- Auto days use the least recently used questions, never one used in the last
  few days, with 3–4 pro-scene questions and the rest game content.

The game reads the schedule from dive.json. Days without one fall back to a
random pick in the browser, so the game never breaks if nobody publishes for a while.
"""
import json
import random
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

PIPELINE_DIR = Path(__file__).parent
SCHEDULE_FILE = PIPELINE_DIR / "schedule.json"
PER_DAY = 7
PLAN_DAYS = 30           # how far ahead to plan
MAX_NO_REPEAT = 21       # ideally a question doesn't come back within this many days
PRO_POOLS = {"players", "teams"}
MAX_SAME_POOL = 2        # at most 2 skin (or callout, ...) questions per day


def eastern_today():
    """Today's date in US Eastern time, when a new dive starts (same as the game)."""
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("America/New_York")).date()
    except Exception:  # Windows without the tzdata package: close enough
        return (datetime.now(timezone.utc) - timedelta(hours=5)).date()


def load_schedule():
    if not SCHEDULE_FILE.exists():
        return {"days": {}}
    data = json.loads(SCHEDULE_FILE.read_text(encoding="utf-8"))
    data.setdefault("days", {})
    return data


def save_schedule(data):
    data["days"] = dict(sorted(data["days"].items()))
    SCHEDULE_FILE.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def _is_pro(prompt):
    return prompt.get("pool", "players") in PRO_POOLS


def _day(d):
    return d.isoformat()


def plan(prompts, data, today=None):
    """Fill in / repair every day from today to PLAN_DAYS ahead. Returns the schedule."""
    today = today or eastern_today()
    enabled = [p for p in prompts if p.get("enabled", True)]
    by_id = {p["id"]: p for p in enabled}
    days = data["days"]
    # With few questions a long no-repeat gap is impossible; shrink it to what fits
    no_repeat = max(1, min(MAX_NO_REPEAT, len(enabled) // PER_DAY - 1))

    for offset in range(PLAN_DAYS):
        d = today + timedelta(days=offset)
        key = _day(d)
        entry = days.get(key)
        if offset == 0 and entry and entry.get("prompts"):
            continue  # today is live: leave it alone
        keep = [i for i in (entry or {}).get("prompts", []) if i in by_id]
        pinned = bool(entry and entry.get("pinned"))
        if not pinned and entry and len(keep) == len(entry.get("prompts", [])) == PER_DAY:
            continue  # an auto day that's still valid: keep it stable
        days[key] = {"prompts": _fill(keep, d, enabled, days, no_repeat), "pinned": pinned}
    return data


def _fill(keep, d, enabled, days, no_repeat):
    """Top a day up to PER_DAY questions: balanced, least recently used, no near repeats."""
    chosen = list(keep)
    used_near = set()   # questions on days within no_repeat of this one (before or after)
    last_used = {}      # question -> most recent other day it appears on
    for key, entry in days.items():
        other = date.fromisoformat(key)
        if other == d:
            continue
        for i in entry.get("prompts", []):
            if abs((other - d).days) <= no_repeat:
                used_near.add(i)
            if other < d:
                last_used[i] = max(last_used.get(i, other), other)
    rng = random.Random(f"krilljoy:{_day(d)}")
    # Never used first, then the longest ago; a seeded shuffle breaks ties
    pool = [p for p in enabled if p["id"] not in chosen]
    rng.shuffle(pool)
    pool.sort(key=lambda p: (p["id"] in used_near, last_used.get(p["id"], date.min)))
    want_pro = rng.choice([3, 4])
    for p in pool:
        if len(chosen) >= PER_DAY:
            break
        n_pro = sum(_is_pro(x) for x in enabled if x["id"] in chosen)
        n_game = len(chosen) - n_pro
        if _is_pro(p) and n_pro >= want_pro:
            continue
        if not _is_pro(p) and n_game >= PER_DAY - want_pro:
            continue
        same_kind = sum(x.get("pool", "players") == p.get("pool", "players") for x in enabled if x["id"] in chosen)
        if not _is_pro(p) and same_kind >= MAX_SAME_POOL:
            continue  # e.g. not three skin questions on one day
        chosen.append(p["id"])
    for p in pool:  # one side ran out: fill with whatever is left
        if len(chosen) >= PER_DAY:
            break
        if p["id"] not in chosen:
            chosen.append(p["id"])
    return chosen


def usage(data, today=None):
    """Per question: when it was last shown, when it's next planned, how many times shown."""
    today = today or eastern_today()
    out = {}
    for key, entry in sorted(data["days"].items()):
        d = date.fromisoformat(key)
        for i in entry.get("prompts", []):
            u = out.setdefault(i, {"last": None, "next": None, "times": 0})
            if d <= today:
                u["last"] = key
                u["times"] += 1
            elif u["next"] is None:
                u["next"] = key
    return out


def for_game(data, today=None):
    """The part of the schedule the game needs: yesterday onward (time zones differ a little)."""
    today = today or eastern_today()
    start = _day(today - timedelta(days=1))
    return {k: v["prompts"] for k, v in sorted(data["days"].items()) if k >= start}


def set_day(prompts, data, key, ids, today=None):
    """Hand-pick a future day. ids=None unpins it (back to automatic)."""
    today = today or eastern_today()
    if date.fromisoformat(key) <= today:
        raise ValueError("Today and past days can't be changed.")
    valid = {p["id"] for p in prompts if p.get("enabled", True)}
    if ids is None:
        data["days"].pop(key, None)
    else:
        ids = [i for i in dict.fromkeys(ids) if i in valid][:PER_DAY]
        data["days"][key] = {"prompts": ids, "pinned": True}
    return plan(prompts, data, today)
