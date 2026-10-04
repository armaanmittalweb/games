// Every game's metadata: who it suits, how long it takes, its settings and its rules. The server uses it to check
// settings and plan game nights; scripts/build-site.mjs copies it to public/catalog.js for the page and writes a guide
// page per game from it. No imports here, so Node can read this file directly.

export type Mood = 'think' | 'chaos' | 'competitive' | 'deception' | 'creative' | 'fast' | 'social' | 'strategic'

export interface Option {
  key: string
  label: string
  /** choice: one of choices; num: a whole number from min to max */
  kind: 'choice' | 'num'
  def: string | number
  choices?: [string | number, string][]
  min?: number
  max?: number
  unit?: string
}

export interface Dna { skill: number; luck: number; social: number; brain: number; chaos: number; replay: number }

export interface Meta {
  id: string
  name: string
  emoji: string
  cat: 'Word' | 'Drawing' | 'Party' | 'Deception' | 'Trivia' | 'Cards & dice' | 'Reflex'
  blurb: string
  min: number
  max: number
  /** Minutes with the game-night settings: base + perPlayer × players. */
  minutes: [number, number]
  dna: Dna // 1 to 5
  moods: Mood[]
  teams?: boolean
  options: Option[]
  /** Settings used when a game night picks this game. */
  night: Record<string, string | number>
  rules: string[]
  /** For the guide page: the search phrase it answers and a longer description. */
  seo: { title: string; description: string; about: string }
}

const secs = (key: string, label: string, def: number, min: number, max: number): Option => ({ key, label, kind: 'num', def, min, max, unit: 's' })
const rounds = (def: number, min = 1, max = 20, label = 'Rounds'): Option => ({ key: 'rounds', label, kind: 'num', def, min, max })

