"""Build the game's answer banks.

    python pipeline/build.py             # refresh Liquipedia data (cached) + rebuild answers
    python pipeline/build.py --offline   # rebuild answers from pipeline/data/players.json only, no network
    python pipeline/build.py --fresh     # ignore the cache and re-download everything

Questions live in prompts.json; edit them with `python pipeline/admin.py`.
"""
import argparse
from datetime import date

import config
import prompts as P
from data import build_dataset, load_dataset


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fresh", action="store_true", help="re-download everything")
    ap.add_argument("--offline", action="store_true", help="skip Liquipedia, use saved data")
    args = ap.parse_args()
    today = date.today()

    if args.offline:
        ds = load_dataset()
    else:
        from liquipedia import Liquipedia
        lp = Liquipedia(config.USER_AGENT, config.CACHE_DIR,
                        max_age_days=0 if args.fresh else config.CACHE_MAX_AGE_DAYS)
        ds = build_dataset(lp, today)
        print(f"  ({lp.network_requests} network requests this run)")

    path, built = P.publish(P.load_prompts(), ds, today)
    print()
    for pr in built:
        a = pr["answers"]
        counts = {t: sum(x["tier"] == t for x in a) for t in P.POINTS}
        print(f"{pr['text']}: {len(a)} answers")
        print("   most obvious:", ", ".join(x["id"] for x in a[:6]))
        print("   deepest cuts:", ", ".join(x["id"] for x in a[-6:]))
        print("   tiers:", {k: v for k, v in counts.items() if v})
    print(f"\nWrote {path}")


if __name__ == "__main__":
    main()
