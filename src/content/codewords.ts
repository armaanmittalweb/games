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
age air alarm album alien anchor angel ant arch arrow artist atom axe baby badge bag balloon bamboo banana bandage
barrel basket bath beam bean beard bee beetle bench berry bike bill bin bird biscuit blade blanket block blood blue
boat body bone bonus boss bottom bowl brain branch brass bubble bucket buffalo bulb bull bullet bus butter cabin
cable cactus cage calendar camp canal candle candy cannon canvas captain car carrot cart cash cave ceiling cement
chalk champion channel chapter cheese chef cherry chess chin cinema cliff climate cloak closet coat cobra coconut
coffee coin collar colony column comic compass computer cone cook cookie coral corn corner costume cottage couch
cow crab cradle crack cricket crocodile crow cube cup curtain cushion dart desert desk dinosaur dish diver dock
dolphin donkey door dove dream dress drink driver dryer dune ear earth echo edge elephant elbow emerald empire energy
envelope exam fairy feather fence ferry fever finger fog fox frame fridge fruit fuel fur galaxy gate gear gem genius
gift giraffe goal goat golf gorilla grape graph gravity guard guitar gum gym hair hall ham harbour hat hawk hay heel
hero highway hill hive hockey hook hoop horror hose house hunter hut igloo ink island ivory jacket jar jaw jeans
jelly jewel jungle kangaroo kettle kid kitchen knee knot ladle lake laser lawn lawyer leather leg lens library lid
lift lily limit lip liquid list lizard load lobster locker loop lorry magnet maid mango manager marker market
mars mat maze meal medal melon memory menu metal meter microscope mill minute mole monster motor mountain mud mug
museum music nest news nose notebook ocean office onion orbit oven owl ox pad page paint palace panda pants parade
parcel path paw peach peak pear pearl pebble pencil pepper perfume pet phone photo pie pig pillow pine pitch pizza
planet plant plastic plug pocket poem pony popcorn port potato powder prison pupil puppet purse puzzle pyramid quiz
rabbit raft rail rainbow ram rat razor record reef rice ride rifle road robe rod roof room rope rug ruby rule sail
salad sand sandwich sauce saw scarf science scissors scooter scorpion screw script seed shampoo sheep shell shield
shirt shorts shower sign silk silver singer skeleton ski skirt skull sky sled slide smoke snail soup spade spark
speaker spice spine sponge spoon stamp statue steam steel step stone stool stove sugar suit sumo swan sweater
sword syrup tablet tank tape taxi tea tent theatre thorn throne thumb ticket tile toast toilet tomato tongue tool
top tornado toy tractor traffic trap treasure trophy trumpet tunnel tyre valley vase vest village violin volcano
wagon waiter wallet wand war wardrobe wasp wax weed well wheat wheel whistle wig wire wizard wood wool yacht yoga zoo
`

const DESI = `
chai samosa dosa cricket rickshaw sari mango monsoon diwali holi bollywood tiffin dabba ludo carrom kite tabla sitar
peacock lotus tiger ganga himalaya taj gateway curry masala paneer roti biryani lassi kulfi jalebi rangoli diya bindi
mehndi bangle turban dhol baraat mandap pandal mela auto metro local scooter dhaba thali pickle chutney coconut neem
tulsi cow elephant cobra mongoose wicket bowler umpire sixer
idli vada poha upma khichdi dal rajma chole naan paratha puri pakoda bhaji kachori dhokla halwa ladoo barfi rasgulla
kheer raita papad achaar ghee jaggery imli elaichi haldi jeera saffron paan supari nimbu mirchi bhindi aloo gobhi
dhoti kurta lungi pagdi dupatta chappal jhumka anklet sherwani lehenga kolam aarti puja mantra yoga ashram guru
sadhu temple mandir gurudwara ghat kumbh garba dandiya bhangra kathak lavani dussehra navratri onam pongal bihu lohri
eid rakhi teej chhath conch
cycle tonga bullock tractor truck dabbawala chaiwala doodhwala kirana bazaar haveli fort palace jharokha courtyard
charpai chulha tawa kadai matka lota balti handpump chowk gully nukkad paanwala thela tempo jugaad hostel canteen
mumbai delhi kolkata chennai jaipur goa kerala kashmir ladakh punjab bengal sundarbans thar ganges yamuna narmada
kaveri brahmaputra everest kanyakumari rupee lakh crore paisa sensex budget census aadhaar ration panchayat sarpanch
tricolour chakra emblem anthem parade republic independence freedom satyagraha khadi charkha salt march
kabaddi gilli danda pithu chess hockey badminton wrestling akhada kushti pehlwan stadium ipl captain helmet
pitch boundary century duck spinner yorker bouncer innings toss
`

const words = (s: string) => [...new Set(s.trim().split(/\s+/))].map(w => w[0].toUpperCase() + w.slice(1))

export const BASE_WORDS = words(BASE)
export const DESI_WORDS = words(DESI).filter(w => !BASE_WORDS.includes(w))

type Deal = <T>(key: string, items: readonly T[], n: number) => T[]

/** 25 different words for a board, from the deck so boards keep bringing new words. The desi pack mixes in 9 desi words. */
export function board(pack: string, deal: Deal, shuffle: <T>(a: T[]) => T[]): string[] {
  if (pack !== 'desi') return shuffle(deal('codewords', BASE_WORDS, 25))
  return shuffle([...deal('codewords:desi', DESI_WORDS, 9), ...deal('codewords', BASE_WORDS, 16)])
}
