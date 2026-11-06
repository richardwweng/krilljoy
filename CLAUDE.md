# Krilljoy: project brief for Claude Code

The game is called **Krilljoy** (renamed from Vallion, Nov 2026). Repo:
`richardwweng/krilljoy`; Richard's local folder: `C:\Users\richa\Documents\krilljoy`.
Internal names (browser storage keys, share text, seed) use `krilljoy`.

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
- Short names players type: `team_aliases` (prx, fnc, navi…) and `agent_aliases`
  (kj, brim…) in familiarity.json. Team names also get "Team"/"Esports"/"Gaming"
  dropped automatically (`team_aliases()` in prompts.py). Skins already accept
  the name without the gun ("Reaver" for Reaver Vandal) when that's unambiguous.
- Ability `effects` (damage, flash, smoke, wall, heal, info, movement, slow,
  concuss, trap) are hand tagged in `ability_tags` in familiarity.json from the
  in-game descriptions; untagged = "other". Add new agents' abilities there.
- Ability `slot` (Q/E/C/Ultimate (X)/Passive) comes from valorant-api, whose Q/E/C
  labels DON'T always match the real keys (it lists Phoenix's Curveball as E).
  Ultimate and Passive are reliable; don't write "signature/E" questions from it.
- Weapon `cost` = price bands ("Under 1,000 credits", "1,000+", "2,000+", "3,000+";
  a gun gets every band it fits) and `wall_penetration` (Low/Medium/High; only 6
  High guns). Skin `upgrades` = what its levels unlock (Finisher, Kill banner,
  VFX…); kill banners are nearly all battle-pass Classics.
- Skin `obtained`: "Battle pass" / "Agent contract" / "Event pass" from the
  `contracts` endpoint, otherwise "Store (VP)".
- Skipped on purpose: "Standard" and "Random Favorite" skins, duplicate maps.
- Skin `colors`: plain colors of a skin's variants (chromas after the default),
  from names like "(Variant 2 Pink)"; synonyms (Bubblegum -> Pink, Scarlet -> Red)
  in `COLOR_WORDS` in game.py; non-color names (Kumo, Raze, Pacific) are ignored.
- Prize money (Nov 2026): every finished event's rendered prize pool is parsed
  (`prize_pool_placements`, same cached page as winners/MVPs, no extra requests)
  into `events[].prizes`. Team `earnings` = exact sum of its tier 1 prizes. Player
  `earnings` = ESTIMATE: each prize split evenly between the card's starters
  (questions say "est."). Prize-pool team names are matched to roster names by key,
  else the closest-named team at that event. `TEAM_SAME_AS` in config.py merges
  one team listed under two names ("NS RedForce" = "Nongshim RedForce").
- Name conditions: `name_has` (a letter, or "digit") and `name_starts` on the
  player's display name (accents folded); teams have `name_has` too. Two pros can
  share a name (two "Klaus"), so avoid questions where that collides.
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
krilljoy/
├── pipeline/   Python: pulls Liquipedia data, builds answer banks, admin page
├── client/     the game website, React + TS + Vite (daily mode + /race)
├── server/     treasure race server, Node + TS + Socket.IO (run with tsx)
├── shared/     match.ts: answer matching used by client AND server
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
- `pipeline/schedule.json`: which questions play on which day (see below).
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
- Every question needs at least 8 valid answers (`MIN_ANSWERS` in
  prompts.py); the admin page flags ones below that. A game-pool question
  with no condition means the whole pool ("Name any agent").
- Richard does not want to estimate anything by hand. When new content appears
  (new players, skins, agents, maps), Claude should update familiarity.json.
- Later: blend in real player answer frequencies once the game is live, and
  auto-detect Too Clever (estimated rare, actually common).

Copy the mechanics, not Krillion's branding or assets.

## Schedule and nightly rebuild

