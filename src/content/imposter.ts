// Imposter word pairs. The group gets one word; in Undercover the imposter gets the other, close enough that they do
// not notice at first. In the classic mode the imposter only sees the category.

export interface Pair { cat: string; a: string; b: string }

const P = (cat: string, list: [string, string][]) => list.map(([a, b]) => ({ cat, a, b }))

export const IMPOSTER_PAIRS: Pair[] = [
  ...P('Food', [
    ['Samosa', 'Kachori'], ['Pizza', 'Burger'], ['Dosa', 'Uttapam'], ['Idli', 'Dhokla'], ['Biryani', 'Pulao'], ['Pani puri', 'Bhel puri'],
    ['Jalebi', 'Imarti'], ['Gulab jamun', 'Rasgulla'], ['Momos', 'Dumplings'], ['Maggi', 'Pasta'], ['Paratha', 'Naan'],
    ['Chole bhature', 'Puri sabzi'], ['Pav bhaji', 'Vada pav'], ['Ice cream', 'Kulfi'], ['Chocolate', 'Toffee'], ['Sandwich', 'Wrap'],
    ['Cake', 'Pastry'], ['Popcorn', 'Chips'], ['Rajma chawal', 'Kadhi chawal'], ['Butter chicken', 'Paneer butter masala'],
    ['Lassi', 'Buttermilk'], ['Tea', 'Coffee'], ['Coconut water', 'Sugarcane juice'], ['Mango', 'Papaya'], ['Banana', 'Apple'],
    ['Watermelon', 'Muskmelon'], ['Ladoo', 'Barfi'], ['Khichdi', 'Daliya'], ['Poha', 'Upma'], ['Omelette', 'Bhurji'],
  ]),
  ...P('Places', [
    ['Beach', 'Swimming pool'], ['School', 'College'], ['Hospital', 'Clinic'], ['Airport', 'Railway station'], ['Mall', 'Market'],
    ['Cinema hall', 'Theatre'], ['Temple', 'Gurudwara'], ['Library', 'Bookshop'], ['Gym', 'Yoga class'], ['Park', 'Garden'],
    ['Hill station', 'Beach resort'], ['Goa', 'Kerala'], ['Manali', 'Shimla'], ['Mumbai', 'Delhi'], ['Hostel', 'PG'],
    ['Office', 'Co-working space'], ['Zoo', 'Safari'], ['Restaurant', 'Dhaba'], ['Bank', 'ATM'], ['Wedding hall', 'Banquet'],
  ]),
  ...P('Things', [
    ['Umbrella', 'Raincoat'], ['Laptop', 'Tablet'], ['Phone', 'Smartwatch'], ['Pen', 'Pencil'], ['Fan', 'Cooler'],
    ['Pillow', 'Blanket'], ['Toothbrush', 'Comb'], ['Shoes', 'Slippers'], ['Watch', 'Bracelet'], ['Backpack', 'Suitcase'],
    ['Mirror', 'Window'], ['Candle', 'Diya'], ['Scissors', 'Knife'], ['Bucket', 'Mug'], ['Chair', 'Stool'], ['Sofa', 'Bed'],
    ['Headphones', 'Earphones'], ['Camera', 'Binoculars'], ['Key', 'Lock'], ['Wallet', 'Purse'], ['Book', 'Newspaper'],
    ['Television', 'Projector'], ['Pressure cooker', 'Kadai'], ['Fridge', 'Freezer'], ['Sunglasses', 'Spectacles'],
  ]),
  ...P('Animals', [
    ['Lion', 'Tiger'], ['Dog', 'Wolf'], ['Cat', 'Leopard'], ['Horse', 'Donkey'], ['Crocodile', 'Lizard'], ['Eagle', 'Parrot'],
    ['Cow', 'Buffalo'], ['Monkey', 'Gorilla'], ['Shark', 'Dolphin'], ['Rabbit', 'Squirrel'], ['Butterfly', 'Moth'],
    ['Snake', 'Earthworm'], ['Camel', 'Giraffe'], ['Duck', 'Swan'], ['Bee', 'Wasp'], ['Frog', 'Toad'], ['Mosquito', 'Fly'],
  ]),
  ...P('Sports and games', [
    ['Cricket', 'Baseball'], ['Football', 'Hockey'], ['Badminton', 'Tennis'], ['Chess', 'Carrom'], ['Ludo', 'Snakes and ladders'],
    ['Kabaddi', 'Kho-kho'], ['Swimming', 'Diving'], ['Boxing', 'Wrestling'], ['PUBG', 'Free Fire'], ['Cycling', 'Running'],
    ['Table tennis', 'Squash'], ['Volleyball', 'Basketball'], ['Gilli danda', 'Pithu'], ['Cards', 'Dice'],
  ]),
  ...P('Jobs', [
    ['Doctor', 'Nurse'], ['Teacher', 'Principal'], ['Pilot', 'Air hostess'], ['Chef', 'Waiter'], ['Police officer', 'Security guard'],
    ['Actor', 'Singer'], ['Engineer', 'Architect'], ['Lawyer', 'Judge'], ['Barber', 'Tailor'], ['Farmer', 'Gardener'],
    ['YouTuber', 'Influencer'], ['Dentist', 'Surgeon'], ['Shopkeeper', 'Salesman'], ['Driver', 'Conductor'],
  ]),
  ...P('Events', [
    ['Wedding', 'Engagement'], ['Birthday party', 'Farewell'], ['Diwali', 'Christmas'], ['Holi', 'Rang Panchami'], ['Exam', 'Interview'],
    ['Picnic', 'Road trip'], ['Concert', 'Stand-up show'], ['Cricket match', 'IPL final'], ['Sleepover', 'House party'],
    ['Lohri', 'Makar Sankranti'], ['Navratri', 'Durga Puja'], ['Raksha Bandhan', 'Bhai Dooj'],
  ]),
  ...P('Apps and brands', [
    ['WhatsApp', 'Telegram'], ['Instagram', 'Snapchat'], ['YouTube', 'Netflix'], ['Swiggy', 'Zomato'], ['Amazon', 'Flipkart'],
    ['Google Pay', 'PhonePe'], ['Uber', 'Ola'], ['Spotify', 'JioSaavn'], ['Coca-Cola', 'Pepsi'], ['Parle-G', 'Marie biscuit'],
    ['Dairy Milk', 'KitKat'], ['Maruti', 'Hyundai'], ['iPhone', 'Samsung'], ['McDonald\'s', 'KFC'], ['Domino\'s', 'Pizza Hut'],
  ]),
  ...P('Movies and characters', [
    ['Batman', 'Superman'], ['Spider-Man', 'Iron Man'], ['Harry Potter', 'Lord of the Rings'], ['Doraemon', 'Shin-chan'],
    ['Chhota Bheem', 'Motu Patlu'], ['Sholay', 'Deewar'], ['Mickey Mouse', 'Tom and Jerry'], ['Bahubali', 'KGF'],
    ['3 Idiots', 'Chhichhore'], ['Hera Pheri', 'Welcome'], ['Shaktimaan', 'Krrish'], ['Avengers', 'Justice League'],
  ]),
  ...P('Nature', [
    ['Rain', 'Snow'], ['Sun', 'Moon'], ['River', 'Lake'], ['Mountain', 'Volcano'], ['Forest', 'Jungle'], ['Desert', 'Beach'],
    ['Rose', 'Lotus'], ['Thunder', 'Lightning'], ['Rainbow', 'Sunset'], ['Island', 'Peninsula'], ['Star', 'Planet'],
  ]),
]
