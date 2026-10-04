// Words to draw in Draw & Guess, by theme, and the phrases Telephone falls back on when someone writes nothing.

const THEMES: Record<string, string[]> = {
  easy: [
    'sun', 'moon', 'star', 'tree', 'house', 'car', 'ball', 'cat', 'dog', 'fish', 'apple', 'banana', 'book', 'chair', 'table',
    'clock', 'cup', 'shoe', 'hat', 'key', 'door', 'flower', 'heart', 'cloud', 'rain', 'umbrella', 'boat', 'bus', 'train',
    'kite', 'bird', 'egg', 'ice cream', 'cake', 'pencil', 'phone', 'glasses', 'bed', 'lamp', 'fan', 'bottle', 'bag',
    'rainbow', 'mountain', 'snowman', 'balloon', 'candle', 'ladder', 'spoon', 'fork', 'bridge', 'window', 'smile', 'eye',
    'hand', 'nose', 'tooth', 'bell', 'drum', 'guitar', 'rocket', 'robot', 'crown', 'ring', 'gift', 'pizza', 'bicycle',
  ],
  animals: [
    'elephant', 'giraffe', 'lion', 'tiger', 'monkey', 'snake', 'crocodile', 'zebra', 'kangaroo', 'penguin', 'owl', 'parrot',
    'peacock', 'camel', 'cow', 'buffalo', 'goat', 'horse', 'donkey', 'rabbit', 'mouse', 'frog', 'turtle', 'octopus',
    'jellyfish', 'shark', 'whale', 'dolphin', 'crab', 'spider', 'butterfly', 'bee', 'ant', 'mosquito', 'snail', 'bat',
    'squirrel', 'hedgehog', 'panda', 'koala', 'deer', 'bear', 'wolf', 'fox', 'duck', 'hen', 'eagle', 'flamingo', 'dinosaur',
    'unicorn', 'lizard', 'cockroach', 'pig', 'sheep', 'rhino', 'hippo', 'starfish', 'seahorse', 'worm', 'scorpion',
  ],
  food: [
    'pizza', 'burger', 'sandwich', 'noodles', 'french fries', 'popcorn', 'donut', 'cupcake', 'chocolate', 'lollipop',
    'watermelon', 'mango', 'grapes', 'pineapple', 'coconut', 'strawberry', 'cherry', 'carrot', 'tomato', 'onion', 'potato',
    'corn', 'egg', 'cheese', 'bread', 'butter', 'milk', 'tea', 'coffee', 'juice', 'cookie', 'cake', 'ice cream', 'soup',
    'sushi', 'hot dog', 'taco', 'pancake', 'honey', 'peanut', 'chilli', 'lemon', 'orange', 'pear', 'brinjal', 'cucumber',
    'mushroom', 'pumpkin', 'banana split', 'birthday cake', 'pasta', 'salad', 'omelette', 'toast', 'cereal',
  ],
  desi: [
    'samosa', 'jalebi', 'chai', 'dosa', 'idli', 'pani puri', 'vada pav', 'biryani', 'roti', 'paratha', 'lassi', 'kulfi',
    'ladoo', 'gulab jamun', 'pav bhaji', 'rangoli', 'diya', 'kite', 'rickshaw', 'auto rickshaw', 'cricket bat', 'stumps',
    'Taj Mahal', 'India Gate', 'Qutub Minar', 'Lotus Temple', 'turban', 'saree', 'kurta', 'bindi', 'mehndi', 'bangles',
    'tabla', 'sitar', 'harmonium', 'dhol', 'peacock', 'elephant', 'cow', 'mango', 'coconut tree', 'tiffin', 'pressure cooker',
    'tawa', 'chapati', 'matka', 'charpai', 'ceiling fan', 'scooter', 'local train', 'dabbawala', 'chai stall', 'pandal',
    'Ganesha', 'Holi', 'Diwali', 'firecracker', 'jhula', 'tiranga', 'Ashoka Chakra', 'lotus', 'tulsi', 'bullock cart',
    'nimbu mirchi', 'pagdi', 'gilli danda', 'carrom board', 'ludo', 'auto', 'bus conductor', 'thali', 'paan', 'chakli',
  ],
  actions: [
    'sleeping', 'running', 'swimming', 'dancing', 'singing', 'cooking', 'reading', 'writing', 'jumping', 'crying', 'laughing',
    'eating', 'drinking', 'sneezing', 'yawning', 'fishing', 'flying', 'driving', 'cycling', 'climbing', 'falling', 'fighting',
    'hugging', 'waving', 'clapping', 'thinking', 'praying', 'shopping', 'painting', 'skating', 'surfing', 'skiing', 'juggling',
    'bowling', 'batting', 'kicking', 'throwing', 'catching', 'brushing teeth', 'taking a selfie', 'texting', 'snoring',
    'sweeping', 'ironing', 'washing clothes', 'raining', 'melting', 'exploding', 'whistling', 'lifting weights', 'meditating',
  ],
  places: [
    'beach', 'school', 'hospital', 'airport', 'railway station', 'temple', 'church', 'mosque', 'park', 'zoo', 'farm', 'forest',
    'desert', 'island', 'volcano', 'waterfall', 'cave', 'castle', 'museum', 'library', 'cinema', 'restaurant', 'kitchen',
    'bathroom', 'bedroom', 'classroom', 'playground', 'market', 'mall', 'bank', 'police station', 'fire station', 'circus',
    'stadium', 'swimming pool', 'gym', 'office', 'space station', 'moon', 'lighthouse', 'bus stop', 'petrol pump', 'village',
    'city', 'river', 'lake', 'hill station', 'tent', 'igloo', 'pyramid', 'Eiffel Tower', 'Statue of Liberty',
  ],
  tech: [
    'laptop', 'keyboard', 'mouse', 'headphones', 'charger', 'Wi-Fi', 'password', 'email', 'bug', 'robot', 'drone', 'satellite',
    'battery', 'USB', 'printer', 'camera', 'smartwatch', 'selfie stick', 'hashtag', 'emoji', 'like button', 'cloud', 'server',
    'code', 'loading', 'error', 'game controller', 'virtual reality', 'QR code', 'barcode', 'calculator', 'microchip',
    'exam', 'hostel', 'canteen', 'assignment', 'deadline', 'professor', 'attendance', 'library card', 'degree', 'notebook',
    'backpack', 'whiteboard', 'projector', 'lab coat', 'microscope', 'test tube', 'calendar', 'alarm clock', 'coffee mug',
    'all-nighter', 'group project', 'placement', 'internship', 'resume', 'video call', 'mute button', 'screenshot',
  ],
}

