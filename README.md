# Game Night

Party games for a group of friends, in the browser: https://games.amittal.dev

One person makes a room and shares the 5-letter code; everyone joins from their own phone or laptop. The host picks a
game, or plans a whole game night, and the room keeps one leaderboard across every game played in it. There is a light and a dark theme (the switch is in the top bar).

## Games

| Game | Players | What it is |
|---|---|---|
| Draw & Guess | 3–16 | One draws, the rest race to guess. Themed word packs, including desi words. |
| Imposter | 3–16 | Everyone shares a secret word except one. Clues, a discussion, a vote. |
| Code Words | 4–16 | Two teams, spymasters give one-word clues (Codenames-style). |
| Word Race | 1–30 | Multiplayer Wordle in four modes: Marathon, Race, Survival, Blitz. |
| Telephone | 3–12 | Write, draw, describe, draw… then watch each book unfold. |
| Dictionary Bluff | 3–12 | Invent meanings for rare real words; find the real one. |
| Mind Meld | 3–20 | "Name a fruit": score by matching the group. |
| Most Likely To | 3–20 | Everyone votes for a player; voting with the room scores. |
| Trivia | 1–30 | Multiple choice with speed points and streaks; an India category. |
| Word Grid | 1–20 | Boggle-style word search, unique-word scoring. |
| Last Card | 2–10 | Uno-style card game with stacking and Last Card calls. |
| Liar's Dice | 2–8 | Hidden dice, rising bids, calls of "liar". |
| Reaction | 1–30 | Wait for green and tap; decoys and moving targets. |
| Stop the Clock | 1–30 | Stop a stopwatch on a target time; the clock may vanish. Closest wins. |
| Closest Wins | 2–30 | Number questions; the nearest guess scores. |
| Connections | 1–30 | Sixteen words, four hidden groups, four mistakes. Everyone solves the same board. |
| GeoGuess | 1–30 | A country, capital or city is named; drop a pin on the world map. |
| Music Guess | 1–30 | Two seconds of a Bollywood song; pick it from four. |
| Movie Guess | 1–30 | Name the film from emojis; a story and a famous line follow. |
| Mastermind | 2–6 | Everyone races to crack the same colour code in the fewest guesses. |
| Territory | 2–8 | Claim squares on a shared map; everyone moves at once and clashes cancel. |
| Auction | 2–10 | 100 coins each; bid on lots, collect sets, keep some cash. |
| 24 Game | 1–30 | Four numbers; combine them with + − × ÷ to make 24. |

Each game has its own icon, drawn in `src/icons.ts` (a coloured tile with a white drawing); the build puts the SVGs
into `public/catalog.js` and the guide pages.

Before every game the rules are up for everyone for 30 seconds. Tapping anywhere closes them, and they shrink into the
**?** button at the top, where they can be opened again. The game is set up only when every player here has closed
them or the 30 seconds are over, so its clock starts then and nobody loses playing time.

Every game's rules, settings, player range, length and Game DNA (skill, luck, social, brain, chaos and replay, 1 to 5)
live in `src/catalog.ts`. That one file drives the room's settings checks, the game-night planner, the library on the
page and the guide page for each game.

## Game nights

The host picks a length (Quick 15 min, Standard 30, Chaos 45, Tournament, Endless) and up to four moods (think, chaos,
competitive, deception, creative, fast, social, strategic). `src/night.ts` scores every game that fits the number of
players against the moods, fills the time without letting one game take most of it, spreads categories out, and the
host can swap or drop any game before starting. Each game gives places points on the night's table (10, 7, 5, 4, 3, 2,
1; ties share). In a tournament the bottom of the table is knocked out after each game (anyone level with the last
place kept stays in) until two play a final; knocked-out players watch.

## How it works

- One Cloudflare Worker serves the pages (`public/`) and the API (`src/index.ts`).
- Each room is a Durable Object (`src/room.ts`). It seats players, keeps the clock with alarms, saves state, and sends
  every player their own view over a WebSocket. Rooms delete themselves a day after the last activity.
