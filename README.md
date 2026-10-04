# Game Night

Party games for a group of friends, in the browser: https://games.amittal.dev

One person makes a room and shares the 5-letter code; everyone joins from their own phone or laptop. The host picks a
game, or plans a whole game night, and the room keeps one leaderboard across every game played in it.

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
| Closest Wins | 2–30 | Number questions; the nearest guess scores. |

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

- Word lists (`scripts/build-words.mjs`): Word Race answers are Wordle answers that are also among the 10,000 most
  common subtitle words ([hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords), CC BY-SA 4.0);
  accepted guesses and Word Grid's dictionary come from SCOWL (see `data/SCOWL-COPYRIGHT`).
- Trivia (`scripts/build-trivia.mjs`): the [Open Trivia Database](https://opentdb.com) (CC BY-SA 4.0), minus anime,
  comics, US sports and politics, plus 80 questions about India in `data/india-trivia.mjs`. "Mixed" difficulty leaves
  out the hard questions. `npm run trivia` downloads the bank again.
- Prompts, word pairs, drawing words, Code Words boards, Dictionary Bluff words and Closest Wins questions are in
  `src/content/`. Closest Wins answers note any rounding or date.

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
