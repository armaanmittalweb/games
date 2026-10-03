import answersText from '../data/answers.txt'
import allowedText from '../data/allowed.txt'

const split = (s: string) => s.split(/\s+/).map(w => w.trim().toLowerCase()).filter(w => /^[a-z]{5}$/.test(w))

export const ANSWERS = split(answersText)
export const VALID = new Set([...ANSWERS, ...split(allowedText)])

/** `n` different answers in random order. */
export function pickWords(n: number): string[] {
  const pool = ANSWERS.slice()
  const out: string[] = []
  const r = new Uint32Array(n)
  crypto.getRandomValues(r)
  for (let i = 0; i < n && pool.length; i++) {
    const j = r[i] % pool.length
    out.push(pool[j])
    pool[j] = pool[pool.length - 1]
    pool.pop()
  }
  return out
}

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
