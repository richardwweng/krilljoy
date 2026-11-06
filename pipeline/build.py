"""Build the game's answer banks.

    python pipeline/build.py             # refresh data (cached) + rebuild answers
    python pipeline/build.py --offline   # rebuild answers from saved data only, no network
    python pipeline/build.py --fresh     # ignore the cache and re-download everything

Data comes from two places:
  Liquipedia        pro players, teams, events       -> pipeline/data/players.json
  valorant-api.com  agents, skins, maps, callouts... -> pipeline/data/game.json

Questions live in prompts.json; edit them with `python pipeline/admin.py`.
"""
import argparse
from datetime import date

import config
import prompts as P
from data import build_dataset, load_dataset
from game import build_game, load_game, write_agents


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fresh", action="store_true", help="re-download everything")
    ap.add_argument("--offline", action="store_true", help="skip downloads, use saved data")
    args = ap.parse_args()
    today = date.today()
    max_age = 0 if args.fresh else config.CACHE_MAX_AGE_DAYS

    if args.offline:
        ds, game = load_dataset(), load_game()
    else:
        from liquipedia import Liquipedia
        lp = Liquipedia(config.USER_AGENT, config.CACHE_DIR, max_age_days=max_age)
        ds = build_dataset(lp, today)
        print(f"  ({lp.network_requests} Liquipedia requests this run)")

        print("Game content from valorant-api.com...")
        try:
            from valorant_api import ValorantAPI
            game = build_game(ValorantAPI(config.USER_AGENT, config.CACHE_DIR, max_age_days=max_age))
        except Exception as e:  # keep going with the last saved copy
            print(f"  ! couldn't refresh game data ({type(e).__name__}: {e}); using saved copy")
            game = load_game()

    write_agents(game)
    path, built = P.publish(P.load_prompts(), ds, today, game)
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
