import type { Game } from '../engine'
import { auction } from './auction'
import { bluff } from './bluff'
import { closest } from './closest'
import { codewords } from './codewords'
import { connections } from './connections'
import { draw } from './draw'
import { geoguess } from './geoguess'
import { imposter } from './imposter'
import { lastcard } from './lastcard'
import { liarsdice } from './liarsdice'
import { make24 } from './make24'
import { mastermind } from './mastermind'
import { mindmeld } from './mindmeld'
import { mostlikely } from './mostlikely'
import { movieguess } from './movieguess'
import { musicguess } from './musicguess'
import { reaction } from './reaction'
import { stopwatch } from './stopwatch'
import { telephone } from './telephone'
import { territory } from './territory'
import { trivia } from './trivia'
import { wordgrid } from './wordgrid'
import { wordle } from './wordle'

/** Every game by its catalog id. */
export const GAMES: Record<string, Game> = {
  auction, bluff, closest, codewords, connections, draw, geoguess, imposter, lastcard, liarsdice, make24, mastermind, mindmeld, mostlikely,
  movieguess, musicguess, reaction, stopwatch, telephone, territory, trivia, wordgrid, wordle,
}
