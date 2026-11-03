# Krilljoy: project brief for Claude Code

The game is called **Krilljoy** (renamed from Vallion, Nov 2026). The repo and
folder are still `vallion`; internal names (browser storage keys, share text,
seed) use `krilljoy`.

A Valorant version of the "rare answer" daily trivia game Krillion. Players get
open-ended prompts and score more for valid answers that fewer people would
think of. Prompts cover both the pro scene ("Name a tier 1 player who has played
for Sentinels") and the game itself ("Name a Sheriff skin", "Name an agent with
a flash"). Every answer is backed by a data source, never invented.

## Answer pools

Every question draws its answers from one pool. The admin page picks the pool
first, then shows conditions that make sense for it.

| Pool id | What | Source | Status |
|---|---|---|---|
| `players` | Tier 1 pro players | Liquipedia API (`pipeline/data.py`) | done |
| `teams` | Teams on tier 1 rosters (`team_info` in players.json) | Liquipedia API | done |
| `agents`, `abilities`, `weapons`, `skins`, `maps`, `callouts` | Game content | valorant-api.com (`pipeline/valorant_api.py` + `pipeline/game.py`) | done |
| `list` | Anything no source covers (e.g. content creators) | typed into the admin page, one per line, most obvious first; rating = list order | done |
| more Liquipedia | Coaches, casters, agent picks per event, transfers | Liquipedia API | idea |

- Game data is saved to `pipeline/data/game.json`. Each item has `id` (display
  name), `aliases`, `icon`, `attrs` (what questions filter on) and `score`.
- Game-pool conditions are `is:<attr>` / `not:<attr>`; filters per pool are listed
  in `GAME_POOLS` in `prompts.py`.
- Aliases that point to more than one answer within a question (e.g. "main" on a
  map with A Main and B Main) are dropped automatically.
- Player extras: `captain` = events where Liquipedia marks them Captain (IGL;
  only on 2025+ `{{TeamParticipants}}` rosters). `mvps` = events where the
  rendered prize pool's award table names them MVP (2022+, internationals and
  league finals; `MVP_FROM_LEAGUES` in config.py).
- Team name variants (Gen.G / Gen.G Esports) are merged by `team_key_map`.
- Ability `effects` (damage, flash, smoke, wall, heal, info) are hand tagged in
  `ability_tags` in familiarity.json; untagged = "other". Add new agents' abilities there.
- Skin `obtained`: "Battle pass" / "Agent contract" / "Event pass" from the
  `contracts` endpoint, otherwise "Store (VP)".
- Skipped on purpose: "Standard" and "Random Favorite" skins, duplicate maps.
- VLR.gg is NOT a source: its terms ban scraping and republishing. Stats would
  need written permission (community@vlr.gg).

Game-content `score` is a placeholder (skin edition + collection size, launch
agents/maps, how many maps share a callout name). Richard will tune tiers with
admin overrides until real rarity data exists.

Richard (repo owner) is a Mechanical Engineering grad, comfortable with code but
not a web developer by trade. He works on Windows in VS Code with PowerShell.
Explain steps plainly, give exact commands, and say what to expect when he runs
them. He makes the design and gameplay decisions; ask when a choice is his.

This repo follows the same shape as his earlier project
(github.com/richardwweng/ers-online): `client/` React + TypeScript + Vite on
Cloudflare Pages, `server/` Node + TypeScript + Socket.IO on Render (only when
multiplayer needs it), plain-language README, small focused files.

## Repo layout

```
vallion/
├── pipeline/   Python: pulls Liquipedia data, builds answer banks, admin page
├── client/     the game website, React + TS + Vite (daily mode)
├── server/     (later) real-time multiplayer server, Node + Socket.IO
└── docs/       README images
```

## Pipeline (done, working)

```powershell
pip install -r pipeline/requirements.txt
python pipeline/build.py           # fetch Liquipedia data (cached) + rebuild answers
python pipeline/build.py --offline # rebuild answers from saved data, no network
python pipeline/admin.py           # question editor at http://localhost:8765
```

- `local_settings.py` (git-ignored) holds the Liquipedia User-Agent with
  Richard's contact. Never commit it or put contact info anywhere else.
- `pipeline/data/players.json`: every tier 1 player with teams, events, wins,
  countries. Committed.
