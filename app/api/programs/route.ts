// Programy salonu (série ošetření se slevou): přehled a úpravy v Nastavení. Klientky se do programu zařazují na kartě (API kartotéky).
import {database} from '../../../db/raw';
import {parseRevenue} from '../../../lib/revenue';
import {parseDiscounts, parseProgram, PROGRAM_COLUMNS} from '../../../lib/programs';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});

export async function GET() {
  try {
    const db = database();
    const [rows, counts] = await db.batch([
      db.prepare(`SELECT ${PROGRAM_COLUMNS} FROM programs ORDER BY sort,name`),
      db.prepare('SELECT p.id,(SELECT count(*) FROM client_programs c WHERE c.program_id=p.id) AS clients,(SELECT count(*) FROM visits v WHERE v.program_id=p.id) AS visits FROM programs p'),
    ]) as {results: Record<string, unknown>[]}[];
    const used = new Map(counts.results.map(r => [r.id, {clients: Number(r.clients), visits: Number(r.visits)}]));
    return json({programs: rows.results.map(r => ({...parseProgram(r), ...(used.get(r.id) || {clients: 0, visits: 0})}))});
  } catch (e) { console.error(e); return json({error: 'Programy se nepodařilo načíst.'}, 503); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({error: 'Nepovolený požadavek.'}, 403);
    const body = await request.json() as {action?: string; data?: Record<string, unknown>};
    const d = body.data || {}, db = database();
    const field = (k: string, max = 200) => typeof d[k] === 'string' ? (d[k] as string).trim().slice(0, max) : '';
    const id = field('id', 64);
    if (body.action === 'delete') {
      const used = await db.prepare('SELECT count(*) AS n FROM visits WHERE program_id=?').bind(id).first<{n: number}>();
      if (Number(used?.n) > 0) return json({error: 'V programu jsou zapsané návštěvy, proto ho nejde smazat. Můžete ho vypnout, z historie nezmizí.'}, 409);
      await db.batch([db.prepare('DELETE FROM client_programs WHERE program_id=?').bind(id), db.prepare('DELETE FROM programs WHERE id=?').bind(id)]);
      return json({ok: true});
    }
    if (body.action !== 'save') return json({error: 'Neplatná operace.'}, 400);
    const name = field('name', 80), treatment = field('treatment', 150), discounts = parseDiscounts(d.discounts), interval = Number(d.intervalDays);
    let price: number | null;
    try { price = parseRevenue(typeof d.price === 'number' ? String(d.price) : d.price); } catch { price = null; }
    if (!name) return json({error: 'Vyplňte název programu.'}, 400);
    if (!treatment) return json({error: 'Vyplňte ošetření, které program tvoří.'}, 400);
    if (!price) return json({error: 'Zadejte cenu ošetření v Kč, například 1290.'}, 400);
    if (typeof discounts === 'string') return json({error: discounts}, 400);
    if (!Number.isInteger(interval) || interval < 7 || interval > 365) return json({error: 'Odstup návštěv zadejte jako počet dní 7–365.'}, 400);
    const programId = id || crypto.randomUUID();
    await db.prepare('INSERT INTO programs (id,name,treatment,price_cents,discounts,interval_days,active,sort,created) VALUES (?,?,?,?,?,?,?,coalesce((SELECT sort FROM programs WHERE id=?),(SELECT coalesce(max(sort),-1)+1 FROM programs)),?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,treatment=excluded.treatment,price_cents=excluded.price_cents,discounts=excluded.discounts,interval_days=excluded.interval_days,active=excluded.active')
      .bind(programId, name, treatment, price, JSON.stringify(discounts), interval, d.active === false ? 0 : 1, programId, new Date().toISOString()).run();
    return json({ok: true, id: programId});
  } catch (e) { console.error(e); return json({error: 'Program se nepodařilo uložit.'}, 503); }
}
