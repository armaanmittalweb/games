import type { Game } from '../engine'
import { bluff } from './bluff'
import { closest } from './closest'
import { codewords } from './codewords'
import { draw } from './draw'
import { imposter } from './imposter'
import { lastcard } from './lastcard'
import { liarsdice } from './liarsdice'
import { mindmeld } from './mindmeld'
import { mostlikely } from './mostlikely'
import { reaction } from './reaction'
import { telephone } from './telephone'
import { trivia } from './trivia'
import { wordgrid } from './wordgrid'
import { wordle } from './wordle'

/** Every game by its catalog id. */
export const GAMES: Record<string, Game> = { bluff, closest, codewords, draw, imposter, lastcard, liarsdice, mindmeld, mostlikely, reaction, telephone, trivia, wordgrid, wordle }
