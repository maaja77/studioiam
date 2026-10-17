// Produkty a sklad: ceník produktů, stav zásob, naskladnění, spotřeba v salonu, inventura a historie pohybů.
// Prodej na účtence odečítá sklad v API účtenek.
import {database} from '../../../db/raw';
import {salonNow} from '../../../lib/booking';
import {parseRevenue} from '../../../lib/revenue';
import type {StockMove, StockProduct} from '../../../lib/stock';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
export const PRODUCT_COLUMNS = 'id,name,price_cents AS priceCents,active,sort,stock,min_stock AS minStock,cost_cents AS costCents';

export async function GET(request: Request) {
  try {
    const db = database(), id = new URL(request.url).searchParams.get('productId');
    if (id) {
      const moves = await db.prepare('SELECT id,product_id AS productId,date,kind,delta,stock_after AS stockAfter,receipt_id AS receiptId,note FROM stock_moves WHERE product_id=? ORDER BY date DESC,created DESC LIMIT 100').bind(id).all<StockMove>();
      return json({moves: moves.results});
    }
    const [products, sold] = await db.batch([
      db.prepare(`SELECT ${PRODUCT_COLUMNS} FROM products ORDER BY sort,name`),
      // Prodané kusy za posledních 90 dní: podle nich se dá odhadnout, na jak dlouho zásoba vystačí.
      db.prepare("SELECT product_id AS productId,-sum(delta) AS qty FROM stock_moves WHERE kind IN ('sale','return') AND date>=? GROUP BY product_id").bind(new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)),
    ]) as {results: Record<string, unknown>[]}[];
    return json({products: products.results, sold90: Object.fromEntries(sold.results.map(r => [r.productId, r.qty]))});
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

    if (body.action === 'save') {
      const name = field('name', 150);
      if (!name) return json({error: 'Vyplňte název produktu.'}, 400);
      const price = money('price'), cost = money('cost');
      if (price === undefined || price === null) return json({error: 'Zadejte prodejní cenu v Kč, například 590 nebo 590,50.'}, 400);
      if (cost === undefined) return json({error: 'Zadejte nákupní cenu v Kč, nebo ji nechte prázdnou.'}, 400);
      const track = d.track === true, minStock = count('minStock'), start = count('stock');
      if (track && (Number.isNaN(minStock) || (minStock !== null && (minStock < 0 || minStock > 9999)))) return json({error: 'Minimum na skladě musí být celé číslo 0–9999.'}, 400);
      const id = field('id') || crypto.randomUUID(), old = await db.prepare('SELECT stock FROM products WHERE id=?').bind(id).first<{stock: number | null}>();
      const startTracking = track && (old?.stock === null || old?.stock === undefined);
      if (startTracking && (start === null || Number.isNaN(start) || start < 0 || start > 99999)) return json({error: 'Zadejte, kolik kusů máte teď na skladě.'}, 400);
      const statements = [db.prepare('INSERT INTO products (id,name,price_cents,active,sort,stock,min_stock,cost_cents,created) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,price_cents=excluded.price_cents,active=excluded.active,sort=excluded.sort,stock=CASE WHEN excluded.stock IS NULL THEN NULL WHEN products.stock IS NULL THEN excluded.stock ELSE products.stock END,min_stock=excluded.min_stock,cost_cents=excluded.cost_cents')
        .bind(id, name, price, d.active === false ? 0 : 1, Number.isInteger(d.sort) ? d.sort as number : 0, !track ? null : startTracking ? start : old!.stock, track ? minStock : null, cost, now)];
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
      const delta = kind === 'delivery' ? qty : kind === 'use' ? -qty : qty - p.stock;
      if (kind === 'count' && delta === 0) return json({ok: true, unchanged: true});
      const cost = kind === 'delivery' ? money('cost') : null;
      if (cost === undefined) return json({error: 'Zadejte nákupní cenu za kus v Kč, nebo ji nechte prázdnou.'}, 400);
      const note = field('note', 200) || MOVE_NOTES[kind] + (kind === 'count' ? ` (${delta > 0 ? '+' : ''}${delta} ks)` : '');
      await db.batch([
        db.prepare('UPDATE products SET stock=stock+?' + (cost ? ',cost_cents=?' : '') + ' WHERE id=?').bind(...(cost ? [delta, cost, id] : [delta, id])),
        db.prepare("INSERT INTO stock_moves (id,product_id,date,kind,delta,stock_after,receipt_id,note,created) SELECT ?,id,?,?,?,stock,NULL,?,? FROM products WHERE id=?").bind(crypto.randomUUID(), salonNow(), kind, delta, note, now, id),
      ]);
      return json({ok: true});
    }
    return json({error: 'Neplatná operace.'}, 400);
  } catch (e) { console.error(e); return json({error: 'Změnu skladu se nepodařilo uložit. Zkuste to znovu.'}, 503); }
}
