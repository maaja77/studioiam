// Vymyšlené ukázkové klientky pro náhled. Žádná skutečná data.
import {CATEGORY_COLORS, PRICE_LIST} from '../../lib/price-list';
import {DEFAULT_SETTINGS} from '../../lib/booking';
import {consentText, INTAKE_QUESTIONS, PHOTO_CONSENT} from '../../lib/intake';
import {DEMO_SIGNATURE} from './demo-signature';

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
    // Klientky, které dlouho nepřišly (přehled Dlouho nebyly).
    ['demo-5', 'Veronika Černá', '+420 605 111 222', '', 'Smíšená pleť.', '', '', 0],
    ['demo-6', 'Kristýna Malá', '+420 606 333 444', 'kristyna@example.cz', 'Citlivá pleť, kuperóza.', '', 'Chodila pravidelně na masáže.', 0],
    ['demo-7', 'Hana Pokorná', '+420 607 555 666', '', 'Zralá pleť.', '', '', 0],
    ['demo-8', 'Jitka Royová', '+420 608 777 888', '', 'Normální pleť.', '', '', 0],
  ];
  for (const c of clients) run('INSERT INTO clients (id,name,phone,email,skin,cautions,notes,created,clean_skin_active) VALUES (?,?,?,?,?,?,?,?,?)', [...c.slice(0, 7), now, c[7]] as (string | number)[]);

  const visits: [string, string, string, string, string, string, number | null, number, number | null, number | null][] = [
    ['v-1', 'demo-1', day(-30), 'A-QS Hacker', '', 'Čistá pleť, první ošetření série.', 129000, 1, 129000, 1],
    ['v-2', 'demo-1', day(-9), 'A-QS Hacker', 'Domů vzorek čisticího gelu.', 'Pleť klidnější, méně komedonů.', 122550, 1, 122550, 2],
    ['v-3', 'demo-2', day(-14), 'Hydratační ošetření s maskou', 'Hyaluronové sérum, alginátová maska', 'Doporučena domácí hydratace.', 115000, 0, null, null],
    ['v-4', 'demo-3', day(-5), 'Konzultace a jemné čištění', 'Enzymatický peeling', 'Bez mechanického čištění kvůli léčbě.', 60000, 0, null, null],
    ['v-5', 'demo-4', day(-40), 'Lifting řas a laminace obočí', '', '', 90000, 0, null, null],
    ['v-6', 'demo-5', day(-110), 'Čištění pleti', '', '', 89000, 0, null, null],
    ['v-7', 'demo-6', day(-250), 'Kosmetická masáž + gelová maska', '', '', 59000, 0, null, null],
    ['v-8', 'demo-6', day(-160), 'Kosmetická masáž + gelová maska', '', '', 59000, 0, null, null],
    ['v-9', 'demo-6', day(-125), 'Mandelic Forte Peel', '', '', 129000, 0, null, null],
    ['v-10', 'demo-7', day(-200), 'Hyaluron Collagen 3D Lift', '', '', 149000, 0, null, null],
    ['v-11', 'demo-8', day(-95), 'Laminace obočí', '', '', 69000, 0, null, null],
  ];
  run("UPDATE clients SET contacted_at=? WHERE id='demo-7'", [day(-6)]);
  for (const v of visits) run('INSERT INTO visits (id,client_id,date,treatment,products,notes,revenue_cents,clean_skin,program_price_cents,program_step) VALUES (?,?,?,?,?,?,?,?,?,?)', v);
  // Přípravky u návštěv: místo volného textu seznam s množstvím (u v-1 a v-2 zůstává ukázka staršího textového zápisu).
  const used: [string, string, string][] = [['v-3', 'Hydratační sérum s kyselinou hyaluronovou', '3 ml'], ['v-3', 'Alginátová maska', '1 sáček'], ['v-4', 'Enzymatický peeling', '2 ml'],
    ['v-5', 'Lash lifting set', ''], ['v-5', 'Barva na řasy černá', ''], ['v-6', 'Čisticí gel pro citlivou pleť', ''], ['v-6', 'Enzymatický peeling', '2 ml'], ['v-9', 'Mandelic Forte Peel', '1 vrstva'], ['v-10', 'Hyaluron Collagen 3D ampule', '1 ampule']];
  used.forEach(([visitId, name, amount], i) => run('INSERT INTO visit_products (id,visit_id,sort,product_id,name,amount,created) VALUES (?,?,?,?,?,?,?)', ['vp-' + i, visitId, i, null, name, amount, now]));
  run("UPDATE visits SET products='' WHERE id IN ('v-3','v-4')", []);

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
  // Ukázka SMS připomínky: zítřejší termín už připomínku dostal.
  run("UPDATE bookings SET reminded_start=start_at,reminded_at=? WHERE id='b-1' AND start_at<?", [day(0) + 'T08:00:00.000Z', day(2)]);
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
  // Sklad: [název, cena, kusů, minimum, nákupní cena]; vzorky masek se nesledují.
  const products: [string, number, number | null, number | null, number | null][] = [['Čisticí gel pro citlivou pleť', 590, 6, 2, 320], ['Hydratační sérum s kyselinou hyaluronovou', 1290, 1, 2, 690], ['Krém s SPF 50', 790, 9, 3, 410], ['Pleťová maska – vzorek', 120, null, null, null]];
  products.forEach(([name, price, stock, min, cost], i) => {
    run('INSERT INTO products (id,name,price_cents,active,sort,stock,min_stock,cost_cents,created) VALUES (?,?,?,1,?,?,?,?,?)', ['p-' + i, name, price * 100, i, stock, min, cost === null ? null : cost * 100, now]);
    if (stock !== null) {
      run("INSERT INTO stock_moves (id,product_id,date,kind,delta,stock_after,note,created) VALUES (?,?,?,'start',?,?,'Počáteční stav',?)", ['sm-a' + i, 'p-' + i, day(-60) + 'T09:00', stock + 4, stock + 4, now]);
      run("INSERT INTO stock_moves (id,product_id,date,kind,delta,stock_after,note,created) VALUES (?,?,?,'sale',-3,?,'Účtenky',?)", ['sm-b' + i, 'p-' + i, day(-20) + 'T15:00', stock + 1, now]);
      run("INSERT INTO stock_moves (id,product_id,date,kind,delta,stock_after,note,created) VALUES (?,?,?,'use',-1,?,'Tester',?)", ['sm-c' + i, 'p-' + i, day(-7) + 'T10:00', stock, now]);
    }
  });
  const year = Number(day(0).slice(0, 4)), dna = service('DNA Glow Rebirth');
  const receipt = (seq: number, bookingId: string | null, clientId: string | null, clientName: string, issued: string, items: {name: string; qty: number; unitCents: number; kind: string}[], method: string, paid: number) => {
    const total = items.reduce((a, x) => a + x.qty * x.unitCents, 0);
    run('INSERT INTO receipts (id,year,seq,number,booking_id,client_id,client_name,issued,items,total_cents,prepaid_cents,due_cents,method,paid,vs,status,note,created) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?)',
      ['r-' + seq, year, seq, `${year}/${String(seq).padStart(4, '0')}`, bookingId, clientId, clientName, issued, JSON.stringify(items), total, total, method, paid, `${year}${String(seq).padStart(4, '0')}`, 'issued', '', now]);
  };
  receipt(1, 'b-9', 'demo-4', 'Petra Svobodová', workday(-1) + 'T17:05', [{name: dna.name, qty: 1, unitCents: dna.price, kind: 'service'}, {name: 'Krém s SPF 50', qty: 1, unitCents: 79000, kind: 'product'}], 'card', 1);
  receipt(2, null, 'demo-1', 'Tereza Nováková', day(0) + 'T10:30', [{name: 'Čisticí gel pro citlivou pleť', qty: 2, unitCents: 59000, kind: 'product'}], 'qr', 0);
  // Historie za posledních devět měsíců pro statistiky (vymyšlená ošetření a účtenky).
  const popular = ['A-QS Hacker', 'Carelika Basic Skin Care', 'Čištění pleti', 'Derma Collage', 'Hyaluron Collagen 3D Lift', 'Lash Lifting řas', 'Laminace obočí', 'Kosmetická masáž + gelová maska', 'Mandelic Forte Peel', 'DNA Glow Rebirth', 'Mikrojehličkování – základní ošetření'];
  const names = ['Eva K.', 'Jana P.', 'Klára M.', 'Lenka S.', 'Monika V.', 'Hana R.', 'Ivana B.', 'Zuzana T.'];
  const seqs = new Map<number, number>([[year, 2]]); let n = 0;
  for (let back = 1; back <= 9; back++) {
    const visitsInMonth = 14 + ((back * 7) % 9);
    for (let k = 0; k < visitsInMonth; k++) {
      const x = service(popular[(k * 3 + back) % popular.length]), offset = -back * 30 + (k % 26) - 12;
      const [start, end] = at(offset, ['09:00', '11:00', '13:30', '15:30', '17:30'][k % 5], x.minutes), id = 'h-' + (++n), who = names[(k + back) % names.length];
      const status = k % 13 === 5 ? 'no_show' : k % 11 === 7 ? 'cancelled' : 'done';
      run('INSERT INTO bookings (id,service_id,start_at,end_at,service_name,price_cents,name,phone,email,note,status,source,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [id, x.id, start, end, x.name, x.price, who, '', '', '', status, k % 2 ? 'online' : 'salon', now]);
      if (status !== 'done') continue;
      const items = [{name: x.name, qty: 1, unitCents: x.price, kind: 'service'}, ...(k % 4 === 0 ? [{name: 'Krém s SPF 50', qty: 1, unitCents: 79000, kind: 'product'}] : [])];
      const gross = items.reduce((a, y) => a + y.unitCents, 0), discount = k % 6 === 0 ? Math.round(gross / 1000) * 100 : 0, total = gross - discount, y = Number(start.slice(0, 4));
      const seq = (seqs.get(y) || 0) + 1; seqs.set(y, seq);
      run('INSERT INTO receipts (id,year,seq,number,booking_id,client_id,client_name,issued,items,total_cents,prepaid_cents,due_cents,method,paid,vs,status,note,discount_cents,discount_label,created) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,1,?,?,?,?,?,?)',
        ['rh-' + n, y, seq, `${y}/${String(seq).padStart(4, '0')}`, id, null, who, end, JSON.stringify(items), total, total, ['cash', 'card', 'qr'][k % 3], `${y}${String(seq).padStart(4, '0')}`, 'issued', '', discount, discount ? '10 %' : '', now]);
    }
  }
  // Dárkové poukazy (vymyšlená jména): platné, brzy vyprší, prošlý, částečně a úplně vyčerpaný, na ošetření.
  const vouchers: [string, string, 'value' | 'service', string, number, number, string, string, number, number][] = [
    ['v-1', 'KQ4M-7XPA', 'value', '', 150000, 150000, 'Tereza Malá', 'Jana Malá', -20, 163],
    ['v-2', 'H8RT-2NWE', 'value', '', 100000, 100000, 'Lenka Dvořáková', 'Martin Dvořák', -170, 13],
    ['v-3', 'PZ6C-9LDU', 'service', 'A-QS Hacker', 129000, 129000, 'Eva Horáková', 'Petr Horák', -60, 123],
    ['v-4', 'M3VB-8KYS', 'value', '', 200000, 70000, 'Klára Benešová', '', -120, 63],
    ['v-5', 'W7JF-4QHE', 'value', '', 50000, 50000, 'Simona Krejčí', 'Simona Krejčí', -250, -35],
    ['v-6', 'R2XD-6GNT', 'value', '', 100000, 0, 'Petra Nováková', 'Petra Nováková', -100, 83],
  ];
  for (const [id, code, kind, serviceName, value, balance, recipient, buyer, issuedOffset, validOffset] of vouchers) {
    const issued = day(issuedOffset), y = Number(issued.slice(0, 4)), seq = (seqs.get(y) || 0) + 1; seqs.set(y, seq);
    const receiptId = 'rv-' + id, items = [{name: `Dárkový poukaz ${code}${serviceName ? ' – ' + serviceName : ''}`, qty: 1, unitCents: value, kind: 'voucher'}];
    run('INSERT INTO receipts (id,year,seq,number,booking_id,client_id,client_name,issued,items,total_cents,prepaid_cents,due_cents,method,paid,vs,status,note,discount_cents,discount_label,created) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,1,?,?,?,0,?,?)',
      [receiptId, y, seq, `${y}/${String(seq).padStart(4, '0')}`, null, null, buyer, issued + 'T10:00', JSON.stringify(items), value, value, 'card', `${y}${String(seq).padStart(4, '0')}`, 'issued', '', '', now]);
    run('INSERT INTO vouchers (id,code,kind,service_name,value_cents,balance_cents,buyer_name,buyer_contact,recipient_name,note,issued,valid_until,status,receipt_id,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [id, code, kind, serviceName, value, balance, buyer, buyer ? '777 000 111' : '', recipient, '', issued, day(validOffset), 'active', receiptId, now]);
    if (balance < value) run('INSERT INTO voucher_uses (id,voucher_id,receipt_id,date,amount_cents,note,created) VALUES (?,?,?,?,?,?,?)', ['vu-' + id, id, null, day(issuedOffset + 30), value - balance, 'Uplatněno při ošetření', now]);
  }

  // Platba kauce z dřívějšího výpisu banky, spárovaná podle variabilního symbolu.
  run("INSERT INTO bank_payments (id,date,amount_cents,vs,account,name,message,operation,status,match_kind,match_id,match_label,imported) VALUES ('demo-bp-1',?,70000,?,'1234567890/0800','HORÁKOVÁ LUCIE','Kauce','Příchozí úhrada okamžitá','matched','deposit','b-7',?,?)",
    [day(-2), kStart.slice(2, 10).replace(/-/g, '') + '1042', `Kauce: Lucie Horáková, 3D Architect ${kStart.slice(0, 10).split('-').reverse().map(Number).join('. ')}`, now]);

  // Objednávka poukazu z webu, která čeká na platbu.
  run('INSERT INTO vouchers (id,code,kind,service_name,value_cents,balance_cents,buyer_name,buyer_contact,recipient_name,note,issued,valid_until,status,receipt_id,source,buyer_email,delivery,vs,pay_due,token,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ['v-7', 'C5NA-3RTY', 'value', '', 200000, 200000, 'Ondřej Svoboda', '777 000 222, ondrej@example.cz', 'Hana', 'K narozeninám', day(-1), day(182), 'pending', null, 'online', 'ondrej@example.cz', 'email', '9' + day(-1).slice(2).replace(/-/g, '') + '417', day(4), 'd'.repeat(40), now]);

  const bookingSettings = {...DEFAULT_SETTINGS, smsReminders: true, voucherOnline: true, account: '331122037/0300', accountName: 'STUDIO I AM', businessName: 'STUDIO I AM', businessOwner: 'Andrea Marešová', businessAddress: 'Nerudova 884/11, 500 02 Hradec Králové', businessId: '73975052', businessPhone: '775 963 462', programEnabled: true};
  run("INSERT INTO settings (key,value) VALUES ('booking',?)", [JSON.stringify(bookingSettings)]);
  // Ukázkové dotazníky: Tereza vyplnila (s upozorněním), Lucie má odkaz, který čeká na vyplnění.
  const answers = Object.fromEntries(INTAKE_QUESTIONS.map(q => [q.id, {yes: q.id === 'allergy' || q.id === 'lenses', detail: q.id === 'allergy' ? 'parfemace, lanolin' : ''}]));
  run("INSERT INTO intake_forms (id,client_id,token,status,answers,birth_date,consent_health,consent_photos,signed_name,signature,consent_text,submitted_at,created) VALUES ('i-1','demo-1',?,'done',?,'1991-05-14',1,1,'Tereza Nováková',?,?,?,?)",
    ['b'.repeat(40), JSON.stringify(answers), DEMO_SIGNATURE, consentText(bookingSettings) + '\n\n' + PHOTO_CONSENT, day(-31) + 'T18:20:00.000Z', day(-32) + 'T09:00:00.000Z']);
  run("INSERT INTO intake_forms (id,client_id,token,status,created) VALUES ('i-2','demo-2',?,'sent',?)", ['c'.repeat(40), day(-1) + 'T09:00:00.000Z']);

  const photos: [string, string, string, string, number][] = [
    ['p-1', 'demo-1', day(-30), 'Před ošetřením', 18],
    ['p-2', 'demo-1', day(-9), 'Po druhém ošetření', 30],
  ];
  for (const [id, clientId, date, caption, hue] of photos) {
    put('photos/' + id, await placeholder(caption, hue));
    run('INSERT INTO photos (id,client_id,object_key,mime,date,caption,created) VALUES (?,?,?,?,?,?,?)', [id, clientId, 'photos/' + id, 'image/png', date, caption, now]);
  }
}
