import answersText from '../data/answers.txt'
import allowedText from '../data/allowed.txt'
import dictText from '../data/dict.txt'

const split = (s: string) => s.split(/\s+/).map(w => w.trim().toLowerCase()).filter(w => /^[a-z]{5}$/.test(w))

export const ANSWERS = split(answersText)
export const VALID = new Set([...ANSWERS, ...split(allowedText)])
/** Every accepted word from 3 to 16 letters, for Word Grid. */
export const DICT = new Set(dictText.split(/\s+/).filter(Boolean))

/** Wordle colours: 2 = right place, 1 = in the word elsewhere, 0 = not in it. Repeated letters count once each. */
export function score(guess: string, answer: string): number[] {
  const res = [0, 0, 0, 0, 0]
  const left: Record<string, number> = {}
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) res[i] = 2
    else left[answer[i]] = (left[answer[i]] ?? 0) + 1
  }
  for (let i = 0; i < 5; i++) {
    if (res[i] === 2) continue
    const c = guess[i]
    if (left[c]) { res[i] = 1; left[c]-- }
  }
  return res
}