export const CATALOG: Meta[] = [
  {
    id: 'draw', name: 'Draw & Guess', emoji: '🎨', cat: 'Drawing',
    blurb: 'One player draws, everyone else races to guess the word.',
    min: 3, max: 16, minutes: [1, 1.4],
    dna: { skill: 3, luck: 2, social: 5, brain: 2, chaos: 4, replay: 5 }, moods: ['creative', 'chaos', 'social', 'fast'],
    options: [
      rounds(2, 1, 5, 'Rounds (everyone draws once per round)'),
      secs('seconds', 'Seconds to draw', 80, 30, 180),
      { key: 'theme', label: 'Words', kind: 'choice', def: 'mixed', choices: [['mixed', 'Mixed'], ['easy', 'Easy things'], ['animals', 'Animals'], ['food', 'Food'], ['desi', 'Desi (India)'], ['actions', 'Actions'], ['places', 'Places'], ['tech', 'Tech & college']] },
    ],
    night: { rounds: 1, seconds: 70 },
    rules: [
      'Each turn one player picks one of three words and draws it. Everyone else types guesses.',
      'Letters of the word are revealed as hints as time runs down. A guess one letter off is marked "close".',
      'Guess sooner to score more. The drawer scores for every player who gets it.',
      'Once you have guessed, your messages are only shown to others who have guessed too.',
    ],
    seo: { title: 'Draw and Guess Online with Friends, Free', description: 'A free online drawing and guessing game for friends: one draws, the rest guess. Private rooms, themed word packs, works on phones. No sign-up.', about: 'a Pictionary-style drawing and guessing game' },
  },
  {
    id: 'imposter', name: 'Imposter', emoji: '🕵️', cat: 'Deception',
    blurb: 'Everyone gets the same word except one. Give clues, then find the imposter.',
    min: 3, max: 16, minutes: [2, 0.8],
    dna: { skill: 3, luck: 2, social: 5, brain: 3, chaos: 3, replay: 5 }, moods: ['deception', 'social', 'think'],
    options: [
      { key: 'mode', label: 'Imposter gets', kind: 'choice', def: 'blank', choices: [['blank', 'Only the category'], ['undercover', 'A similar word (and is not told)']] },
      rounds(3, 1, 8),
      { key: 'clues', label: 'Clues each per round', kind: 'num', def: 2, min: 1, max: 3 },
      secs('clueSeconds', 'Seconds per clue', 30, 10, 90),
      secs('talkSeconds', 'Seconds to discuss', 60, 15, 300),
    ],
    night: { rounds: 2, clues: 1, talkSeconds: 45 },
    rules: [
      'Everyone sees the same secret word, except the imposter. In the classic mode the imposter only sees the category; in Undercover they get a similar word and do not know they are the odd one out.',
      'Taking turns, each player gives a one-word clue. Too obvious and the imposter learns the word; too vague and you look suspicious.',
      'After the clues, discuss and vote. If the imposter gets the most votes they are caught, but in the classic mode they can still win by guessing the word.',
      'Players score when the group catches the imposter; the imposter scores big for getting away with it.',
    ],
    seo: { title: 'Imposter Word Game Online: Find the Spy', description: 'Play the imposter word game online with friends. Everyone gets the word except one player. Give clues, vote, catch the spy. Free, private rooms.', about: 'a social deduction word game in the style of Undercover and Spyfall' },
  },
  {
    id: 'codewords', name: 'Code Words', emoji: '🧩', cat: 'Word', teams: true,
    blurb: 'Two teams. Spymasters give one-word clues to lead teammates to their agents.',
    min: 4, max: 16, minutes: [12, 0],
    dna: { skill: 4, luck: 1, social: 4, brain: 5, chaos: 2, replay: 5 }, moods: ['think', 'social', 'strategic'],
    options: [
      { key: 'timer', label: 'Turn timer', kind: 'choice', def: 0, choices: [[0, 'Off'], [60, '1 minute'], [120, '2 minutes'], [180, '3 minutes']] },
      { key: 'pack', label: 'Words', kind: 'choice', def: 'mixed', choices: [['mixed', 'Mixed'], ['desi', 'With desi words']] },
    ],
    night: { timer: 120 },
    rules: [
      'Players split into Red and Blue, and each team picks a spymaster. The spymasters see which of the 25 words belong to which team.',
      'On their turn a spymaster gives a one-word clue and a number: how many words it points to.',
      'Teammates tap words to reveal them. A right guess lets them keep going (up to the number plus one). A neutral word or the other team\'s word ends the turn.',
      'First team to find all its agents wins. Reveal the assassin and your team loses at once.',
    ],
    seo: { title: 'Codenames-Style Word Game Online for Teams', description: 'A free team word game in the style of Codenames: spymasters give one-word clues, teams find their agents and avoid the assassin. Private rooms.', about: 'a team word-association game in the style of Codenames' },
  },
  {
    id: 'wordle', name: 'Word Race', emoji: '🟩', cat: 'Word',
    blurb: 'Multiplayer Wordle: the same five-letter words for everyone, one timer.',
    min: 1, max: 30, minutes: [7, 0],
    dna: { skill: 4, luck: 2, social: 2, brain: 4, chaos: 1, replay: 5 }, moods: ['think', 'competitive', 'fast'],
    options: [
      { key: 'mode', label: 'Mode', kind: 'choice', def: 'marathon', choices: [['marathon', 'Marathon: most points'], ['race', 'Race: first to finish'], ['survival', 'Survival: one miss and out'], ['blitz', 'Blitz: same word, same moment']] },
      { key: 'words', label: 'Words (Blitz: rounds)', kind: 'num', def: 15, min: 1, max: 50 },
      { key: 'minutes', label: 'Time limit (not Blitz)', kind: 'num', def: 10, min: 1, max: 60, unit: 'min' },
      secs('roundSeconds', 'Seconds per Blitz round', 90, 20, 300),
    ],
    night: { mode: 'blitz', words: 5, roundSeconds: 75 },
    rules: [
      'Guess five-letter words in six tries. Green: right letter, right place. Yellow: in the word, elsewhere. Grey: not in it.',
      'Only real English words are accepted, and a rejected word costs no try.',
      'Marathon: solve as many as you can before the timer; 6 points for a first-try solve down to 1. Race: first to clear the pool. Survival: one miss and you are out. Blitz: everyone plays the same word at once, with a bonus for the first three to solve it.',
    ],
    seo: { title: 'Multiplayer Wordle with Friends, Free and Live', description: 'Play Wordle with friends in real time. Make a room, share the code and race through the same words in four modes. Free, no sign-up, works on any phone.', about: 'multiplayer Wordle' },
  },
  {
    id: 'telephone', name: 'Telephone', emoji: '📞', cat: 'Drawing',
    blurb: 'Write a phrase, draw what you read, describe what you see. Watch it fall apart.',
    min: 3, max: 12, minutes: [4, 1.6],
    dna: { skill: 2, luck: 3, social: 5, brain: 2, chaos: 5, replay: 5 }, moods: ['creative', 'chaos', 'social'],
    options: [
      secs('writeSeconds', 'Seconds to write', 40, 15, 120),
      secs('drawSeconds', 'Seconds to draw', 75, 20, 180),
    ],
    night: { writeSeconds: 35, drawSeconds: 60 },
    rules: [
      'Everyone writes a phrase. Each phrase starts its own book.',
      'Books pass around the room: you draw the phrase you are given, the next player sees only your drawing and writes what it shows, the next draws that, and so on.',
      'At the end the books are revealed step by step. Give a like to the best moments; likes are the score.',
    ],
    seo: { title: 'Telephone Drawing Game Online (Like Gartic Phone)', description: 'Play the telephone drawing game online: write, draw, describe and watch the message fall apart. Free, private rooms for 3 to 12 friends.', about: 'a telephone drawing game in the style of Gartic Phone' },
  },
  {
    id: 'bluff', name: 'Dictionary Bluff', emoji: '📖', cat: 'Word',
    blurb: 'Invent a definition for a strange real word. Fool your friends, find the real one.',
    min: 3, max: 12, minutes: [1, 0.9],
    dna: { skill: 3, luck: 2, social: 5, brain: 3, chaos: 3, replay: 4 }, moods: ['creative', 'deception', 'social'],
    options: [rounds(5, 1, 12), secs('writeSeconds', 'Seconds to write', 60, 20, 180), secs('voteSeconds', 'Seconds to vote', 30, 10, 90)],
    night: { rounds: 3, writeSeconds: 50 },
    rules: [
      'A rare but real English word appears. Everyone writes a definition that sounds believable.',
      'All the definitions, plus the real one, are shown in random order. Vote for the one you think is real.',
      '3 points for finding the real definition, 2 points for every player who votes for yours.',
    ],
    seo: { title: 'Dictionary Bluff: The Fake Definition Game Online', description: 'Play the dictionary game online: invent believable definitions for strange real words, fool your friends and spot the real one. Free, private rooms.', about: 'the dictionary bluffing game, also known as Fictionary' },
  },
  {
    id: 'mindmeld', name: 'Mind Meld', emoji: '🧠', cat: 'Party',
    blurb: '"Name a fruit." Score by giving the same answer as everyone else.',
    min: 3, max: 20, minutes: [4, 0],
    dna: { skill: 2, luck: 3, social: 5, brain: 2, chaos: 3, replay: 5 }, moods: ['social', 'fast', 'chaos'],
    options: [rounds(8, 3, 20), secs('seconds', 'Seconds to answer', 25, 10, 60)],
    night: { rounds: 6 },
    rules: [
      'Everyone answers the same prompt at once, like "Name a fruit".',
      'You score one point for every other player who gave the same answer. Small spelling differences and plurals still match.',
      'The goal is not to be clever. It is to think like the group.',
    ],
    seo: { title: 'Mind Meld: Think Alike Party Game Online', description: 'A free party game where you score by matching your friends\' answers. Name a fruit, name a superhero: think like the group. Private rooms.', about: 'a think-alike party game' },
  },
  {
    id: 'mostlikely', name: 'Most Likely To', emoji: '👉', cat: 'Party',
    blurb: 'Who is most likely to… Everyone points at once. Score by agreeing with the room.',
    min: 3, max: 20, minutes: [3, 0],
    dna: { skill: 1, luck: 2, social: 5, brain: 1, chaos: 4, replay: 4 }, moods: ['social', 'chaos', 'fast'],
    options: [rounds(8, 3, 20), secs('seconds', 'Seconds to vote', 20, 10, 60)],
    night: { rounds: 6 },
    rules: [
      'A prompt appears: "Who is most likely to survive a zombie apocalypse?" Everyone secretly votes for a player.',
      'The votes are revealed together, and the most-voted player takes the title.',
      'You score 2 points when you voted for the player who got the most votes.',
    ],
    seo: { title: 'Most Likely To Questions Game Online with Friends', description: 'Play Most Likely To online: secret votes, live results and titles for your friends. Hundreds of questions, free private rooms.', about: 'the Most Likely To party game' },
  },
  {
    id: 'trivia', name: 'Trivia', emoji: '❓', cat: 'Trivia',
    blurb: 'Quick-fire multiple choice. Right and fast beats right and slow.',
    min: 1, max: 30, minutes: [4, 0],
    dna: { skill: 4, luck: 2, social: 2, brain: 4, chaos: 1, replay: 4 }, moods: ['think', 'competitive', 'fast'],
    options: [
      rounds(10, 3, 30, 'Questions'),
      secs('seconds', 'Seconds per question', 15, 5, 40),
      { key: 'category', label: 'Category', kind: 'choice', def: 'any', choices: [['any', 'Everything'], ['india', 'India'], ['general', 'General knowledge'], ['science', 'Science & nature'], ['geography', 'Geography'], ['history', 'History'], ['screen', 'Film & TV'], ['music', 'Music'], ['sports', 'Sports'], ['tech', 'Computers & gadgets'], ['games', 'Video games']] },
      { key: 'difficulty', label: 'Difficulty', kind: 'choice', def: 'any', choices: [['any', 'Mixed'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']] },
    ],
    night: { rounds: 8 },
    rules: [
      'Everyone gets the same question with four choices (or true or false) and a timer.',
      'A right answer scores 500 points plus up to 500 more for speed. Three in a row and you get a streak bonus.',
      'Questions come from the Open Trivia Database, plus a set about India written for this game.',
    ],
    seo: { title: 'Multiplayer Trivia Quiz with Friends, Free', description: 'A free live trivia quiz for friends: same questions, a timer, speed bonuses and streaks. Pick a category and difficulty. Private rooms.', about: 'a live multiplayer trivia quiz' },
  },
  {
    id: 'wordgrid', name: 'Word Grid', emoji: '🔤', cat: 'Word',
    blurb: 'A grid of letters, a timer. Find words by chaining neighbouring letters.',
    min: 1, max: 20, minutes: [3, 0],
    dna: { skill: 4, luck: 2, social: 2, brain: 4, chaos: 1, replay: 5 }, moods: ['think', 'competitive'],
    options: [
      { key: 'size', label: 'Grid', kind: 'choice', def: 4, choices: [[4, '4 × 4'], [5, '5 × 5']] },
      { key: 'minutes', label: 'Time', kind: 'num', def: 2, min: 1, max: 5, unit: 'min' },
      { key: 'scoring', label: 'Scoring', kind: 'choice', def: 'unique', choices: [['unique', 'Only words nobody else found'], ['all', 'Every word counts']] },
    ],
    night: { minutes: 2 },
    rules: [
      'Make words from letters that touch, across, up, down or diagonally. You cannot use the same letter square twice in one word.',
      'Words must be at least 3 letters (4 on the 5 × 5 grid). Qu counts as two letters.',
      'Longer words score more: 3 or 4 letters 1 point, 5 letters 2, 6 letters 3, 7 letters 5, 8 or more 11.',
      'With the default scoring, a word found by two or more players scores nothing.',
    ],
    seo: { title: 'Boggle-Style Word Grid Game Online, Multiplayer', description: 'Find words in a grid of letters against your friends, in the style of Boggle. 4×4 or 5×5, unique-word scoring. Free, private rooms.', about: 'a word search game in the style of Boggle' },
  },
  {
    id: 'lastcard', name: 'Last Card', emoji: '🃏', cat: 'Cards & dice',
    blurb: 'Match the colour or number, play action cards, and do not forget to call last card.',
    min: 2, max: 10, minutes: [5, 1],
    dna: { skill: 2, luck: 4, social: 4, brain: 2, chaos: 4, replay: 5 }, moods: ['chaos', 'social', 'competitive'],
    options: [
      { key: 'hand', label: 'Cards each', kind: 'num', def: 7, min: 4, max: 10 },
      { key: 'stack', label: 'Stack +2 and +4', kind: 'choice', def: 'on', choices: [['on', 'Yes'], ['off', 'No']] },
      secs('turnSeconds', 'Seconds per turn', 30, 10, 90),
    ],
    night: { hand: 6 },
    rules: [
      'Play a card that matches the top card by colour, number or symbol. Wild cards go on anything and you choose the next colour.',
      'Skip misses the next player, Reverse changes direction, +2 and Wild +4 make the next player draw. With stacking on, they can pass it on with a +2 or +4 of their own.',
      'Cannot play? Draw one. If it fits, you can play it straight away.',
      'Down to one card? Tap Last card before anyone catches you, or you draw two.',
      'First to empty their hand wins; the rest are ranked by the fewest cards left.',
    ],
    seo: { title: 'Uno-Style Card Game Online with Friends, Free', description: 'Play an Uno-style card game online with 2 to 10 friends: action cards, wilds, stacking and Last Card calls. Free, private rooms, no sign-up.', about: 'a colour-matching card game in the style of Uno' },
  },
  {
    id: 'liarsdice', name: "Liar's Dice", emoji: '🎲', cat: 'Cards & dice',
    blurb: 'Hidden dice, rising bids, and one word: liar.',
    min: 2, max: 8, minutes: [3, 1.2],
    dna: { skill: 3, luck: 4, social: 4, brain: 3, chaos: 2, replay: 5 }, moods: ['deception', 'strategic', 'social'],
    options: [
      { key: 'dice', label: 'Dice each', kind: 'num', def: 5, min: 2, max: 6 },
      { key: 'wild', label: 'Ones are wild', kind: 'choice', def: 'on', choices: [['on', 'Yes'], ['off', 'No']] },
      secs('turnSeconds', 'Seconds per turn', 45, 15, 120),
    ],
    night: { dice: 4 },
    rules: [
      'Everyone rolls their dice in secret. Each turn, bid on how many dice of one face are on the whole table: "four 5s".',
      'The next player either bids higher (more dice, or the same number of a higher face) or calls Liar.',
      'On a call, all dice are shown. If there are at least as many as the bid said, the caller loses a die; if not, the bidder does. With ones wild, ones count as every face.',
      'Lose all your dice and you are out. Last player with dice wins.',
    ],
    seo: { title: "Liar's Dice Online with Friends, Free", description: "Play Liar's Dice online with 2 to 8 friends: hidden dice, bids and bluffs. Ones-wild option, turn timer, private rooms. Free, no sign-up.", about: "the bluffing dice game Liar's Dice" },
  },
  {
    id: 'reaction', name: 'Reaction', emoji: '⚡', cat: 'Reflex',
    blurb: 'Wait for green. Tap. Fastest finger wins, false starts lose.',
    min: 1, max: 30, minutes: [2, 0],
    dna: { skill: 4, luck: 2, social: 2, brain: 1, chaos: 3, replay: 4 }, moods: ['fast', 'competitive', 'chaos'],
    options: [rounds(6, 3, 15)],
    night: { rounds: 5 },
    rules: [
      'Each round, wait for the signal and tap as fast as you can. Tap too early and it is a false start: no points that round.',
      'Rounds vary: plain wait-for-green, decoy colours that must not be tapped, and a target that appears somewhere on the screen.',
      'The fastest player each round gets 10 points, then 7, 5, 4, 3, 2 and 1.',
    ],
    seo: { title: 'Reaction Time Test Game Multiplayer with Friends', description: 'Test your reaction time against friends: wait for green, tap first, avoid false starts and decoys. Free multiplayer reflex game, any device.', about: 'a multiplayer reaction time game' },
  },
  {
    id: 'closest', name: 'Closest Wins', emoji: '🎯', cat: 'Trivia',
    blurb: 'How tall is the Burj Khalifa? Nobody knows. Closest guess wins.',
    min: 2, max: 30, minutes: [4, 0],
    dna: { skill: 2, luck: 3, social: 3, brain: 3, chaos: 2, replay: 4 }, moods: ['think', 'social', 'competitive'],
    options: [rounds(8, 3, 20), secs('seconds', 'Seconds to answer', 30, 10, 90)],
    night: { rounds: 6 },
    rules: [
      'A question with a number for an answer: a height, a year, a distance, a count. Everyone types a guess.',
      'The closest guess scores 10 points, then 7, 5, 4, 3, 2 and 1. For big numbers, closeness is measured by ratio, so being off by half is the same at any size.',
    ],
    seo: { title: 'Estimation Game Online: Closest Guess Wins', description: 'A free estimation party game: how tall, how far, what year? Everyone guesses a number and the closest wins. Private rooms for friends.', about: 'an estimation quiz where the closest guess wins' },
  },
]

export const META: Record<string, Meta> = Object.fromEntries(CATALOG.map(m => [m.id, m]))

/** A game's settings with anything missing or out of range replaced. */
export function settings(id: string, raw: unknown, base?: Record<string, unknown>): Record<string, string | number> {
  const meta = META[id]
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: Record<string, string | number> = {}
  for (const o of meta.options) {
    const v = r[o.key] ?? base?.[o.key]
    if (o.kind === 'num') {
      const n = Math.round(Number(v))
      out[o.key] = Number.isFinite(n) ? Math.min(o.max!, Math.max(o.min!, n)) : o.def
    } else {
      const hit = o.choices!.find(([c]) => String(c) === String(v))
      out[o.key] = hit ? hit[0] : o.def
    }
  }
  return out
}

export const estMinutes = (m: Meta, players: number) => Math.round(m.minutes[0] + m.minutes[1] * players)
