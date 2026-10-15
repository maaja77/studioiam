// Vymyšlené ukázkové klientky pro náhled. Žádná skutečná data.
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

  const photos: [string, string, string, string, number][] = [
    ['p-1', 'demo-1', day(-30), 'Před ošetřením', 18],
    ['p-2', 'demo-1', day(-9), 'Po druhém ošetření', 30],
  ];
  for (const [id, clientId, date, caption, hue] of photos) {
    put('photos/' + id, await placeholder(caption, hue));
    run('INSERT INTO photos (id,client_id,object_key,mime,date,caption,created) VALUES (?,?,?,?,?,?,?)', [id, clientId, 'photos/' + id, 'image/png', date, caption, now]);
  }
}
