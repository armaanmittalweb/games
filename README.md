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

## Run and deploy

```
npm install
npm run dev      # http://localhost:8799
npm run check    # type-check
npm run deploy   # games.amittal.dev
```

Everything runs on Cloudflare's free plan.
