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
  cat: 'Word' | 'Drawing' | 'Party' | 'Deception' | 'Trivia' | 'Puzzle' | 'Strategy' | 'Cards' | 'Reflex'
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
    id: 'draw', name: 'Draw & Guess', cat: 'Drawing',
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
    id: 'imposter', name: 'Imposter', cat: 'Deception',
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
    id: 'codewords', name: 'Code Words', cat: 'Word', teams: true,
    blurb: 'Two teams. Spymasters give one-word clues to lead teammates to their agents.',
    min: 4, max: 16, minutes: [12, 0],
    dna: { skill: 4, luck: 1, social: 4, brain: 5, chaos: 2, replay: 5 }, moods: ['think', 'social', 'strategic'],
    options: [
      { key: 'timer', label: 'Turn timer', kind: 'choice', def: 120, choices: [[60, '1 minute'], [120, '2 minutes'], [180, '3 minutes'], [0, 'Off']] },
      { key: 'pack', label: 'Words', kind: 'choice', def: 'mixed', choices: [['mixed', 'Mixed'], ['desi', 'With desi words']] },
      { key: 'black', label: 'Black cards', kind: 'choice', def: 1, choices: [[1, '1 (classic)'], [2, '2'], [3, '3 (risky)'], [4, '4 (very risky)']] },
    ],
    night: { timer: 120 },
    rules: [
      'Players split into Red and Blue, and each team picks a spymaster. The spymasters see which of the 25 words belong to which team.',
      'On their turn a spymaster gives a one-word clue and a number: how many words it points to.',
      'Teammates tap words to reveal them. A right guess lets them keep going (up to the number plus one). A neutral word or the other team\'s word ends the turn.',
      'First team to find all its agents wins. Reveal a black card (the assassin) and your team loses at once. The host can add up to 4 black cards for a riskier board.',
    ],
    seo: { title: 'Codenames-Style Word Game Online for Teams', description: 'A free team word game in the style of Codenames: spymasters give one-word clues, teams find their agents and avoid the assassin. Private rooms.', about: 'a team word-association game in the style of Codenames' },
  },
  {
    id: 'wordle', name: 'Word Race', cat: 'Word',
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
    id: 'telephone', name: 'Telephone', cat: 'Drawing',
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
    id: 'bluff', name: 'Dictionary Bluff', cat: 'Word',
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
    id: 'mindmeld', name: 'Mind Meld', cat: 'Party',
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
    id: 'mostlikely', name: 'Most Likely To', cat: 'Party',
    blurb: 'Who is most likely to… Everyone points at once. Score by agreeing with the room.',
    min: 3, max: 20, minutes: [3, 0],
    dna: { skill: 1, luck: 2, social: 5, brain: 1, chaos: 4, replay: 4 }, moods: ['social', 'chaos', 'fast'],
    options: [
      rounds(8, 3, 30), secs('seconds', 'Seconds to vote', 20, 10, 60),
      { key: 'pack', label: 'Questions', kind: 'choice', def: 'classic', choices: [['classic', 'Clean'], ['mixed', 'Mixed'], ['spicy', 'Spicy']] },
    ],
    night: { rounds: 6 },
    rules: [
      'A prompt appears: "Who is most likely to survive a zombie apocalypse?" Everyone secretly votes for a player.',
      'Pick the questions: Clean (fine for family, and the default), Spicy (dating, exes, parties and roasts) or Mixed.',
      'The votes are revealed together, and the most-voted player takes the title.',
      'You score 2 points when you voted for the player who got the most votes.',
    ],
    seo: { title: 'Most Likely To Questions Game Online with Friends', description: 'Play Most Likely To online: secret votes, live results and titles for your friends. Thousands of questions, clean or spicy. Free private rooms.', about: 'the Most Likely To party game' },
  },
  {
    id: 'trivia', name: 'Trivia', cat: 'Trivia',
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
    id: 'wordgrid', name: 'Word Grid', cat: 'Word',
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
    id: 'lastcard', name: 'Last Card', cat: 'Cards',
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
    id: 'reaction', name: 'Reaction', cat: 'Reflex',
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
    id: 'stopwatch', name: 'Stop the Clock', cat: 'Reflex',
    blurb: 'Start a hidden stopwatch and stop it at exactly 7.30 seconds, by feel. Closest wins.',
    min: 1, max: 30, minutes: [2, 0],
    dna: { skill: 4, luck: 2, social: 2, brain: 2, chaos: 3, replay: 5 }, moods: ['fast', 'competitive', 'chaos'],
    options: [rounds(5, 3, 12)],
    night: { rounds: 4 },
    rules: [
      'Each round shows a target time, like 7.30 seconds.',
      'Tap Start whenever you are ready, count in your head, and tap Stop when you think exactly that much time has passed. The stopwatch is never shown while it runs.',
      'Your real time appears the moment you stop. All the times are shown once everyone has stopped.',
      'The closest stop scores 10 points, then 7, 5, 4, 3, 2 and 1. Within a hundredth of a second is a perfect stop: 3 bonus points.',
    ],
    seo: { title: 'Stop the Clock: Stopwatch Timing Game with Friends', description: 'Start a hidden stopwatch and stop it at exactly the target time, by feel. A free multiplayer timing game for friends: closest wins.', about: 'a stopwatch timing challenge' },
  },
  {
    id: 'closest', name: 'Closest Wins', cat: 'Trivia',
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
  {
    id: 'connections', name: 'Connections', cat: 'Puzzle',
    blurb: 'Sixteen words, four hidden groups. Find them before you make four mistakes.',
    min: 1, max: 30, minutes: [4, 0],
    dna: { skill: 4, luck: 1, social: 2, brain: 5, chaos: 1, replay: 4 }, moods: ['think', 'competitive'],
    options: [{ key: 'puzzles', label: 'Boards', kind: 'num', def: 1, min: 1, max: 5 }, secs('seconds', 'Seconds per board', 240, 60, 600)],
    night: { puzzles: 1 },
    rules: [
      'Sixteen words hide four groups of four: things that share something. Some words look like they fit two groups.',
      'Pick four words and submit. Right, and the group locks in; wrong, and you lose one of four lives. "One away" means three of your four are right.',
      'Everyone solves the same board on their own. 5 points for each group, and a bonus of 5, 3, 2 and 1 for the first to solve it all.',
    ],
    seo: { title: 'Connections Word Game with Friends Online', description: 'Play a Connections-style word puzzle with friends: sixteen words, four groups, four mistakes. Everyone races on the same board. Free, no sign-up.', about: 'a group-finding word puzzle like Connections' },
  },
  {
    id: 'geoguess', name: 'GeoGuess', cat: 'Trivia',
    blurb: 'A country or city is named. Drop your pin on the world map. Closest wins.',
    min: 1, max: 30, minutes: [5, 0],
    dna: { skill: 4, luck: 2, social: 2, brain: 4, chaos: 1, replay: 4 }, moods: ['think', 'competitive'],
    options: [
      rounds(8, 3, 20, 'Places'), secs('seconds', 'Seconds per place', 30, 10, 90),
      { key: 'mode', label: 'Places', kind: 'choice', def: 'mixed', choices: [['mixed', 'Mixed'], ['countries', 'Countries'], ['capitals', 'Capitals'], ['cities', 'Popular cities']] },
    ],
    night: { rounds: 6 },
    rules: [
      'A place is named: a country, a capital or a city. Drag and zoom the world map and tap to drop your pin, then lock it in.',
      'A pin inside the country, or right on the city, scores 100. Points fall away with every kilometre you are off.',
      'Every one of the 195 countries can come up, so tiny islands too. The map shows India\'s borders as India draws them.',
    ],
    seo: { title: 'Geography Map Game with Friends: Pin the Place', description: 'A free multiplayer geography game: a country or city is named and everyone drops a pin on the world map. Closest pin wins. Private rooms.', about: 'a pin-the-place geography game' },
  },
  {
    id: 'musicguess', name: 'Music Guess', cat: 'Trivia',
    blurb: 'Two seconds of a Bollywood song. Name it before your friends do.',
    min: 1, max: 30, minutes: [4, 0],
    dna: { skill: 3, luck: 2, social: 3, brain: 2, chaos: 2, replay: 4 }, moods: ['fast', 'competitive', 'social'],
    options: [rounds(10, 3, 30, 'Songs'), secs('seconds', 'Seconds per song', 25, 10, 60)],
    night: { rounds: 8 },
    rules: [
      'Everyone hears the same two seconds of a Bollywood song (turn your sound on) and picks it from four.',
      'Right on the two-second clip: 10 points. Halfway through, a five-second clip unlocks; right after that: 5 points.',
      'Songs from the 1950s to today. The clips are Apple Music previews.',
    ],
    seo: { title: 'Guess the Bollywood Song Game Online', description: 'Hear two seconds of a Bollywood song and guess it before your friends. Hundreds of songs from every decade. Free multiplayer, no sign-up.', about: 'a Bollywood guess-the-song game' },
  },
  {
    id: 'movieguess', name: 'Movie Guess', cat: 'Trivia',
    blurb: 'Name the film from emojis. A story and a famous line follow if you need them.',
    min: 1, max: 30, minutes: [5, 0],
    dna: { skill: 3, luck: 2, social: 4, brain: 3, chaos: 2, replay: 4 }, moods: ['social', 'think', 'competitive'],
    options: [
      rounds(8, 3, 20, 'Films'), secs('seconds', 'Seconds per film', 45, 20, 90),
      { key: 'pack', label: 'Films', kind: 'choice', def: 'mixed', choices: [['mixed', 'Mixed'], ['bollywood', 'Indian films'], ['hollywood', 'English films']] },
    ],
    night: { rounds: 6 },
    rules: [
      'A film is shown as emojis. Type its name.',
      'A third of the way in, a one-line story appears; two thirds in, a famous dialogue (or the first letters of the title).',
      'Get it on the emojis alone for 10 points, after the story for 6, after the last clue for 3. Small spelling slips are fine.',
    ],
    seo: { title: 'Guess the Movie from Emojis: Bollywood and Hollywood', description: 'Guess the film from emojis, a one-line story and a famous dialogue. Bollywood and Hollywood. Free multiplayer game for friends.', about: 'a guess-the-movie game with emoji clues' },
  },
  {
    id: 'mastermind', name: 'Mastermind', cat: 'Puzzle',
    blurb: 'Crack the secret colour code in as few guesses as you can. Play alone, or race your friends on the same code.',
    min: 1, max: 6, minutes: [6, 0],
    dna: { skill: 5, luck: 1, social: 1, brain: 5, chaos: 1, replay: 4 }, moods: ['think', 'strategic', 'competitive'],
    options: [
      { key: 'rounds', label: 'Codes', kind: 'num', def: 2, min: 1, max: 8 }, secs('seconds', 'Seconds per code', 240, 60, 600),
      { key: 'pegs', label: 'Code length', kind: 'choice', def: 4, choices: [[4, '4 pegs'], [5, '5 pegs']] },
      { key: 'colors', label: 'Colours', kind: 'choice', def: 6, choices: [[6, '6 colours'], [8, '8 colours']] },
      { key: 'repeats', label: 'Repeat colours', kind: 'choice', def: 'no', choices: [['no', 'No'], ['yes', 'Yes']] },
    ],
    night: { rounds: 2 },
    rules: [
      'There is a secret code of coloured pegs. Make a guess; you are told how many pegs are the right colour in the right place (✓) and how many are the right colour in the wrong place (↔).',
      'Use that to narrow it down. You have ten guesses. Your guesses are yours alone; others only see how many you have used.',
      'The fewest guesses cracks it best (speed breaks a tie): 10 points, then 7, 5, 4, 3, 2, 1.',
    ],
    seo: { title: 'Mastermind Online: Crack the Code Alone or With Friends', description: 'Play Mastermind online, alone or with friends racing to crack the same colour code in the fewest guesses. Free, no sign-up.', about: 'the code-breaking game Mastermind' },

  },
  {
    id: 'territory', name: 'Territory', cat: 'Strategy',
    blurb: 'Grab squares on a shared map. Everyone moves at once, and clashes cancel out.',
    min: 2, max: 8, minutes: [6, 0.5],
    dna: { skill: 4, luck: 2, social: 3, brain: 4, chaos: 3, replay: 5 }, moods: ['strategic', 'competitive', 'chaos'],
    options: [
      secs('seconds', 'Seconds per turn', 12, 5, 30),
      { key: 'size', label: 'Map', kind: 'choice', def: 'normal', choices: [['small', 'Small'], ['normal', 'Normal'], ['big', 'Big']] },
    ],
    night: { seconds: 10, size: 'small' },
    rules: [
      'Everyone starts with one square. Each turn, secretly pick one free square next to your land.',
      'All picks are shown at once. If two players pick the same square, nobody gets it.',
      'Wall off a free area so that only your land touches it, and the whole area becomes yours. Rocks block the way.',
      'The game ends when nobody can grow. Most squares wins.',
    ],
    seo: { title: 'Territory Game Online: Claim the Map with Friends', description: 'A simultaneous-move territory game for 2 to 8 friends: claim squares, block rivals, wall off land. Free online, no sign-up.', about: 'a simultaneous territory-claiming strategy game' },
  },
  {
    id: 'auction', name: 'Auction', cat: 'Strategy',
    blurb: 'Everyone gets 100 coins. Bid on lots, collect sets, and do not spend it all.',
    min: 2, max: 10, minutes: [7, 0],
    dna: { skill: 3, luck: 3, social: 4, brain: 4, chaos: 3, replay: 5 }, moods: ['strategic', 'social', 'competitive'],
    options: [
      { key: 'lots', label: 'Lots', kind: 'choice', def: 12, choices: [[9, '9 lots'], [12, '12 lots'], [15, '15 lots']] },
      secs('seconds', 'Seconds per lot', 12, 6, 30),
    ],
    night: { lots: 9 },
    rules: [
      'Everyone starts with 100 coins. Lots come up one at a time; raise the bid by 1, 5, 10 or any amount. When the clock runs out, the top bid wins and pays.',
      'Each lot is worth points. Three lots from one set earn 10 more. Mystery lots hide their worth (0 to 20) until they are sold.',
      'Every 10 coins left at the end is worth 1 point. Most points wins.',
    ],
    seo: { title: 'Auction Game Online with Friends: Bid and Collect', description: 'A free live auction party game: 100 coins each, bid on lots, collect sets, keep some cash. 2 to 10 players, no sign-up.', about: 'a live bidding auction game' },
  },
  {
    id: 'make24', name: '24 Game', cat: 'Puzzle',
    blurb: 'Four numbers. Add, subtract, multiply and divide to make 24. First to get it wins most.',
    min: 1, max: 30, minutes: [4, 0],
    dna: { skill: 5, luck: 1, social: 1, brain: 5, chaos: 1, replay: 4 }, moods: ['think', 'fast', 'competitive'],
    options: [
      rounds(8, 3, 20, 'Hands'), secs('seconds', 'Seconds per hand', 60, 20, 180),
      { key: 'level', label: 'Difficulty', kind: 'choice', def: 'mixed', choices: [['mixed', 'Easy and medium'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']] },
    ],
    night: { rounds: 6 },
    rules: [
      'Four numbers from 1 to 13. Use each one exactly once, with + − × and ÷, to make 24.',
      'Tap a number, an operation and another number to combine them; keep going until one number is left. Undo any time.',
      'Every hand can be solved. First to 24 scores 10, then 7, 5, 4, 3, 2, 1. Hard hands need a fraction along the way.',
    ],
    seo: { title: '24 Game Online: Make 24 with Friends', description: 'Play the 24 maths game with friends: four numbers, make 24 with + − × ÷. Every hand is solvable. Free multiplayer, no sign-up.', about: 'the 24 maths puzzle' },
  },
]

export const META: Record<string, Meta> = Object.assign(Object.create(null), Object.fromEntries(CATALOG.map(m => [m.id, m])))

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
