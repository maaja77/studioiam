// Produkty a sklad: ceník produktů, stav zásob, naskladnění, spotřeba v salonu, inventura a historie pohybů.
// Prodej na účtence odečítá sklad v API účtenek, stejně jako spotřební materiál podle ošetření na účtence.
// Druhy: domácí péče k prodeji (kind='sale'), produkty na ošetření ('pro', jen sklad a přípravky u návštěv)
// a spotřební materiál ('supply', nákupní cena za balení po pack_size kusech). Jen 'sale' se nabízí na účtence.
import {database} from '../../../db/raw';
import {salonNow} from '../../../lib/booking';
import {parseRevenue} from '../../../lib/revenue';
import type {StockMove, StockProduct} from '../../../lib/stock';
import {ALL_SERVICES, recipeFor, STARTER_SUPPLIES, type SupplyRow} from '../../../lib/supplies';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
export const PRODUCT_COLUMNS = 'id,name,price_cents AS priceCents,active,sort,stock,min_stock AS minStock,cost_cents AS costCents,kind,pack_size AS packSize';

export async function GET(request: Request) {
  try {
    const db = database(), id = new URL(request.url).searchParams.get('productId');
    if (id) {
      const moves = await db.prepare('SELECT id,product_id AS productId,date,kind,delta,stock_after AS stockAfter,receipt_id AS receiptId,note FROM stock_moves WHERE product_id=? ORDER BY date DESC,created DESC LIMIT 100').bind(id).all<StockMove>();
      return json({moves: moves.results});
    }
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const [products, sold, services, supplies, used, treated] = await db.batch([
      db.prepare(`SELECT ${PRODUCT_COLUMNS} FROM products ORDER BY sort,name`),
      // Prodané kusy za posledních 90 dní: podle nich se dá odhadnout, na jak dlouho zásoba vystačí.
      db.prepare("SELECT product_id AS productId,-sum(delta) AS qty FROM stock_moves WHERE kind IN ('sale','return') AND date>=? GROUP BY product_id").bind(new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)),
      db.prepare('SELECT id,name,category FROM services WHERE active=1 ORDER BY sort,name'),
      db.prepare('SELECT service_key AS serviceKey,product_id AS productId,qty FROM service_supplies'),
      // Skutečná spotřeba při ošetřeních za 30 dní (odpis podle účtenek) a počet ošetřených klientek.
      db.prepare("SELECT product_id AS productId,-sum(delta) AS qty FROM stock_moves WHERE kind='supply' AND date>=? GROUP BY product_id").bind(since),
      db.prepare("SELECT count(DISTINCT receipt_id) AS n FROM stock_moves WHERE kind='supply' AND delta<0 AND date>=? AND receipt_id IN (SELECT id FROM receipts WHERE status='issued')").bind(since),
    ]) as {results: Record<string, unknown>[]}[];
    return json({products: products.results, sold90: Object.fromEntries(sold.results.map(r => [r.productId, r.qty])), services: services.results, supplies: supplies.results,
      used30: Object.fromEntries(used.results.map(r => [r.productId, r.qty])), treated30: Number((treated.results[0] as {n: number}).n)});
  } catch (e) { console.error(e); return json({error: 'Sklad se nepodařilo načíst. Zkuste to znovu.'}, 503); }
}

