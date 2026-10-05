// Writes src/content/songs.ts for Music Guess: Bollywood songs with Apple's free 30-second previews (iTunes Search
// API, India store). Each song keeps its Apple Music link, which the game shows after the round.
// Run: node scripts/build-songs.mjs (about 20 minutes: Apple allows roughly 20 searches a minute).
import { writeFileSync } from 'node:fs'

const SONGS = [
  // [title, film, year]
  ['Tujhe Dekha To', 'Dilwale Dulhania Le Jayenge', 1995], ['Mere Khwabon Mein', 'Dilwale Dulhania Le Jayenge', 1995], ['Ruk Ja O Dil Deewane', 'Dilwale Dulhania Le Jayenge', 1995],
  ['Chura Ke Dil Mera', 'Main Khiladi Tu Anari', 1994], ['Tu Cheez Badi Hai Mast Mast', 'Mohra', 1994], ['Tip Tip Barsa Paani', 'Mohra', 1994],
  ['Ek Do Teen', 'Tezaab', 1988], ['Didi Tera Devar Deewana', 'Hum Aapke Hain Koun', 1994], ['Pehla Nasha', 'Jo Jeeta Wohi Sikandar', 1992],
  ['Kuch Kuch Hota Hai', 'Kuch Kuch Hota Hai', 1998], ['Koi Mil Gaya', 'Kuch Kuch Hota Hai', 1998], ['Ladki Badi Anjani Hai', 'Kuch Kuch Hota Hai', 1998],
  ['Saajan Ji Ghar Aaye', 'Kuch Kuch Hota Hai', 1998], ['Tum Paas Aaye', 'Kuch Kuch Hota Hai', 1998], ['Tujhe Yaad Na Meri Aayee', 'Kuch Kuch Hota Hai', 1998],
  ['Chaiyya Chaiyya', 'Dil Se', 1998], ['Tadap Tadap', 'Hum Dil De Chuke Sanam', 1999], ['Dholi Taro', 'Hum Dil De Chuke Sanam', 1999],
  ['Chand Chupa Badal Mein', 'Hum Dil De Chuke Sanam', 1999], ['Aankhon Ki Gustakhiyan', 'Hum Dil De Chuke Sanam', 1999],
  ['Bole Chudiyan', 'Kabhi Khushi Kabhie Gham', 2001], ['Suraj Hua Maddham', 'Kabhi Khushi Kabhie Gham', 2001], ['Yeh Ladka Hai Allah', 'Kabhi Khushi Kabhie Gham', 2001], ['Shava Shava', 'Kabhi Khushi Kabhie Gham', 2001],
  ['Kal Ho Naa Ho', 'Kal Ho Naa Ho', 2003], ['Maahi Ve', 'Kal Ho Naa Ho', 2003], ['It\'s The Time To Disco', 'Kal Ho Naa Ho', 2003], ['Kuch To Hua Hai', 'Kal Ho Naa Ho', 2003],
  ['Main Hoon Na', 'Main Hoon Na', 2004], ['Tumse Milke Dil Ka', 'Main Hoon Na', 2004], ['Dhoom Machale', 'Dhoom', 2004], ['Kajra Re', 'Bunty Aur Babli', 2005],
  ['Beedi', 'Omkara', 2006], ['Crazy Kiya Re', 'Dhoom 2', 2006], ['Tu Jaane Na', 'Ajab Prem Ki Ghazab Kahani', 2009], ['Tera Hone Laga Hoon', 'Ajab Prem Ki Ghazab Kahani', 2009],
  ['Tum Hi Ho', 'Aashiqui 2', 2013], ['Sun Raha Hai', 'Aashiqui 2', 2013], ['Chammak Challo', 'Ra.One', 2011], ['Sheila Ki Jawani', 'Tees Maar Khan', 2010],
  ['Munni Badnaam Hui', 'Dabangg', 2010], ['Tere Mast Mast Do Nain', 'Dabangg', 2010], ['Kesariya', 'Brahmastra', 2022], ['Deva Deva', 'Brahmastra', 2022],
  ['Apna Bana Le', 'Bhediya', 2022], ['Tum Kya Mile', 'Rocky Aur Rani Kii Prem Kahaani', 2023], ['What Jhumka', 'Rocky Aur Rani Kii Prem Kahaani', 2023],
  ['Jhoome Jo Pathaan', 'Pathaan', 2023], ['Besharam Rang', 'Pathaan', 2023], ['Chaleya', 'Jawan', 2023], ['Zinda Banda', 'Jawan', 2023],
  ['Satranga', 'Animal', 2023], ['Arjan Vailly', 'Animal', 2023], ['Pehle Bhi Main', 'Animal', 2023], ['Raataan Lambiyan', 'Shershaah', 2021], ['Ranjha', 'Shershaah', 2021],
  ['Tera Ban Jaunga', 'Kabir Singh', 2019], ['Bekhayali', 'Kabir Singh', 2019], ['Kaise Hua', 'Kabir Singh', 2019], ['Apna Time Aayega', 'Gully Boy', 2019],
  ['Ghungroo', 'War', 2019], ['Jai Jai Shivshankar', 'War', 2019], ['Kar Gayi Chull', 'Kapoor & Sons', 2016], ['Kala Chashma', 'Baar Baar Dekho', 2016],
  ['The Breakup Song', 'Ae Dil Hai Mushkil', 2016], ['Channa Mereya', 'Ae Dil Hai Mushkil', 2016], ['Bulleya', 'Ae Dil Hai Mushkil', 2016], ['Gerua', 'Dilwale', 2015],
  ['Badtameez Dil', 'Yeh Jawaani Hai Deewani', 2013], ['Balam Pichkari', 'Yeh Jawaani Hai Deewani', 2013], ['Kabira', 'Yeh Jawaani Hai Deewani', 2013], ['Ilahi', 'Yeh Jawaani Hai Deewani', 2013],
  ['Dilliwaali Girlfriend', 'Yeh Jawaani Hai Deewani', 2013], ['London Thumakda', 'Queen', 2014], ['Galliyan', 'Ek Villain', 2014], ['Baby Doll', 'Ragini MMS 2', 2014],
  ['Lungi Dance', 'Chennai Express', 2013], ['Titli', 'Chennai Express', 2013], ['Gandi Baat', 'R... Rajkumar', 2013], ['Saree Ke Fall Sa', 'R... Rajkumar', 2013],
  ['Tune Maari Entriyaan', 'Gunday', 2014], ['Sooraj Dooba Hain', 'Roy', 2015], ['Matargashti', 'Tamasha', 2015], ['Agar Tum Saath Ho', 'Tamasha', 2015],
  ['Hawayein', 'Jab Harry Met Sejal', 2017], ['Dilbar', 'Satyameva Jayate', 2018], ['Aankh Marey', 'Simmba', 2018], ['Ghoomar', 'Padmaavat', 2018],
  ['Malhari', 'Bajirao Mastani', 2015], ['Deewani Mastani', 'Bajirao Mastani', 2015], ['Nagada Sang Dhol', 'Goliyon Ki Raasleela Ram-Leela', 2013],
  ['Dil Diyan Gallan', 'Tiger Zinda Hai', 2017], ['Swag Se Swagat', 'Tiger Zinda Hai', 2017], ['Mashallah', 'Ek Tha Tiger', 2012],
  ['Tum Se Hi', 'Jab We Met', 2007], ['Mauja Hi Mauja', 'Jab We Met', 2007], ['Nagada Nagada', 'Jab We Met', 2007], ['Yeh Ishq Hai', 'Jab We Met', 2007], ['Aao Milo Chalein', 'Jab We Met', 2007],
  ['Dard-E-Disco', 'Om Shanti Om', 2007], ['Ajab Si', 'Om Shanti Om', 2007], ['Main Agar Kahoon', 'Om Shanti Om', 2007], ['Ainvayi Ainvayi', 'Band Baaja Baaraat', 2010],
  ['Tujh Mein Rab Dikhta Hai', 'Rab Ne Bana Di Jodi', 2008], ['Haule Haule', 'Rab Ne Bana Di Jodi', 2008], ['Kun Faya Kun', 'Rockstar', 2011], ['Nadaan Parindey', 'Rockstar', 2011],
  ['Sadda Haq', 'Rockstar', 2011], ['Pee Loon', 'Once Upon a Time in Mumbaai', 2010], ['Tere Liye', 'Veer-Zaara', 2004], ['Main Yahaan Hoon', 'Veer-Zaara', 2004],
  ['Kabhi Alvida Naa Kehna', 'Kabhi Alvida Naa Kehna', 2006], ['Where\'s The Party Tonight', 'Kabhi Alvida Naa Kehna', 2006], ['Maula Mere', 'Chak De! India', 2007],
  ['Chak De India', 'Chak De! India', 2007], ['Masakali', 'Delhi-6', 2009], ['Rehna Tu', 'Delhi-6', 2009], ['Jai Ho', 'Slumdog Millionaire', 2008],
  ['Kaise Mujhe', 'Ghajini', 2008], ['Guzarish', 'Ghajini', 2008], ['Behti Hawa Sa Tha', '3 Idiots', 2009], ['Give Me Some Sunshine', '3 Idiots', 2009],
  ['Zoobi Doobi', '3 Idiots', 2009], ['Aal Izz Well', '3 Idiots', 2009], ['Masti Ki Paathshala', 'Rang De Basanti', 2006], ['Rang De Basanti', 'Rang De Basanti', 2006],
  ['Khalbali', 'Rang De Basanti', 2006], ['Dil Chahta Hai', 'Dil Chahta Hai', 2001], ['Koi Kahe Kehta Rahe', 'Dil Chahta Hai', 2001], ['Tanhayee', 'Dil Chahta Hai', 2001],
  ['Senorita', 'Zindagi Na Milegi Dobara', 2011], ['Ik Junoon', 'Zindagi Na Milegi Dobara', 2011], ['Khaabon Ke Parinday', 'Zindagi Na Milegi Dobara', 2011],
  ['Dil Dhadakne Do', 'Dil Dhadakne Do', 2015], ['Gallan Goodiyaan', 'Dil Dhadakne Do', 2015], ['Ude Dil Befikre', 'Befikre', 2016], ['Nashe Si Chadh Gayi', 'Befikre', 2016],
  ['Hookah Bar', 'Khiladi 786', 2012], ['Chikni Chameli', 'Agneepath', 2012], ['Abhi Mujh Mein Kahin', 'Agneepath', 2012], ['Dhating Naach', 'Phata Poster Nikhla Hero', 2013],
  ['Tamma Tamma Again', 'Badrinath Ki Dulhania', 2017], ['Badri Ki Dulhania', 'Badrinath Ki Dulhania', 2017], ['Coca Cola', 'Luka Chuppi', 2019], ['Duniyaa', 'Luka Chuppi', 2019],
  ['Proper Patola', 'Namaste England', 2018], ['Tareefan', 'Veere Di Wedding', 2018], ['Kar Har Maidaan Fateh', 'Sanju', 2018], ['Main Badhiya Tu Bhi Badhiya', 'Sanju', 2018],
  ['Dhak Dhak Karne Laga', 'Beta', 1992], ['Choli Ke Peeche', 'Khal Nayak', 1993], ['Ek Ladki Ko Dekha', '1942: A Love Story', 1994], ['Tu Hi Re', 'Bombay', 1995],
  ['Humma Humma', 'Bombay', 1995], ['Mukkala Muqabla', 'Hum Se Hai Muqabala', 1994], ['Yeh Haseen Wadiyan', 'Roja', 1992], ['Dil Hai Chhota Sa', 'Roja', 1992],
  ['Taal Se Taal Mila', 'Taal', 1999], ['Ishq Bina', 'Taal', 1999], ['Rangeela Re', 'Rangeela', 1995], ['Tanha Tanha', 'Rangeela', 1995],
  ['Sandese Aate Hai', 'Border', 1997], ['Ghar Se Nikalte Hi', 'Papa Kehte Hain', 1996], ['Papa Kehte Hain', 'Qayamat Se Qayamat Tak', 1988],
  ['Mere Sapno Ki Rani', 'Aradhana', 1969], ['Chura Liya Hai Tumne Jo Dil Ko', 'Yaadon Ki Baaraat', 1973], ['Yeh Dosti', 'Sholay', 1975], ['Mehbooba Mehbooba', 'Sholay', 1975],
  ['Dum Maro Dum', 'Hare Rama Hare Krishna', 1971], ['Pyar Hua Ikrar Hua', 'Shree 420', 1955], ['Lag Jaa Gale', 'Woh Kaun Thi', 1964], ['Pyar Kiya To Darna Kya', 'Mughal-E-Azam', 1960],
  ['Ek Pyar Ka Nagma Hai', 'Shor', 1972], ['Kabhi Kabhie Mere Dil Mein', 'Kabhi Kabhie', 1976], ['Tere Bina Zindagi Se', 'Aandhi', 1975], ['Gulabi Aankhen', 'The Train', 1970],
  ['Aaj Kal Tere Mere Pyar Ke Charche', 'Brahmachari', 1968], ['Om Shanti Om', 'Karz', 1980], ['Jimmy Jimmy Aaja Aaja', 'Disco Dancer', 1982], ['I Am a Disco Dancer', 'Disco Dancer', 1982],
  ['Ek Main Aur Ek Tu', 'Khel Khel Mein', 1975], ['Mere Rang Mein Rangne Wali', 'Maine Pyar Kiya', 1989], ['Dil Deewana', 'Maine Pyar Kiya', 1989],
  ['Tum Hi Ho Bandhu', 'Cocktail', 2012], ['Daaru Desi', 'Cocktail', 2012], ['Second Hand Jawaani', 'Cocktail', 2012], ['Pehli Nazar Mein', 'Race', 2008],
  ['Zara Zara', 'Rehnaa Hai Terre Dil Mein', 2001], ['Kaho Naa Pyaar Hai', 'Kaho Naa Pyaar Hai', 2000], ['Ek Pal Ka Jeena', 'Kaho Naa Pyaar Hai', 2000],
  ['Teri Meri', 'Bodyguard', 2011], ['Character Dheela', 'Ready', 2011], ['Dhinka Chika', 'Ready', 2011], ['Jalwa', 'Wanted', 2009], ['Le Le Mazaa Le', 'Wanted', 2009],
  ['Bhaag D.K. Bose', 'Delhi Belly', 2011], ['Ambarsariya', 'Fukrey', 2013], ['Subha Hone Na De', 'Desi Boyz', 2011], ['Party All Night', 'Boss', 2013],
  ['Abhi Toh Party Shuru Hui Hai', 'Khoobsurat', 2014], ['Desi Girl', 'Dostana', 2008], ['Shut Up and Bounce', 'Dostana', 2008], ['Jaane Kyun', 'Dostana', 2008],
  ['Hai Junoon', 'New York', 2009], ['Tu Jo Mila', 'Bajrangi Bhaijaan', 2015], ['Selfie Le Le Re', 'Bajrangi Bhaijaan', 2015], ['Bhar Do Jholi Meri', 'Bajrangi Bhaijaan', 2015],
  ['Jag Ghoomeya', 'Sultan', 2016], ['Baby Ko Bass Pasand Hai', 'Sultan', 2016], ['Dangal', 'Dangal', 2016], ['Haanikaarak Bapu', 'Dangal', 2016], ['Dhaakad', 'Dangal', 2016],
  ['Ve Maahi', 'Kesari', 2019], ['Teri Mitti', 'Kesari', 2019], ['Khairiyat', 'Chhichhore', 2019], ['Srivalli', 'Pushpa: The Rise', 2021], ['Param Sundari', 'Mimi', 2021],
  ['Lehra Do', '83', 2021], ['Tere Vaaste', 'Zara Hatke Zara Bachke', 2023], ['O Maahi', 'Dunki', 2023], ['Lutt Putt Gaya', 'Dunki', 2023], ['Tauba Tauba', 'Bad Newz', 2024],
  ['Aaj Ki Raat', 'Stree 2', 2024], ['Aayi Nai', 'Stree 2', 2024], ['Sajni', 'Laapataa Ladies', 2024], ['Tera Yaar Hoon Main', 'Sonu Ke Titu Ki Sweety', 2018],
  ['Hawa Hawai', 'Mr. India', 1987], ['Kaate Nahin Kat Te', 'Mr. India', 1987], ['My Name Is Lakhan', 'Ram Lakhan', 1989], ['Jumma Chumma De De', 'Hum', 1991],
  ['Tamma Tamma Loge', 'Thanedaar', 1990], ['Aankhen Khuli', 'Mohabbatein', 2000], ['Humko Humise Chura Lo', 'Mohabbatein', 2000], ['Suno Na Suno Na', 'Jhankaar Beats', 2003],
  ['Dus Bahane', 'Dus', 2005], ['Aashiq Banaya Aapne', 'Aashiq Banaya Aapne', 2005], ['Woh Lamhe', 'Zeher', 2005], ['Ya Ali', 'Gangster', 2006], ['Tu Hi Meri Shab Hai', 'Gangster', 2006],
  ['Tujhe Bhula Diya', 'Anjaana Anjaani', 2010], ['Sajde', 'Khatta Meetha', 2010], ['Jee Le Zaraa', 'Talaash', 2012], ['Phir Bhi Tumko Chaahunga', 'Half Girlfriend', 2017],
  ['Hamari Adhuri Kahani', 'Hamari Adhuri Kahani', 2015], ['Muskurane', 'CityLights', 2014], ['Bezubaan', 'ABCD', 2013], ['Sun Saathiya', 'ABCD 2', 2015],
  ['Chunari Chunari', 'Biwi No.1', 1999], ['Ole Ole', 'Yeh Dillagi', 1994], ['Akhiyon Se Goli Maare', 'Dulhe Raja', 1998], ['Husn Hai Suhana', 'Coolie No. 1', 1995],
  ['Main To Raste Se Ja Raha Tha', 'Coolie No. 1', 1995], ['Kisi Disco Mein Jaaye', 'Bade Miyan Chote Miyan', 1998], ['Sona Kitna Sona Hai', 'Hero No. 1', 1997],
  ['Le Gayi', 'Dil To Pagal Hai', 1997], ['Dil To Pagal Hai', 'Dil To Pagal Hai', 1997], ['Koi Ladki Hai', 'Dil To Pagal Hai', 1997],
  ['Dekha Hai Pehli Baar', 'Saajan', 1991], ['Mera Dil Bhi Kitna Pagal Hai', 'Saajan', 1991], ['Bahut Pyar Karte Hai', 'Saajan', 1991], ['Dheere Dheere Se', 'Aashiqui', 1990],
  ['Nazar Ke Samne', 'Aashiqui', 1990], ['Pardesi Pardesi', 'Raja Hindustani', 1996], ['Aaye Ho Meri Zindagi Mein', 'Raja Hindustani', 1996], ['Jaadu Teri Nazar', 'Darr', 1993],
  ['Tu Mere Saamne', 'Darr', 1993], ['Yeh Kaali Kaali Aankhen', 'Baazigar', 1993], ['Baazigar O Baazigar', 'Baazigar', 1993], ['Chhupana Bhi Nahi Aata', 'Baazigar', 1993],
]

