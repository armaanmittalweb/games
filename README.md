# Word Race

Wordle for a group of friends, played at the same time: https://games.amittal.dev

Make a room, share the link or the 5-letter code, pick a mode and start. Everyone gets the same words.

## Modes

| Mode | How it works | Ranking (tie-breaks in order) |
|---|---|---|
| Marathon | A pool of N words (default 15), same order for everyone, one timer. Solve in 1 guess = 6 points … 6 guesses = 1. | points → words solved → fewer guesses → solved their last word earlier |
| Race | Same pool. First to clear it wins. Missed or skipped words are lost. | words solved → reached that count earlier → fewer guesses |
| Survival | Same pool. One miss and you are out. | words solved → fewer guesses → earlier |
| Blitz | Everyone plays the same word at once, round by round, with a per-round timer. 7 − guesses, plus 3/2/1 for the first three to solve. | points → rounds won → less total solve time → fewer guesses |

Players still level after every tie-break share the place.

The host sets the pool size (1–50), the time limit (1–60 minutes) or the seconds per round (20–300), can end a game early,
hand the host role to someone else, or remove a player. Anyone can join mid-game.

## How it works

- One Cloudflare Worker serves the page (`public/`, plain HTML/JS) and the API (`src/`).
- Each room is a Durable Object (`src/room.ts`) that holds the room's state and every player's WebSocket. It picks the
  words, checks every guess and keeps the clock, so the answers never reach a browser before that player is done with
  them. Timers run on Durable Object alarms. Rooms delete themselves a day after the last activity.
- Players are identified by a random id and secret kept in `localStorage`, so a refresh or a dropped connection
  rejoins as the same player.
- Word lists, built by `scripts/build-words.mjs`:
  - `data/answers.txt`: the 1,016 words players are asked to guess. Wordle answers that are also among the 10,000 most
    common words in film and TV subtitles, so they are words everyone knows ("smile", "crane"), not "parry" or "datum".
    Frequencies from [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) (OpenSubtitles 2018,
    CC BY-SA 4.0), saved as `data/subtitle-frequency.txt`.
  - `data/allowed.txt`: the guesses accepted, real English words only (4,860), from SCOWL (see `data/SCOWL-COPYRIGHT`).
    Anything else is rejected as "Not a real English word" and costs no guess.
- Site-wide counts (rooms, games, guesses, players) live in one more Durable Object, `Stats` (`src/stats.ts`). The
  Switchboard reads them at `/internal/stats` with the shared `INTERNAL_KEY` secret; without it the route is a 404.

## Search

The pages search engines see are plain HTML in `public/`, readable without JavaScript:

| Page | Aimed at |
|---|---|
| `/` | multiplayer Wordle, Wordle with friends (with an FAQ) |
| `/how-to-play` | rules, tile colours, repeated letters, scoring, tie-breaks |
| `/game-modes` | the four modes and their settings |
| `/wordle-tips` | best starting words, measured against the answer list (`npm run word-stats`) |
| `/wordle-unlimited` | unlimited practice; its Play solo button (`/?solo=1`) starts a game at once |

- Each page has its own title, description, canonical URL, Open Graph image (`og.png`) and JSON-LD: WebSite, VideoGame
  and FAQPage on the home page, HowTo, Article, ItemList and breadcrumbs on the guides.
- `robots.txt`, `sitemap.xml` and `manifest.webmanifest` are in `public/`. Unknown paths get a real 404 (`404.html`), and
  room links (`/r/CODE`) are served with `X-Robots-Tag: noindex` because rooms only last a day.
- `npm run images` redraws the share image and icons. After a deploy that changes page content, `npm run indexnow` asks
  Bing and other IndexNow engines to recrawl; the key is the `public/<key>.txt` file.
- Google needs a one-time setup by hand: add `games.amittal.dev` in Search Console (verify with the DNS TXT record it
  gives, added in Cloudflare), then submit `https://games.amittal.dev/sitemap.xml`. Bing Webmaster Tools can import it
  from Search Console.

## Run and deploy

```
npm install
npm run dev      # http://localhost:8799
npm run check    # type-check
npm run deploy   # games.amittal.dev
```

`.dev.vars` (not committed) holds `INTERNAL_KEY` for local runs. Everything runs on Cloudflare's free plan.