- `pipeline/prompts.json`: the questions. Edited through the admin page.
- `client/public/data/dive.json`: answer banks the game reads. Written by
  "Publish to game" in the admin page or by `build.py`. Committed and deployed.
- `pipeline/cache/`: raw API responses. Git-ignored. Deleting it means the next
  build takes about 10–15 minutes again.

How the data is sourced (confirmed against the live wiki, Nov 2026):
- Tier 1 stays 2023+ leagues + internationals; 2021–22 regional leagues are
  NOT tier 1 (Richard, Nov 2026).
- Tier 1 = on a roster at a VCT international (Masters, Champions, LOCK//IN)
  or a franchised VCT league event (2023+).
- Rosters come from tournament pages. Up to 2024 they use `{{TeamCard}}`;
  from 2025 they use `{{TeamParticipants}}` with `{{Opponent}}`/`{{Person}}`.
  Teams marked `import=true` don't list players in wikicode, so those pages are
  read from the rendered HTML (`.team-participant-card`, Main/Subs/Staff tabs).
  Team pages' former rosters are auto-generated (`{{FormerSquadAuto}}`) and not
  in wikicode, so they're not used.
- International events come from `Template:VCT Masters Navbox` and
  `Template:VCT Champions Navbox`.
- Countries come from `{{Infobox player}}` `country=`.
- Winners come from the rendered prize pool (`action=parse`), first-place row.

Adding a new kind of question condition = one check function plus one entry in
`CONDITIONS` in `pipeline/prompts.py`; it appears in the admin dropdown.

### Liquipedia rules (non-negotiable)

From https://liquipedia.net/api-terms-of-use:
- Max 1 request per 2 seconds; `action=parse` max 1 per 30 seconds.
- Custom User-Agent with contact info; gzip.
- Cache everything and never re-request the same data. The game website must
  never call Liquipedia; it only reads `dive.json`.
- Credit Liquipedia (CC BY-SA 3.0) visibly in the game.
- All Liquipedia access goes through `pipeline/liquipedia.py`, which enforces this.

VLR.gg has no official API. If stat-based prompts are added later, use a
self-hosted scraper with heavy caching and low request rates.

## Scoring (same points as Krillion, Valorant rank names)

Decided by Richard (Nov 2026). Players see the rank names; the code keys
(`plankton`, `schooler`, ...) stay as they are in `prompts.py` and `dive.json`.

| Code key | Shown as | Points | Meaning |
|---|---|---|---|
| `plankton` | Silver | 10 | The answer everyone blurts out |
| `too_clever` | Gold | 15 | The predictable "obscure" pick (set by hand) |
| `schooler` | Platinum | 30 | Common, but not the first thought |
| `rare` | Diamond | 60 | Most people won't think of it |
| `deep_cut` | Immortal | 85 | Real knowledge |
| `one_in_a_krillion` | Radiant | 100 | The best answer, very few find it |
| (wrong / no answer) | not named yet | 0 | |

Richard may rename these later, so keep the display names in one place (one
map in the client, one in `admin.html`).

How rarity works (Richard chose this, Nov 2026; it mirrors Krillion, which
pre-computes rarity from familiarity data + model judgment + manual review,
NOT from live player answers):

- Every answer has a fame rating, 1-10. `pipeline/familiarity.json` holds
  Claude's hand estimates (notable players, agents, abilities, weapons, skin
  collections, maps, callout spots). Unlisted items fall back to formulas in
  `prompts.py` (players: stats; skins: edition).
