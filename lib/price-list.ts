// Ceník podle rezervací salonu v MyFoxu (stav 15. 10. 2026). Balíčky a programy se platí celé předem;
// online se rezervuje první ošetření, další termíny domluví salon.
// Kategorie mají v kalendáři vlastní barvu; ceny, délky i barvy jde v administraci upravit.
export const CATEGORY_COLORS: Record<string, string> = {
  'Konzultace': '#8a6d3f',
  'Expresní ošetření': '#f2a33a',
  'Základní ošetření': '#5b9bd5',
  'Ošetření problematické pleti': '#1fb5d8',
  'Hydratační ošetření': '#3d7be0',
  'Anti-aging ošetření': '#6a4fc9',
  'Prémiová ošetření': '#b03c9e',
  'Prémiové estetické programy': '#d6457a',
  'Mezoterapie': '#22c4a8',
  'Chemické peelingy': '#e0703a',
  'Laminace a Lash Lifting': '#c23b3b',
  'Zábaly': '#7a9a3a',
  'Masáže': '#e56fa8',
};

export type PackageInfo = {sessions: number; prepay: true};
const pack = (sessions: number): PackageInfo => ({sessions, prepay: true});
export const PRICE_LIST: [category: string, name: string, durationMin: number, priceKc: number, extra?: PackageInfo][] = [
  ['Konzultace', 'Nevím, jaké ošetření vybrat', 90, 0],
  ['Expresní ošetření', 'Expresní ošetření C-Fusion Glow', 35, 990],
  ['Základní ošetření', 'Carelika Basic Skin Care', 60, 1090],
  ['Ošetření problematické pleti', 'Neuro Sensi Therapy', 90, 1790],
  ['Ošetření problematické pleti', 'A-QS Hacker', 70, 1290],
  ['Ošetření problematické pleti', 'Carelika Amber s kyselinou jantarovou', 90, 1290],
  ['Ošetření problematické pleti', 'Čištění pleti s kyselinou jantarovou', 50, 890],
  ['Ošetření problematické pleti', 'Čištění pleti', 40, 690],
  ['Ošetření problematické pleti', 'Program Cesta k čisté pleti s rostoucí slevou', 70, 1290, pack(1)],
  ['Ošetření problematické pleti', 'Program Cesta k čisté pleti na 6 měsíců', 70, 7928, pack(6)],
  ['Hydratační ošetření', 'Derma Collage', 70, 1790],
  ['Hydratační ošetření', 'Oxyfy Me – ošetření pro buněčnou obnovu', 90, 1390],
  ['Hydratační ošetření', 'Karboxyterapie', 60, 1350],
  ['Anti-aging ošetření', 'Hyaluron Collagen 3D Lift', 90, 1490],
  ['Anti-aging ošetření', 'Luxusní liftingové ošetření s nanoneedlingem', 120, 1890],
  ['Anti-aging ošetření', 'Lifting bez skalpelu Neuro Gaba & Nana', 60, 1590],
  ['Prémiová ošetření', 'DNA Glow Rebirth', 60, 2190],
  ['Prémiová ošetření', 'Buněčná obnova pleti', 70, 2190],
  ['Prémiové estetické programy', '3D Architect', 50, 2490],
  ['Prémiové estetické programy', '3D Architect – balíček 2× ošetření', 50, 4490, pack(2)],
  ['Prémiové estetické programy', 'Volumetric – Ozempic face', 50, 2990],
  ['Prémiové estetické programy', 'Volumetric – Ozempic face – balíček 2× ošetření', 50, 5390, pack(2)],
  ['Mezoterapie', 'Mikrojehličkování – základní ošetření', 75, 1600],
  ['Mezoterapie', 'Mikrojehličkování – PDRN Multipeptide', 80, 1900],
  ['Mezoterapie', 'Mikrojehličkování – Exo Lift Supreme', 90, 2600],
  ['Mezoterapie', 'Mikrojehličkování – Exo Lift Supreme – balíček 2× ošetření', 90, 4900, pack(2)],
  ['Chemické peelingy', 'Bio Renewal Peel', 30, 1190],
  ['Chemické peelingy', 'Mandelic Forte Peel', 30, 1290],
  ['Chemické peelingy', 'Amber & Glycolic Exfoliator', 30, 1290],
  ['Chemické peelingy', 'Amber & Glycolic Exfoliator – balíček 3× ošetření', 30, 3570, pack(3)],
  ['Chemické peelingy', 'Mandelic Forte Peel – balíček 3× ošetření', 30, 3570, pack(3)],
  ['Laminace a Lash Lifting', 'Laminace obočí', 60, 890],
  ['Laminace a Lash Lifting', 'Lash Lifting řas', 60, 990],
  ['Zábaly', 'Zeštíhlující zábal Vacuslim 48', 60, 900],
  ['Masáže', 'Kosmetická masáž + gelová maska', 30, 590],
  ['Masáže', 'Masáž obličeje, krku a dekoltu + alginátová maska', 45, 740],
  ['Masáže', 'Maderoterapie obličeje, krku a dekoltu', 45, 690],
  ['Masáže', 'Přístrojové ošetření', 20, 300],
];

/** Barva ošetření v kalendáři: vlastní, jinak podle kategorie, jinak odvozená z názvu kategorie. */
const FALLBACK = ['#1fb5d8', '#6a4fc9', '#22c4a8', '#e0703a', '#b03c9e', '#3d7be0', '#c23b3b', '#7a9a3a'];
export function serviceColor(color?: string | null, category?: string | null) {
  if (color && /^#[0-9a-f]{6}$/i.test(color)) return color;
  if (category && CATEGORY_COLORS[category]) return CATEGORY_COLORS[category];
  if (!category) return '#126b66';
  let h = 0; for (const ch of category) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}