export function drawWords(theme: string): string[] {
  if (theme !== 'mixed' && THEMES[theme]) return THEMES[theme]
  return [...new Set([...THEMES.easy, ...THEMES.animals, ...THEMES.food, ...THEMES.desi, ...THEMES.actions, ...THEMES.places, ...THEMES.tech])]
}

export const TELEPHONE_STARTS: string[] = [
  'A monkey riding a rocket', 'An elephant doing yoga', 'A cat stealing samosas', 'Grandma winning a dance battle',
  'A cow stuck in traffic', 'A dinosaur at a wedding', 'A ghost eating ice cream', 'A robot making chai',
  'A fish riding a bicycle', 'A penguin on a beach holiday', 'A tiger at the barber shop', 'An alien buying vegetables',
  'Cricket match on the moon', 'A snake playing the flute', 'A pizza with too many toppings', 'A superhero afraid of cockroaches',
  'A goat taking a selfie', 'A teacher asleep in class', 'A king lost in a mall', 'A crocodile brushing its teeth',
  'Two dogs having a phone call', 'A chicken crossing a busy road', 'An auto rickshaw flying in the sky', 'A shark at a birthday party',
  'A camel in the snow', 'A baby driving a bus', 'A cloud raining laddoos', 'A giraffe wearing a tie', 'A bear stuck in a lift',
  'A volcano erupting popcorn', 'A wizard doing homework', 'An owl working night shift', 'A pirate looking for Wi-Fi',
  'A mosquito at the gym', 'A horse in a swimming pool', 'A frog proposing to a princess', 'A banana slipping on a person',
  'A tree wearing sunglasses', 'Santa Claus in Mumbai local train', 'A lion scared of a mouse', 'An astronaut eating dosa',
  'A spider knitting a sweater', 'A cat ruling the world', 'A dragon making toast', 'Bollywood hero fighting ten villains',
  'A family on one scooter', 'A peacock dancing in the rain', 'A potato with a moustache', 'A mango that can talk',
  'The last slice of pizza', 'A selfie with a lion', 'A zombie at a job interview', 'An octopus playing drums',
]
