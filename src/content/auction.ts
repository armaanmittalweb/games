// Auction lots, in sets. A game puts three sets up for sale, four lots from each. Points are what a lot is worth at
// the end; a mystery lot shows "?" until it is sold (some are duds, some are jackpots).
export interface Lot { name: string; set: string; pts: number; mystery?: boolean }

const S = (set: string, lots: [string, number, boolean?][]): Lot[] => lots.map(([name, pts, mystery]) => ({ name, set, pts, ...(mystery ? { mystery } : {}) }))

export const LOTS_BY_SET: Record<string, Lot[]> = {
  Cricket: S('Cricket', [
    ['Bat signed by the 2011 World Cup team', 12], ['Stump from a last-ball finish', 8], ['Gully cricket tennis ball, very old', 2],
    ['Cap worn in a Test debut', 7], ['Commentary box microphone', 5], ['Stadium seat from Eden Gardens', 6],
    ['Sealed box from a sports shop', 0, true], ['A locker from a team dressing room', 15, true], ['Pair of pads, slightly smelly', 3],
  ]),
  Bollywood: S('Bollywood', [
    ['Train ticket from a famous film climax', 9], ['Leather jacket from a 90s hero', 7], ['Hand-painted film poster', 6],
    ['Script with a superstar\'s notes', 11], ['Director\'s chair, a bit wobbly', 4], ['Dance shoes from an item song', 5],
    ['Unlabelled film reel', 18, true], ['Trunk from a studio storeroom', 1, true], ['Sunglasses from a slow-motion entry', 8],
  ]),
  'Street food': S('Street food', [
    ['Famous pani puri cart', 10], ['Vada pav stall near a station', 9], ['Chai tapri with loyal customers', 6],
    ['Momo stand outside a college', 7], ['Secret chole bhature recipe', 12], ['Jalebi pan, 40 years old', 4],
    ['Unmarked spice box', 16, true], ['Food truck that needs repair', 2, true], ['Golgappa water formula', 8],
  ]),
  Gadgets: S('Gadgets', [
    ['The very first phone you had', 3], ['Gaming console, never opened', 9], ['Drone with a camera', 7],
    ['Old laptop full of photos', 5], ['Noise-cancelling headphones', 6], ['Smartwatch that counts steps wrong', 2],
    ['Locked phone found in a cab', 0, true], ['Box from a tech launch event', 14, true], ['Retro music player', 8],
  ]),
  Cars: S('Cars', [
    ['Vintage Ambassador, white', 9], ['Bright yellow scooter', 5], ['Classic Royal Enfield', 10], ['Old jeep for road trips', 8],
    ['Toy car collection', 3], ['Racing helmet', 4], ['Car with a sealed boot', 17, true], ['Rusty three-wheeler', 1, true], ['Taxi with a lucky number plate', 7],
  ]),
  Art: S('Art', [
    ['Painting of a monsoon street', 8], ['Madhubani artwork', 9], ['Clay pot from a famous potter', 5], ['Sketch by an unknown artist', 3],
    ['Bronze dancer statue', 11], ['Truck art panel', 6], ['Painting under a sheet', 20, true], ['Frame with no picture in it', 0, true], ['Wall mural photo print', 4],
  ]),
  Jewels: S('Jewels', [
    ['Gold necklace from a royal family', 12], ['Pearl earrings', 7], ['Silver anklets', 4], ['Emerald ring', 10],
    ['Glass bangles (lots of them)', 2], ['Old coin pendant', 5], ['Velvet box, locked', 15, true], ['Shiny stone, maybe fake', 1, true], ['Kundan choker', 9],
  ]),
  Music: S('Music', [
    ['Harmonium from a music teacher', 6], ['Tabla set', 7], ['Signed guitar', 11], ['Vinyl of a 70s film album', 8],
    ['Cassette of a wedding playlist', 2], ['Karaoke machine', 4], ['Case with no label', 16, true], ['Broken flute', 0, true], ['Sitar from a concert hall', 10],
  ]),
  Travel: S('Travel', [
    ['Houseboat in Kashmir for a week', 11], ['Goa beach shack for a season', 9], ['Train pass for all of India', 10],
    ['Trek to a Himalayan base camp', 8], ['Old travel map with notes', 3], ['Backpack that has seen 20 countries', 4],
    ['Sealed envelope "Trip"', 18, true], ['Ticket with no date', 1, true], ['Stay in a desert camp', 6],
  ]),
  Pets: S('Pets', [
    ['Golden retriever puppy (cuddles included)', 10], ['Talking parrot', 7], ['Lazy cat that judges you', 6], ['Aquarium with goldfish', 4],
    ['Rabbit that eats everything', 5], ['Dog bed, well used', 2], ['Basket that is moving', 15, true], ['Empty cage', 0, true], ['Tortoise, 80 years old', 9],
  ]),
  Books: S('Books', [
    ['First print of a famous novel', 11], ['Grandma\'s recipe diary', 9], ['Comic collection from the 90s', 7], ['School notebook of a topper', 4],
    ['Signed autobiography', 8], ['Old dictionary', 2], ['Book with a locked cover', 17, true], ['Notebook full of doodles', 1, true], ['Poetry book with letters inside', 6],
  ]),
  Sports: S('Sports', [
    ['Football signed by a club team', 9], ['Kabaddi league jersey', 6], ['Hockey stick from the 80s', 8], ['Badminton racket of a champion', 10],
    ['Chess set from a tournament', 7], ['Gym membership, never used', 2], ['Kit bag with a tag', 14, true], ['Deflated football', 0, true], ['Boxing gloves', 5],
  ]),
}

export const SETS = Object.keys(LOTS_BY_SET)
export const LOTS: Lot[] = Object.values(LOTS_BY_SET).flat()
