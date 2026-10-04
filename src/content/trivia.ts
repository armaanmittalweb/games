// The Trivia question bank, built by scripts/build-trivia.mjs. Open Trivia Database questions are CC BY-SA 4.0.
import data from './trivia.json'

/** c: category key, d: difficulty, q: question, a: right answer, w: wrong answers (one for true or false). */
export interface Question { c: string; d: string; q: string; a: string; w: string[] }

export const TRIVIA = data as Question[]