const MOVE_NOTES: Record<string, string> = {delivery: 'Naskladnění', use: 'Spotřeba v salonu', count: 'Inventura', start: 'Počáteční stav'};

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({error: 'Nepovolený požadavek.'}, 403);
    const body = await request.json() as {action?: string; data?: Record<string, unknown>};
    const d = body.data || {}, db = database(), now = new Date().toISOString();
    const field = (k: string, max = 200) => typeof d[k] === 'string' ? (d[k] as string).trim().slice(0, max) : '';
    const count = (k: string) => { const v = d[k]; if (v === '' || v === null || v === undefined) return null; const n = Number(String(v).replace(/\s/g, '')); return Number.isInteger(n) ? n : NaN; };
    const money = (k: string) => { try { return parseRevenue(typeof d[k] === 'number' ? String(d[k]) : d[k]); } catch { return undefined; } };

    if (body.action === 'recipe') return saveRecipe(db, field('serviceKey', 64), d.items, now);
    if (body.action === 'starter') return starter(db, now);
    if (body.action === 'save') {
      const name = field('name', 150), supply = d.kind === 'supply', kind = supply || d.kind === 'pro' ? d.kind as string : 'sale';
      if (!name) return json({error: supply ? 'Vyplňte název materiálu.' : 'Vyplňte název produktu.'}, 400);
      const price = kind !== 'sale' ? 0 : money('price'), cost = money('cost'), pack = supply ? count('packSize') : null;
      if (price === undefined || price === null) return json({error: 'Zadejte prodejní cenu v Kč, například 590 nebo 590,50.'}, 400);
      if (pack !== null && (Number.isNaN(pack) || pack < 1 || pack > 100000)) return json({error: 'Počet kusů v balení musí být celé číslo 1–100 000.'}, 400);
      if (cost === undefined) return json({error: 'Zadejte nákupní cenu v Kč, nebo ji nechte prázdnou.'}, 400);
      const track = d.track === true, minStock = count('minStock'), start = count('stock');
      if (track && (Number.isNaN(minStock) || (minStock !== null && (minStock < 0 || minStock > 9999)))) return json({error: 'Minimum na skladě musí být celé číslo 0–9999.'}, 400);
      const id = field('id') || crypto.randomUUID(), old = await db.prepare('SELECT stock FROM products WHERE id=?').bind(id).first<{stock: number | null}>();
      const startTracking = track && (old?.stock === null || old?.stock === undefined);
      if (startTracking && (start === null || Number.isNaN(start) || start < 0 || start > 99999)) return json({error: 'Zadejte, kolik kusů máte teď na skladě.'}, 400);
      const statements = [db.prepare('INSERT INTO products (id,name,price_cents,active,sort,stock,min_stock,cost_cents,kind,pack_size,created) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,price_cents=excluded.price_cents,active=excluded.active,sort=excluded.sort,stock=CASE WHEN excluded.stock IS NULL THEN NULL WHEN products.stock IS NULL THEN excluded.stock ELSE products.stock END,min_stock=excluded.min_stock,cost_cents=excluded.cost_cents,kind=excluded.kind,pack_size=excluded.pack_size')
        .bind(id, name, price, kind !== 'sale' || d.active !== false ? 1 : 0, Number.isInteger(d.sort) ? d.sort as number : 0, !track ? null : startTracking ? start : old!.stock, track ? minStock : null, cost, kind, pack, now)];
      if (startTracking) statements.push(db.prepare("INSERT INTO stock_moves (id,product_id,date,kind,delta,stock_after,receipt_id,note,created) VALUES (?,?,?,'start',?,?,NULL,?,?)").bind(crypto.randomUUID(), id, salonNow(), start, start, MOVE_NOTES.start, now));
      if (!track) statements.push(db.prepare('DELETE FROM stock_moves WHERE product_id=?').bind(id));
      await db.batch(statements);
      return json({ok: true, id});
    }

    const id = field('id', 64), p = await db.prepare(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id=?`).bind(id).first<StockProduct>();
    if (!p) return json({error: 'Produkt nebyl nalezen.'}, 404);
    if (body.action === 'delete') { await db.prepare('DELETE FROM products WHERE id=?').bind(id).run(); return json({ok: true}); }

    // Naskladnění (+), spotřeba v salonu (−) a inventura (skutečný počet kusů).
    if (body.action === 'move') {
      if (p.stock === null) return json({error: 'U tohoto produktu se sklad nesleduje. Zapněte to v úpravě produktu.'}, 409);
      const kind = field('kind', 20), qty = count('qty');
      if (!['delivery', 'use', 'count'].includes(kind)) return json({error: 'Neplatná operace.'}, 400);
      if (qty === null || Number.isNaN(qty) || qty < (kind === 'count' ? 0 : 1) || qty > 99999) return json({error: kind === 'count' ? 'Zadejte, kolik kusů skutečně máte (0 a víc).' : 'Zadejte počet kusů (1 a víc).'}, 400);
      // Spotřební materiál se naskladňuje po baleních, sklad je v kusech.
      const pieces = kind === 'delivery' && p.kind === 'supply' && p.packSize ? qty * p.packSize : qty;
      const delta = kind === 'delivery' ? pieces : kind === 'use' ? -qty : qty - p.stock;
      if (kind === 'count' && delta === 0) return json({ok: true, unchanged: true});
      const cost = kind === 'delivery' ? money('cost') : null;
      if (cost === undefined) return json({error: 'Zadejte nákupní cenu za kus v Kč, nebo ji nechte prázdnou.'}, 400);
      const note = field('note', 200) || MOVE_NOTES[kind] + (kind === 'count' ? ` (${delta > 0 ? '+' : ''}${delta} ks)` : pieces !== qty ? ` (${qty} bal.)` : '');
      await db.batch([
        db.prepare('UPDATE products SET stock=stock+?' + (cost ? ',cost_cents=?' : '') + ' WHERE id=?').bind(...(cost ? [delta, cost, id] : [delta, id])),
        db.prepare("INSERT INTO stock_moves (id,product_id,date,kind,delta,stock_after,receipt_id,note,created) SELECT ?,id,?,?,?,stock,NULL,?,? FROM products WHERE id=?").bind(crypto.randomUUID(), salonNow(), kind, delta, note, now, id),
      ]);
      return json({ok: true});
    }
    return json({error: 'Neplatná operace.'}, 400);
  } catch (e) { console.error(e); return json({error: 'Změnu skladu se nepodařilo uložit. Zkuste to znovu.'}, 503); }
}

type DB = ReturnType<typeof database>;
/** Uloží spotřebu na klientku. U ošetření se ukládají jen rozdíly proti výchozí spotřebě. */
async function saveRecipe(db: DB, serviceKey: string, raw: unknown, now: string) {
  if (!serviceKey) return json({error: 'Vyberte ošetření.'}, 400);
  if (serviceKey !== ALL_SERVICES && !await db.prepare('SELECT 1 FROM services WHERE id=?').bind(serviceKey).first()) return json({error: 'Ošetření nebylo nalezeno.'}, 404);
  const items = (Array.isArray(raw) ? raw : []).slice(0, 100).map(x => ({productId: String((x as {productId?: unknown}).productId || ''), qty: Number((x as {qty?: unknown}).qty)}));
  if (items.some(i => !Number.isInteger(i.qty) || i.qty < 0 || i.qty > 999)) return json({error: 'Počet kusů na klientku musí být celé číslo 0–999.'}, 400);
  const supplies = (await db.prepare("SELECT id FROM products WHERE kind='supply'").all<{id: string}>()).results.map(r => r.id);
  const valid = items.filter(i => supplies.includes(i.productId));
  const defaults = serviceKey === ALL_SERVICES ? new Map<string, number>() : recipeFor(null, (await db.prepare('SELECT service_key AS serviceKey,product_id AS productId,qty FROM service_supplies WHERE service_key=?').bind(ALL_SERVICES).all<SupplyRow>()).results);
  const rows = serviceKey === ALL_SERVICES ? valid.filter(i => i.qty > 0) : valid.filter(i => i.qty !== (defaults.get(i.productId) || 0));
  await db.batch([db.prepare('DELETE FROM service_supplies WHERE service_key=?').bind(serviceKey),
    ...rows.map(i => db.prepare('INSERT INTO service_supplies (id,service_key,product_id,qty,created) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(), serviceKey, i.productId, i.qty, now))]);
  return json({ok: true});
}

/** Založí běžný spotřební materiál (jen ten, který ještě chybí) s návrhem spotřeby; sklad se začne hlídat po zadání počtu kusů. */
async function starter(db: DB, now: string) {
  const [existing, services, sort] = await db.batch([db.prepare('SELECT id,name FROM products'), db.prepare('SELECT id,name FROM services'), db.prepare('SELECT coalesce(max(sort),0) AS n FROM products')]) as {results: {id: string; name: string; n?: number}[]}[];
  const fold = (t: string) => t.trim().toLocaleLowerCase('cs'), statements = [];
  let n = Number(sort.results[0].n || 0), added = 0;
  for (const item of STARTER_SUPPLIES) {
    if (existing.results.some(p => fold(p.name) === fold(item.name))) continue;
    const id = crypto.randomUUID(); added++;
    statements.push(db.prepare("INSERT INTO products (id,name,price_cents,active,sort,stock,min_stock,cost_cents,kind,pack_size,created) VALUES (?,?,0,1,?,NULL,NULL,NULL,'supply',?,?)").bind(id, item.name, ++n, item.pack, now));
    const keys = item.only ? services.results.filter(s => item.only!.test(s.name)).map(s => s.id) : [ALL_SERVICES];
    for (const key of keys) statements.push(db.prepare('INSERT OR IGNORE INTO service_supplies (id,service_key,product_id,qty,created) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(), key, id, item.perClient, now));
  }
  if (statements.length) await db.batch(statements);
  return json({ok: true, added});
}
