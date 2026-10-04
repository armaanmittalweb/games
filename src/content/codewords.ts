// Code Words board words: short everyday nouns, many with more than one meaning, which is what makes clues fun.

const BASE = `
apple arm army back ball band bank bar bark bat battery beach bear bed bell belt berlin board bolt bomb bond book boot
bottle bow box bread brick bridge brush bug button cake camel camera cap capital card carpet cast castle cat cell chain
chair change charge check chest chicken china chip chocolate church circle clock cloud club coach code cold comb comet
compound concert copper cotton court cover crane crash crown cycle dance date day deck diamond dice doctor dog doll
dragon drill drop drum duck dust eagle egg engine eye face fair fall fan farm field fight file film fire fish flag
flute fly foot fork forest fountain frog game garden gas ghost giant glass glove gold grass ground hammer hand heart
helicopter hole honey hood horn horse hospital hotel ice iron jack jam jet joker judge key king kite knife knight lab
ladder lamp lead leaf lemon letter life light line lion lock log luck magic mail map marble mask match milk mine mint
mirror model money monkey moon mouse mouth nail needle net night note nurse nut octopus oil olive opera orange organ
palm pan paper park parrot party pass pen penguin piano pilot pin pipe pirate pit plane plate plot point poison pole
police pool post pot press prince pump queen rabbit racket radio rain ring river robot rock rocket roll root rose round
ruler salt satellite school scale screen sea seal server shadow shark ship shoe shop shot sink skate slip snake snow
soap sock soldier space spider spike spring spy square stable staff star station stick stock storm straw stream string
sun swing table tail tap teacher temple tennis thread tick tie tiger time tooth torch tower track train tree triangle
truck trunk tube turtle umbrella unicorn van vet wall watch water wave web whale whip wind window wing witch wolf worm
yard zero
`

const DESI = `
chai samosa dosa cricket rickshaw sari mango monsoon diwali holi bollywood tiffin dabba ludo carrom kite tabla sitar
peacock lotus tiger ganga himalaya taj gateway curry masala paneer roti biryani lassi kulfi jalebi rangoli diya bindi
mehndi bangle turban dhol baraat mandap pandal mela auto metro local scooter dhaba thali pickle chutney coconut neem
tulsi cow elephant cobra mongoose wicket bowler umpire sixer
`

const words = (s: string) => s.trim().split(/\s+/).map(w => w[0].toUpperCase() + w.slice(1))

/** 25 different words for a board. The desi pack mixes in 9 desi words. */
export function board(pack: string, shuffle: <T>(a: T[]) => T[]): string[] {
  const base = shuffle(words(BASE))
  if (pack !== 'desi') return base.slice(0, 25)
  const desi = shuffle(words(DESI)).slice(0, 9)
  return shuffle([...desi, ...base.filter(w => !desi.includes(w)).slice(0, 16)])
}
