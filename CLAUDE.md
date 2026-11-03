# Vallion: project brief for Claude Code

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
| `agents`, `abilities`, `weapons`, `skins`, `maps`, `callouts` | Game content | valorant-api.com (`pipeline/valorant_api.py` + `pipeline/game.py`) | done |
| hand-written list | Anything no source covers | typed into the admin page | to build |
| more Liquipedia | Coaches, casters, agent picks per event, transfers | Liquipedia API | idea |

- Game data is saved to `pipeline/data/game.json`. Each item has `id` (display
  name), `aliases`, `icon`, `attrs` (what questions filter on) and `score`.
- Game-pool conditions are `is:<attr>` / `not:<attr>`; filters per pool are listed
  in `GAME_POOLS` in `prompts.py`.
- Aliases that point to more than one answer within a question (e.g. "main" on a
  map with A Main and B Main) are dropped automatically.
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
├── client/     (to build) the game website, React + TS + Vite
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

Tiers are assigned by a fame score (see `fame()` in `pipeline/prompts.py`):
most obvious 15% Silver, next 20% Platinum, 30% Diamond, 25% Immortal, last
10% Radiant. Admin-page overrides win. Richard wants Claude to work out real
common-vs-rare rankings later (for players and game content); until then the
fame score is a placeholder.

Copy the mechanics, not Krillion's branding or assets.

## Roadmap

1. **Daily mode** (`client/`, next): same as Krillion today.
   - 7 prompts per day, same for everyone, new set at midnight Eastern.
   - 25 seconds per prompt, one answer each.
   - Matching: case-insensitive against `aliases`, forgiving small typos
     (fuzzy match), never accept a different real player.
   - Each point = 10 m of depth; a perfect 700-point dive = 7,000 m.
   - Results screen: tier per answer, the Liquipedia evidence (`evidence`,
     `source`), and a shareable emoji summary.
   - Progress saved locally so closing the tab mid-dive resumes it.
   - Pick the day's prompts deterministically from `dive.json` (seeded by date).
2. **More answer pools:** game content is done (see "Answer pools"). Still to
   build: hand-written answer lists, more Liquipedia data.
3. **Treasure dive mode:** prompts back to back, each answer sinks you by its
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