- A game is a set of plain functions over its own state (`src/engine.ts` has the contract, `src/games/*.ts` the
  games): `setup`, `act`, `tick` for deadlines, `join` for late arrivals, and `view`, which decides what each player
  may see (the spymaster's key, your own dice, only words you have finished). The server checks every move.
- Pen strokes are passed straight through to the other players and saved every few seconds rather than on every
  stroke; Telephone keeps each drawing in its own storage key.
- The page is plain ES modules with Preact and htm (`public/js/preact.js`, vendored, no build step). `public/js/app.js`
  is the room, lobby, game nights, results and chat; `public/js/games/<id>.js` is one screen per game.
- Players are a random id and secret in `localStorage`, so a refresh or a dropped connection rejoins the same seat.
- Site-wide counts (rooms, games by type, players) live in the `Stats` Durable Object (`src/stats.ts`), read by the
  Switchboard at `/internal/stats` with the shared `INTERNAL_KEY`; without it the route is a 404.

## Content

All content is in plain English for friend groups in India.

- Word lists (`scripts/build-words.mjs`): Word Race answers are Wordle answers that are also among the 20,000 most
  common subtitle words ([hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords), CC BY-SA 4.0);
  accepted guesses and Word Grid's dictionary come from SCOWL (see `data/SCOWL-COPYRIGHT`).
- Trivia (`scripts/build-trivia.mjs`): the [Open Trivia Database](https://opentdb.com) (CC BY-SA 4.0), minus anime,
  comics, US sports and politics, plus about 500 questions about India in `data/india-trivia.mjs`. "Mixed" difficulty
  leaves out the hard questions. `npm run trivia` downloads the bank again.
- Most Likely To has a Clean pack (any group) and a Spicy pack (dating, exes, parties, roasts), about 10,000 prompts
  in `src/content/likely/`. After adding prompts, `node scripts/dedupe-likely.mjs` removes repeats and rebuilds the index.
- Connections groups (`src/content/connections.ts`) list the themes their words could also belong to; two groups with a
  theme in common never share a board, so every board has one answer.
- GeoGuess: Natural Earth's 1:10m countries as India sees its borders (public domain), simplified by
  `node scripts/build-geo.mjs <ne_10m_admin_0_countries_ind.geojson>` into `public/geo/world.json` (drawing) and
  `src/content/geo-shapes.ts` (scoring). Capitals and cities are in `src/content/geo.ts`; `npm test` checks each one
  lies inside its country.
- Music Guess: Bollywood songs with Apple's free 30-second previews, found by `node scripts/build-songs.mjs` (iTunes
  Search API, India store). Only tracks from the film's own album are kept (no covers, remixes or lo-fi versions), and
  each round links to the song on Apple Music.
- 24 Game: `node scripts/build-24.mjs` solves all 1,820 hands of four numbers from 1 to 13 and keeps the 1,362 that make
  24, with a difficulty and one answer each.
- Prompts, word pairs, drawing words, Code Words boards, Dictionary Bluff words and Closest Wins questions are in
  `src/content/`. Closest Wins answers note any rounding or date.

Content is dealt, not drawn at random (`Ctx.deal`). Each pool is walked in one fixed shuffled order, and every room
on the site shares its place in it through the Stats object, so a question, prompt or word comes back only after the
whole pool has been used. `npm test` fails if a pool holds the same item twice and prints each pool's size:

| Pool | Items | Per game (default) |
|---|---|---|
| Trivia | 4,940 (517 about India) | 10 |
| Word Race answers | 1,466 | 5 to 15 |
| Imposter pairs | 871 | 3 |
| Code Words board words | 766, plus 217 desi | 25 |
| Mind Meld prompts | 633 | 8 |
| Dictionary Bluff words | 559 | 5 |
| Closest Wins questions | 532 | 8 |
| Most Likely To prompts | 10,004 (4,559 clean, 5,445 spicy) | 8 |
| Connections groups | 320 | 4 a board |
| Movie Guess films | 240 (161 Indian, 79 English) | 8 |
| Music Guess songs | 240 | 10 |
| GeoGuess places | 195 countries, 102 capitals, 83 cities | 8 |
| 24 Game hands | 1,362 | 8 |
| Auction lots | 108 in 12 sets | 12 |
| Draw & Guess words | about 200 per theme, 1,452 mixed | 3 shown per turn |
| Telephone starting lines | 221 | only when someone writes nothing |

## Numbers for the Switchboard

`src/analytics.ts` keeps the product numbers the Switchboard's Game Night page shows (acquisition, activation,
engagement, retention, invites, quality, feedback). The page (`public/js/track.js`, on every page) and the rooms report
to the Stats object, on this site's own domain:

- Ids are random and anonymous: a visitor id per browser (localStorage), a session id per visit (30 idle minutes), a
  room id per room (codes are used again; room ids never are) and a player id that only means something in one room.
  No names, addresses or accounts are kept.
- Page views, taps on share and script errors go to `POST /api/ev` (60 a minute per address). Joins, games, dropped
  connections, reconnects and feedback come from the room itself.
- Browsers driven by test tools, crawlers, and any browser opened once with `/?me=1` are left out of every number.
- Days are Indian days. `GET /internal/analytics?days=N` (with `INTERNAL_KEY`) returns the report.

`npm test` checks the numbers on a scenario spread over weeks (`test/analytics.ts`), and `node test/analytics-sim.mjs`
plays a known night against `npm run dev` and checks every figure the page shows.

## Search

- `/` is the platform; `/games` lists every game; `/games/<id>` is a guide page per game with rules, settings, Game
  DNA and HowTo, VideoGame and breadcrumb structured data. These, `public/catalog.js` and `sitemap.xml` are generated
  from the catalog by `scripts/build-site.mjs` (run by `npm run dev` and `npm run deploy`).
- The Word Race guides (`/how-to-play`, `/game-modes`, `/wordle-tips`, `/wordle-unlimited`) are hand-written.
- `/?play=<id>` opens a new room with that game picked; `/?solo=1` starts a solo Word Race at once.
- Room links (`/r/CODE`) are served with `X-Robots-Tag: noindex`; unknown paths get a real 404.
- After a deploy that changes pages, `npm run indexnow` asks Bing and Yandex to recrawl. Google needs the site added in
  Search Console once (DNS TXT record in Cloudflare) and `https://games.amittal.dev/sitemap.xml` submitted.

## Run, test and deploy

```
npm install
npm run dev      # http://localhost:8799
npm run check    # type-check
npm test         # bots play every game at several table sizes, with joins and drop-outs
node test/e2e.mjs [gameId,…]   # with dev running: four browsers play each game to its results screen
npm run deploy   # games.amittal.dev
```

`.dev.vars` (not committed) holds `INTERNAL_KEY` for local runs. Everything runs on Cloudflare's free plan.
