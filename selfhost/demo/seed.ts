// Vymyšlené ukázkové klientky pro náhled. Žádná skutečná data.
import {CATEGORY_COLORS, PRICE_LIST} from '../../lib/price-list';
import {DEFAULT_SETTINGS} from '../../lib/booking';

// Ukázkové popisy pro náhled; skutečné popisy si salon doplní v Nastavení.
const DESCRIPTIONS: Record<string, string> = {
  'Nevím, jaké ošetření vybrat': 'Pokud si nejste jistá výběrem, zvolte tuto možnost. Na místě společně vybereme ošetření, které vaší pleti sedne.',
  'A-QS Hacker': 'Moderní dermokosmetické ošetření, které pracuje s přirozenou inteligencí pokožky.',
  'Derma Collage': 'Tříúrovňová hydratace a obnova kolagenu s plumping efektem.',
  'Mandelic Forte Peel – balíček 3× ošetření': 'Tři chemické peelingy Mandelic Forte za zvýhodněnou cenu. Platí se předem, další termíny domluvíme při první návštěvě.',
  'Lash Lifting řas': 'Natočení a zvýraznění vašich vlastních řas na několik týdnů.',
};
type Run = (sql: string, values: (string | number | null)[]) => void;
type Put = (key: string, bytes: Uint8Array) => void;

function day(offset: number) { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); }

async function placeholder(label: string, hue: number) {
  const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 360;
  const g = canvas.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 480, 360);
  grad.addColorStop(0, `hsl(${hue} 45% 82%)`); grad.addColorStop(1, `hsl(${hue + 20} 35% 68%)`);
  g.fillStyle = grad; g.fillRect(0, 0, 480, 360);
  g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '600 26px system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText('Ukázková fotka', 240, 170); g.font = '20px system-ui, sans-serif'; g.fillText(label, 240, 205);
  const blob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