- Each step up is ~2x as likely to be named. Within a question, estimated share
  of fans = 2**rating / sum over valid answers. Question context adjusts
  ratings (e.g. share of a player's career spent on the team asked about).
- Recency applies to EVERYTHING (Richard, Nov 2026): newer = more remembered.
  Players: `recency_bonus()` (wins this year +4 Champions / +2 Masters, halving
  each year; active this year +0.8; 3+ years away fades) and `recency_floor()`
  (this year's Champions winners rated at least 7.5, Masters 6). Team questions:
  `TEAM_RECENCY` favors the current roster. Game content: `GAME_RECENCY` from
  `release_year` in familiarity.json (+1.5 this year, +0.8 last year, +0.3 two
  years ago). Base ratings in familiarity.json are age-independent. A skin
  collection Claude doesn't know is treated as released this year. When new
  content ships, add its release year.
- Estimated share sets the ORDER of answers. Tier SIZES lean slightly to the
  common/middle tiers (Richard, Nov 2026): Silver 22%, Platinum 30%, Diamond
  28%, Immortal 20% of the non-Radiant answers. Radiant = the single rarest
  answer (Krillion's designated "One in a Krillion"). Boundaries don't split
  answers with equal ratings unless that would shift a boundary by >6%.
  Gold (Too Clever) is manual. Admin overrides win.
- Every question needs at least 20 valid answers (`MIN_ANSWERS` in
  prompts.py); the admin page flags ones below that. A game-pool question
  with no condition means the whole pool ("Name any agent").
- Richard does not want to estimate anything by hand. When new content appears
  (new players, skins, agents, maps), Claude should update familiarity.json.
- Later: blend in real player answer frequencies once the game is live, and
  auto-detect Too Clever (estimated rare, actually common).

Copy the mechanics, not Krillion's branding or assets.

## Client (daily mode) notes

- `src/game/daily.ts`: `LAUNCH_DATE` = Dive #1 (change at public launch).
  `pickDaily` seeds by Eastern date, picks 3–4 pro-scene + 3–4 game prompts.
  Adding/removing prompts changes future picks; a started dive keeps its prompts.
- `src/game/match.ts`: exact match on id/aliases (normalized: lowercase,
  accents folded, non-alphanumerics removed), then typo tolerance (1 typo for
  5+ letters, 2 for 9+, none below 5). A name that is a valid answer to ANY
  other prompt is rejected outright; ties between two answers are rejected.
- `src/game/storage.ts`: localStorage, per date. `roundStartedAt` is saved so
  reloading doesn't reset the 25 s clock. Time out = submit whatever is typed.
- `src/components/Ocean.tsx`: one 500vh strip (sky top 12%), slid up by depth;
  the home screen's two rows line up with the 60vh horizon (`.home` in index.css).
- Answers are all in dive.json (like Krillion): fine for daily mode; the
  multiplayer modes need a server that holds the answers.

## Roadmap

1. **Daily mode** (`client/`, built Nov 2026, not deployed yet): same as Krillion today.
   - Look: the "Pixel blend" style (Richard, Nov 2026): retro pixel ocean
     that darkens with depth, Valorant red (#ff4655) + navy, notched LOCK IN
     buttons, pixel gems in rank colors, Silkscreen + VT323 fonts, depth gauge
     on the right. All sprites are original; never use Krillion's art.
     Desktop layout mirrors Krillion's: home masthead, HUD (depth / round
     squares / score), centered question card, reveal card + DESCEND, results
     log with an expandable answer list per question.
   - 7 prompts per day, same for everyone, new set at midnight Eastern.
   - 25 seconds per prompt, one answer each.
   - Matching: case-insensitive against `aliases`, forgiving small typos
     (fuzzy match), never accept a different real player.
   - Each point = 10 m of depth; a perfect 700-point dive = 7,000 m.
   - No treasure chest in daily mode (Richard, Nov 2026): a perfect dive is
     basically unreachable. The depth gauge just ends at 7,000 m. The chest is
     only for the treasure dive / multiplayer mode.
   - Results screen: tier per answer, the Liquipedia evidence (`evidence`,
     `source`), and a shareable emoji summary.
   - Progress saved locally so closing the tab mid-dive resumes it.
   - Pick the day's prompts deterministically from `dive.json` (seeded by date).
2. **More answer pools:** game content is done (see "Answer pools"). Still to
   build: hand-written answer lists, more Liquipedia data.
3. **Treasure dive mode:** (the only mode with the chest) prompts back to back, each answer sinks you by its
   rarity, reach the chest at a fixed depth. Score = time to the chest. Wrong
   answers sink 0 (or add a time penalty) so spamming doesn't pay.
4. **Async multiplayer:** same seeded prompt order for everyone, shared
   leaderboard of finish times. Needs a small backend.
5. **Live races (maybe):** `server/` with Socket.IO, players see each other's
   depth. The server is the referee and holds the answers, like ERS, so
   answers can't be read from the browser.

## Conventions

- Plain-language comments and README, like ERS.
- Keep the game rules separate from UI and networking code.
- Phones matter: test small screens, tap targets, iPhone Safari viewport.
- Before saying something works, run it.