- `pipeline/schedule.py` + `pipeline/schedule.json` (committed): 7 prompt ids per
  date. `plan()` runs on every publish: fills today..+29 days; past days are
  history, today never changes once set, valid auto days stay stable, pinned
  (hand-picked in the admin Schedule view) days keep their picks and only get
  disabled/deleted ids replaced. Auto picks: least recently used, no repeat
  within min(21, enabled/7 - 1) days, 3–4 pro (players/teams pools), max 2 per
  game pool. dive.json gets `schedule` (yesterday onward); the client uses
  `schedule[date]` and falls back to its seeded random pick if missing.
- Admin: Questions | Schedule tabs; `/api/schedule`, `/api/schedule/day`
  (also patches dive.json's schedule directly). Sidebar shows last/next use.
- `.github/workflows/nightly.yml`: daily 08:17 UTC, runs build.py with the
  `LIQUIPEDIA_USER_AGENT` repo secret (config.py reads `KRILLJOY_USER_AGENT`
  env when local_settings.py is absent), caches `pipeline/cache` with
  actions/cache, commits data/schedule/dive.json if changed. Richard must
  `git pull` before working; `Edit questions.bat` does `git pull --ff-only`.

## Questions by region (IGLs)

- `igl_region` (players): Captain at a region's league event, Captain at an
  international for a team from that league (`team_regions()`), or listed in
  `known_igls` in familiarity.json (pre-2026 IGLs by Liquipedia PAGE name;
  Liquipedia only marks Captain on 2026 rosters). `captain_at: any` also
  includes the hand list. `played_region`: played a league event of that region.
- Only add hand-listed IGLs you're certain of; use the exact page name
  ("Laz" is ZETA's; "Laz (Thai player)" is someone else).

## Client (daily mode) notes

- `src/game/daily.ts`: `LAUNCH_DATE` = Dive #1 (change at public launch).
  `pickDaily` uses dive.json's schedule for the date; without one it seeds by
  Eastern date and picks 3–4 pro-scene + 3–4 game prompts.
  Adding/removing prompts changes future picks; a started dive keeps its prompts.
- `src/game/match.ts`: exact match on id/aliases (normalized: lowercase,
  accents folded, non-alphanumerics removed), then autocorrect (1 typo for
  4+ letters, 2 for 7+, 3 for 12+). A name that is a valid answer to ANY
  other prompt is rejected outright, as is text closer to such a name than to
  a valid one; ties between two answers are rejected. Before typos, a
  "shorthand" step: text that starts exactly one answer's name or one of its
  words ("brim", "rgx", "prelude", "karambit") is suggested; if it starts
  several ("reaver" in a many-gun question), the game says "Which one? e.g. …"
  (not counted as a wrong guess). A fixed typo does NOT
  lock in: like Krillion, the box fills with the real name and a bubble says
  "“typed” → “Name” · submit again to confirm · or edit".
- `src/game/storage.ts`: localStorage, per date. `roundStartedAt` is saved so
  reloading doesn't reset the 25 s clock. Time out = whatever is in the box counts if valid, else 0.
- `src/components/Ocean.tsx`: one 500vh strip (sky top 12%), slid up by depth;
  the home screen's two rows line up with the 60vh horizon (`.home` in index.css).
- Answers are all in dive.json (like Krillion): fine for daily mode; the
  multiplayer modes need a server that holds the answers.

## Roadmap

1. **Daily mode** (`client/`, built Nov 2026, live at krilljoy.pages.dev): same as Krillion today.
   - Sound: 8-bit effects synthesized with Web Audio in `src/game/sound.ts`
     (no audio files; never use Krillion's). Approved set: rank chimes (rarer =
     sparklier), wrong-guess buzz, autocorrect "hm?", last-5-seconds ticks,
     button click, splash on BEGIN DIVE, whoosh on DESCEND, sonar ping on the
     end screen + fanfare for 351+. NO background ocean hum (Richard said no).
     Speaker button in the top bar mutes; remembered in localStorage.
   - Rank icons: Valorant's real rank icons (Richard supplied the files),
     `client/public/ranks/*.png`, 128px. Allowed by Riot's "Legal Jibber
     Jabber" fan policy (free, non-commercial, with the disclaimer that's in the
     footer). Share text emoji (Richard's picks, Nov 2026): ⬜ Silver, 🟨 Gold, 🟦 Platinum,
     🟪 Diamond, 🟥 Immortal, 🏆 Radiant, ❔ no answer. Share text copies Krillion's
     layout: "Krilljoy #N 🤿", the score in POINTS (not metres), a blank line, the
     squares, then the site link.
   - Look: the "Pixel blend" style (Richard, Nov 2026): retro pixel ocean
     that darkens with depth, Valorant red (#ff4655) + navy, notched LOCK IN
     buttons, pixel gems in rank colors, VT323 font everywhere (what Krillion
     uses; headings bold), depth gauge on the right. Background is animated:
     waves, bobbing boat, fish schools, plankton, light rays, kelp, and an
     original glowing red jellyfish (not Krillion's shrimp). All sprites are original; never use Krillion's art.
     Desktop layout mirrors Krillion's: home masthead, HUD (depth / round
     squares / score), centered question card, reveal card + DESCEND, results
     log with an expandable answer list per question.
   - 7 prompts per day, same for everyone, new set at midnight Eastern.
   - 25 seconds per prompt. Wrong guesses don't end the round (like Krillion):
     keep guessing until one is valid or the clock runs out (then 0).
     "Give up" ends it with 0.
   - Matching: case-insensitive against `aliases`, forgiving small typos
     (fuzzy match), never accept a different real player.
   - Each point = 10 m of depth; a perfect 700-point dive = 7,000 m.
   - No treasure chest in daily mode (Richard, Nov 2026): a perfect dive is
     basically unreachable. The depth gauge just ends at 7,000 m. The chest is
     only for the treasure dive / multiplayer mode.
   - During the dive, the reveal shows only your rank/points (no other
     answers). The end screen copies Krillion's: big score + depth, dive-log
     chart (one line per round, depth = points), "the bearing" score bands,
     share, and "the catch": tap a round for rank filter chips, search, and
     every answer rarest first (yours highlighted, Liquipedia link ↗).
     No "better than X% of players" curve yet: needs real player data (server).
   - Progress saved locally so closing the tab mid-dive resumes it.
   - The day's prompts come from the schedule in `dive.json` (see above).
2. **More answer pools:** game content is done (see "Answer pools"). Still to
   build: hand-written answer lists, more Liquipedia data.
3. **Treasure race** (built and live Nov 2026). Richard's rules:
   - Lobbies like ERS / Krillion's Puffer Party: Quick play (public lobby,
     auto-starts 30 s after it FILLS UP, Richard's call; the countdown is
     cancelled if someone leaves or the host makes it private, and starts over
     from 30 s when it's a full public lobby again; private rooms never
     auto-start; the host can always press Start), Host a room
     (4-letter code, invite link /race/CODE, private unless listed), Join by
     code, public room list. Max 2–10 players (default 8). Host can start solo.
   - Everyone gets the same shuffled question order (no two same-pool questions
     in a row), back to back, NO timer. Answers checked on the server with
     shared/match.ts (typo -> "suggest" -> player confirms; "which one?" for
     ambiguous; wrong guesses free). Skip unlocks after 25 s (0 m).
   - Host picks length: Short 3,000 / Normal 5,000 / Long 7,000 m (Richard, Nov 2026; quick play =
     Normal). First to the treasure chest wins; then a 60 s LAST CALL (Richard, Nov 2026; was 30 s) for the
     rest; placings = finish order, then depth (ties: fewer skips).
   - Live depths: shared gauge (every diver's marker, chest at the bottom) +
     live leaderboard. Results: podium, standings, your answers. Public rooms
     return to the lobby after 45 s; private hosts press "Race again".
   - Server: server/src/index.ts (rooms, sockets, reconnect by token: 30 s grace
     in lobby, 90 s mid-race; empty rooms are deleted), race.ts (pure rules;
     a race ends after 15 min with no guesses or skips from anyone,
     `IDLE_END_MS`, Richard's call), data.ts (reads client/public/data/dive.json,
     reloads on change).
   - Live: game https://krilljoy.pages.dev (Cloudflare Pages, root `client`,
     env NODE_VERSION=22 + VITE_SERVER_URL); server
     https://krilljoy-race.onrender.com (Render free, Root Directory EMPTY,
     build `cd server && npm install`, start `cd server && npm start`, env
     NODE_VERSION=22 + CLIENT_ORIGIN=https://krilljoy.pages.dev). UptimeRobot
     pings it every 5 min. Pushes (incl. nightly) redeploy both; a server
     redeploy ends races in progress.
   - Client: /race routes via src/nav.ts (Cloudflare Pages serves index.html for
     unknown paths by itself; no _redirects file). src/race/*. "◂ Daily dive"
     button on the race home. Each localhost tab is its own player (sessionStorage token).
   - Note: dive.json is public, so a determined cheater could look answers up.
     Fine for friends; a ranked mode would need the server to hold answers privately.
4. **Spike splash** (built Nov 2026; Krillion's Puffer Party, Valorant themed). Richard's rules:
   - Same rooms/lobbies as Treasure race; the room has a `mode` ("race" | "spike").
     Max 8 players, Quick play rooms of 6. Quick play keeps modes in separate rooms.
   - Players sit in a circle on rocks around the spike (you always at the bottom,
     phone too). Take turns naming answers to the same question; any valid unused
     answer passes the spike. Turn clock 15 s, 1 s shorter per lap, min 7 s. Run out
     = the spike goes off on you: -1 life (start with 2), fresh question, 3 s break.
     0 lives = out; last one standing wins (solo practice: until you're out).
   - Only questions with 15+ answers, in a random order. A question also changes after
     min(18, max(8, round(n/4)+2)) answers (`answerLimit` in spike.ts, "normal"), or when
     fewer unused answers remain than players. No host option for this (Richard removed
     "Questions last" Short/Long, Nov 2026; the short/long code paths are unused).
   - Extra lives: each answer adds its rank points to a meter; 400 = +1 life, max 4
     (LIFE_EVERY / MAX_LIVES, tunable). The bar is drawn in pieces, one per answer
     in its rank colour (`meterParts`; the answer that fills it spills into the next bar).
   - Each seat shows that player's latest answer in a bubble (wraps up to 4 lines,
     never cut off) until it's their turn again. No list of all answers under the
     question (Richard's call); "already said by X" tells you about repeats.
   - Avatars = Riot's official agent icons (fan policy, like rank icons), in a ring of
     the player's colour. Agent select in the lobby (tap your own agent): one agent
     per room, last pick remembered (localStorage `krilljoy:agent`). The list comes from
     `client/public/data/agents.json`, written by `write_agents()` in game.py on every
     build (nightly commits it), so new agents appear automatically. Never draw
     Valorant's characters, pets or the Spike ourselves. The spike in the arena is Riot's
     official "Standard" game-mode icon (valorant-api.com gamemodes, Richard's pick): grey
     while the lobby waits, red glow growing as the turn clock runs down (--heat), flash
     when it goes off; our pixel sea mine (SPIKE sprite) is the fallback if it can't load.
   - Chat (like ERS): public rooms = 10 preset quick messages only; private rooms =
     free text too, slurs/swears starred out server-side (obscenity). Spam limit
     5 per 5 s. Emoji reactions (8) pop over your seat for 3 s. "Turn chat off" toggle.
   - Code: server/src/spike.ts (pure rules), chat.ts, index.ts (mode branches);
     client/src/race/Spike*.tsx, SplashScene.tsx (seabed arena shared by lobby and
     game), AgentPicker/AgentAvatar, LifeMeter, ChatPanel, EmojiButton.
5. **Later:** rated matchmaking, leaderboards, "better than X%" curve, real
   answer counts ("N players chose this").

## Conventions

- Plain-language comments and README, like ERS.
- Keep the game rules separate from UI and networking code.
- Phones matter: test small screens, tap targets, iPhone Safari viewport.
- Before saying something works, run it.