export async function seedDemo(run: Run, put: Put) {
  const now = new Date().toISOString();
  const clients: [string, string, string, string, string, string, string, number][] = [
    ['demo-1', 'Tereza Nováková', '+420 601 234 567', 'tereza@example.cz', 'Smíšená pleť, rozšířené póry na nose a bradě.', 'Citlivá na parfemaci.', 'Preferuje odpolední termíny.', 1],
    ['demo-2', 'Lucie Horáková', '+420 602 345 678', '', 'Suchá, dehydratovaná pleť, jemné vrásky kolem očí.', '', 'Zájem o anti-age péči.', 0],
    ['demo-3', 'Markéta Dvořáková', '+420 603 456 789', 'marketa@example.cz', 'Mastná pleť se sklonem k akné.', 'Užívá isotretinoin, zatím bez peelingů.', '', 0],
    ['demo-4', 'Petra Svobodová', '+420 604 567 890', '', 'Normální pleť.', 'Alergie na latex.', 'Dárkový poukaz od dcery.', 0],
  ];
  for (const c of clients) run('INSERT INTO clients (id,name,phone,email,skin,cautions,notes,created,clean_skin_active) VALUES (?,?,?,?,?,?,?,?,?)', [...c.slice(0, 7), now, c[7]] as (string | number)[]);

  const visits: [string, string, string, string, string, string, number | null, number, number | null, number | null][] = [
    ['v-1', 'demo-1', day(-30), 'A-QS Hacker', '', 'Čistá pleť, první ošetření série.', 129000, 1, 129000, 1],
    ['v-2', 'demo-1', day(-9), 'A-QS Hacker', 'Domů vzorek čisticího gelu.', 'Pleť klidnější, méně komedonů.', 122550, 1, 122550, 2],
    ['v-3', 'demo-2', day(-14), 'Hydratační ošetření s maskou', 'Hyaluronové sérum, alginátová maska', 'Doporučena domácí hydratace.', 115000, 0, null, null],
    ['v-4', 'demo-3', day(-5), 'Konzultace a jemné čištění', 'Enzymatický peeling', 'Bez mechanického čištění kvůli léčbě.', 60000, 0, null, null],
    ['v-5', 'demo-4', day(-40), 'Lifting řas a laminace obočí', '', '', 90000, 0, null, null],
  ];
  for (const v of visits) run('INSERT INTO visits (id,client_id,date,treatment,products,notes,revenue_cents,clean_skin,program_price_cents,program_step) VALUES (?,?,?,?,?,?,?,?,?,?)', v);

  PRICE_LIST.forEach(([category, name, minutes, price, extra], i) => run('INSERT INTO services (id,name,duration_min,price_cents,active,sort,category,description,color,sessions,prepay,created) VALUES (?,?,?,?,1,?,?,?,?,?,?,?)', ['s-' + i, name, minutes, price * 100, i, category, DESCRIPTIONS[name] || '', CATEGORY_COLORS[category] || '', extra?.sessions ?? 1, extra?.prepay ? 1 : 0, now]));
  const service = (name: string) => { const i = PRICE_LIST.findIndex(x => x[1] === name); return {id: 's-' + i, name, minutes: PRICE_LIST[i][2], price: PRICE_LIST[i][3] * 100}; };
  const workday = (offset: number) => { let o = offset; while ([0, 6].includes(new Date(day(o) + 'T12:00:00Z').getUTCDay())) o += offset < 0 ? -1 : 1; return day(o); };
  const at = (offset: number, time: string, minutes: number) => { const start = `${workday(offset)}T${time}`, d = new Date(start + ':00Z'); d.setUTCMinutes(d.getUTCMinutes() + minutes); return [start, d.toISOString().slice(0, 16)] as [string, string]; };
  // [id, ošetření, klientka z kartotéky, den od dneška, čas, jméno, telefon, stav, zdroj, poznámka]
  const bookings: [string, string, string | null, number, string, string, string, string, string, string][] = [
    ['b-1', 'A-QS Hacker', 'demo-1', 1, '10:00', 'Tereza Nováková', '+420 601 234 567', 'confirmed', 'online', 'Čistá pleť, 3. návštěva.'],
    ['b-2', 'Lash Lifting řas', null, 2, '13:00', 'Klára Malá', '+420 605 111 222', 'confirmed', 'online', ''],
    ['b-4', 'Carelika Basic Skin Care', 'demo-2', 3, '14:00', 'Lucie Horáková', '+420 602 345 678', 'confirmed', 'salon', ''],
    ['b-5', 'Čištění pleti s kyselinou jantarovou', 'demo-3', -2, '11:00', 'Markéta Dvořáková', '+420 603 456 789', 'no_show', 'online', ''],
    ['b-8', 'Mikrojehličkování – PDRN Multipeptide', null, 0, '15:00', 'Jana Krásná', '+420 606 222 333', 'confirmed', 'online', ''],
    ['b-9', 'DNA Glow Rebirth', 'demo-4', -1, '16:00', 'Petra Svobodová', '+420 604 567 890', 'done', 'salon', ''],
    ['b-10', 'Kosmetická masáž + gelová maska', null, 1, '17:30', 'Simona Bílá', '+420 607 444 555', 'confirmed', 'online', ''],
    ['b-11', 'Hyaluron Collagen 3D Lift', null, 2, '09:30', 'Alena Zelená', '+420 608 666 777', 'confirmed', 'salon', ''],
    ['b-12', 'Laminace obočí', null, 3, '17:00', 'Nikola Modrá', '+420 609 888 999', 'confirmed', 'online', ''],
  ];
  for (const [id, serviceName, clientId, offset, time, name, phone, status, source, note] of bookings) {
    const x = service(serviceName), [start, end] = at(offset, time, x.minutes);
    run('INSERT INTO bookings (id,service_id,client_id,start_at,end_at,service_name,price_cents,name,phone,email,note,status,source,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [id, x.id, clientId, start, end, x.name, x.price, name, phone, '', note, status, source, now]);
  }
  const [blockStart, blockEnd] = at(3, '09:00', 120);
  run("INSERT INTO bookings (id,start_at,end_at,service_name,status,source,created) VALUES ('b-3',?,?,'Školení','confirmed','block',?)", [blockStart, blockEnd, now]);
  // Ukázka kaucí: jedna čeká na zaplacení, jedna je zaplacená.
  const volumetric = service('Volumetric – Ozempic face'), architect = service('3D Architect');
  const [pStart, pEnd] = at(4, '15:00', volumetric.minutes), [kStart, kEnd] = at(5, '10:00', architect.minutes);
  run("INSERT INTO bookings (id,service_id,client_id,start_at,end_at,service_name,price_cents,name,phone,email,note,status,source,deposit_cents,deposit_status,deposit_due,vs,manage_token,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending','online',90000,'pending',?,?,?,?)",
    ['b-6', volumetric.id, null, pStart, pEnd, volumetric.name, volumetric.price, 'Petra Svobodová', '+420 604 777 888', 'petra@example.cz', '', [day(1) + 'T12:00', pStart].sort()[0], pStart.slice(2, 10).replace(/-/g, '') + '1507', 'a'.repeat(36), now]);
  run("INSERT INTO bookings (id,service_id,client_id,start_at,end_at,service_name,price_cents,name,phone,email,note,status,source,deposit_cents,deposit_status,deposit_due,vs,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,'confirmed','online',70000,'paid',?,?,?)",
    ['b-7', architect.id, 'demo-2', kStart, kEnd, architect.name, architect.price, 'Lucie Horáková', '+420 602 345 678', '', '', kStart, kStart.slice(2, 10).replace(/-/g, '') + '1042', now]);
  // Ukázkové produkty a účtenky.
  const products: [string, number][] = [['Čisticí gel pro citlivou pleť', 590], ['Hydratační sérum s kyselinou hyaluronovou', 1290], ['Krém s SPF 50', 790], ['Pleťová maska – vzorek', 120]];
  products.forEach(([name, price], i) => run('INSERT INTO products (id,name,price_cents,active,sort,created) VALUES (?,?,?,1,?,?)', ['p-' + i, name, price * 100, i, now]));
  const year = Number(day(0).slice(0, 4)), dna = service('DNA Glow Rebirth');
  const receipt = (seq: number, bookingId: string | null, clientId: string | null, clientName: string, issued: string, items: {name: string; qty: number; unitCents: number; kind: string}[], method: string, paid: number) => {
    const total = items.reduce((a, x) => a + x.qty * x.unitCents, 0);
    run('INSERT INTO receipts (id,year,seq,number,booking_id,client_id,client_name,issued,items,total_cents,prepaid_cents,due_cents,method,paid,vs,status,note,created) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?)',
      ['r-' + seq, year, seq, `${year}/${String(seq).padStart(4, '0')}`, bookingId, clientId, clientName, issued, JSON.stringify(items), total, total, method, paid, `${year}${String(seq).padStart(4, '0')}`, 'issued', '', now]);
  };
  receipt(1, 'b-9', 'demo-4', 'Petra Svobodová', workday(-1) + 'T17:05', [{name: dna.name, qty: 1, unitCents: dna.price, kind: 'service'}, {name: 'Krém s SPF 50', qty: 1, unitCents: 79000, kind: 'product'}], 'card', 1);
  receipt(2, null, 'demo-1', 'Tereza Nováková', day(0) + 'T10:30', [{name: 'Čisticí gel pro citlivou pleť', qty: 2, unitCents: 59000, kind: 'product'}], 'qr', 0);
  run("INSERT INTO settings (key,value) VALUES ('booking',?)", [JSON.stringify({...DEFAULT_SETTINGS, account: '127326219/0300', businessOwner: 'Jana Ukázková'})]);

  const photos: [string, string, string, string, number][] = [
    ['p-1', 'demo-1', day(-30), 'Před ošetřením', 18],
    ['p-2', 'demo-1', day(-9), 'Po druhém ošetření', 30],
  ];
  for (const [id, clientId, date, caption, hue] of photos) {
    put('photos/' + id, await placeholder(caption, hue));
    run('INSERT INTO photos (id,client_id,object_key,mime,date,caption,created) VALUES (?,?,?,?,?,?,?)', [id, clientId, 'photos/' + id, 'image/png', date, caption, now]);
  }
}