const norm = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const squash = s => norm(s).replace(/ /g, '').replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u').replace(/[hy]/g, '')
const wait = ms => new Promise(r => setTimeout(r, ms))
const OTHER = /\b(remix|lo-?fi|cover|karaoke|instrumental|unplugged|reprise|mashup|slowed|reverb|acoustic|female|male|sad version|lounge|dance mix|club mix|tribute|recreated|jhankar|jhankaar|dj)\b/i

async function search(term) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=in&entity=song&limit=15`)
    if (r.ok) return (await r.json()).results ?? []
    await wait(20000)
  }
  return []
}

const out = [], missing = []
for (const [title, film, year] of SONGS) {
  const res = await search(`${title} ${film}`)
  // The track's name must be the song (Apple adds "(From …)"), with a preview, and it must come from the film's own
  // album (or say "From <film>"): that rules out covers by other artists. Never a remix, lo-fi, karaoke or other
  // version either: the clip has to be the song people know.
  const fits = res.filter(r => r.previewUrl && squash(r.trackName).startsWith(squash(title)) && !OTHER.test(`${r.trackName} ${r.collectionName}`))
  const best = fits.find(r => squash(r.collectionName + ' ' + r.trackName).includes(squash(film).slice(0, 8)))
  if (best) out.push({ t: title, f: film, y: year, artist: best.artistName, preview: best.previewUrl, link: best.trackViewUrl.replace(/[?&]uo=\d+/, '') })
  else missing.push(`${title} (${film})`)
  process.stdout.write(best ? '.' : 'x')
  await wait(3200)
}
console.log(`\n${out.length} found, ${missing.length} missing: ${missing.join('; ')}`)
writeFileSync('src/content/songs.ts', `// Generated by scripts/build-songs.mjs. Bollywood songs with Apple's 30-second previews (iTunes Search API, India
// store) and their Apple Music links. t: song, f: film, y: year.
export interface Song { t: string; f: string; y: number; artist: string; preview: string; link: string }
export const SONGS: Song[] = ${JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n  {').replace(/^\[/, '[\n  ').replace(/\]$/, ',\n]')}
`)
