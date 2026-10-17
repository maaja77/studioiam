// Faktury za zboží od dodavatelů. Položky propojené s produktem ve Skladu se při uložení naskladní
// (pohyb „delivery“ s odkazem na fakturu) a produktu se uloží nákupní cena; smazání faktury naskladnění vrátí.
import {database, photoStorage} from '../../../db/raw';
import {isDate, salonNow} from '../../../lib/booking';
import {parseRevenue} from '../../../lib/revenue';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
type DB = ReturnType<typeof database>;

export type InvoiceItem = {id: string; productId: string | null; name: string; qty: number; unitCostCents: number | null; stocked: number};
export type Invoice = {id: string; supplier: string; number: string; date: string; due: string | null; totalCents: number; paid: number; fileMime: string | null; fileName: string; note: string; items: InvoiceItem[]};
const COLUMNS = 'id,supplier,number,date,due,total_cents AS totalCents,paid,file_mime AS fileMime,file_name AS fileName,note';
const MAX_FILE = 10 * 1024 * 1024;

export async function invoicesBetween(db: DB, from: string, to: string) {
  const [rows, items] = await db.batch([
    db.prepare(`SELECT ${COLUMNS} FROM invoices WHERE date>=? AND date<? ORDER BY date DESC,created DESC`).bind(from, to),
    db.prepare('SELECT i.invoice_id AS invoiceId,i.id,i.product_id AS productId,i.name,i.qty,i.unit_cost_cents AS unitCostCents,i.stocked FROM invoice_items i JOIN invoices v ON v.id=i.invoice_id WHERE v.date>=? AND v.date<? ORDER BY i.sort').bind(from, to),
  ]) as {results: Record<string, unknown>[]}[];
  return (rows.results as Omit<Invoice, 'items'>[]).map(r => ({...r, items: (items.results as (InvoiceItem & {invoiceId: string})[]).filter(i => i.invoiceId === r.id).map(({invoiceId: _, ...i}) => i)}));
}

/** Typ souboru podle obsahu: PDF, JPG, PNG nebo WebP. */
function fileType(b: Uint8Array) {
  const head = new TextDecoder().decode(b.slice(0, 12));
  if (head.startsWith('%PDF')) return 'application/pdf';
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((x, i) => b[i] === x)) return 'image/png';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp';
  return '';
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams, db = database(), fileId = params.get('file');
    if (fileId) {
      const row = await db.prepare('SELECT file_key AS fileKey,file_mime AS fileMime FROM invoices WHERE id=?').bind(fileId).first<{fileKey: string | null; fileMime: string}>();
      const object = row?.fileKey ? await photoStorage().get(row.fileKey) : null;
      if (!object) return json({error: 'Soubor faktury není dostupný.'}, 404);
      return new Response(object.body, {headers: {'Content-Type': row!.fileMime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `inline; filename="faktura-${fileId.slice(0, 8)}"`}});
    }
    const year = /^\d{4}$/.test(params.get('year') || '') ? params.get('year')! : salonNow().slice(0, 4);
    const [list, suppliers] = await Promise.all([
      invoicesBetween(db, `${year}-01-01`, `${year}-12-99`),
      db.prepare('SELECT supplier FROM invoices GROUP BY supplier ORDER BY max(date) DESC LIMIT 50').all<{supplier: string}>(),
    ]);
    return json({year, invoices: list, suppliers: suppliers.results.map(s => s.supplier)});
  } catch (e) { console.error(e); return json({error: 'Faktury se nepodařilo načíst. Zkuste to znovu.'}, 503); }
}

type ItemInput = {productId?: unknown; newProduct?: unknown; name?: unknown; qty?: unknown; cost?: unknown; price?: unknown};

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({error: 'Nepovolený požadavek.'}, 403);
    if (Number(request.headers.get('content-length') || 0) > MAX_FILE + 512 * 1024) return json({error: 'Soubor faktury může mít nejvýše 10 MB.'}, 413);
    // Uložení posílá formulář (data jako JSON + nepovinný soubor), ostatní operace čisté JSON.
    let body: {action?: string; data?: Record<string, unknown>}, file: File | null = null;
    if ((request.headers.get('content-type') || '').includes('multipart/form-data')) {
      const form = await request.formData(), f = form.get('file');
      body = JSON.parse(String(form.get('data') || '{}')); file = f instanceof File && f.size ? f : null;
    } else body = await request.json();
    const d = body.data || {}, db = database(), now = new Date().toISOString();
    const text = (k: string, max: number) => typeof d[k] === 'string' ? (d[k] as string).trim().slice(0, max) : '';
    const money = (v: unknown) => { try { return parseRevenue(typeof v === 'number' ? String(v) : v); } catch { return undefined; } };
    const id = text('id', 64), existing = id ? await db.prepare('SELECT id,file_key AS fileKey FROM invoices WHERE id=?').bind(id).first<{id: string; fileKey: string | null}>() : null;
    if (id && !existing) return json({error: 'Faktura nebyla nalezena.'}, 404);

    if (body.action === 'delete') {
      if (!existing) return json({error: 'Faktura nebyla nalezena.'}, 404);
      // Vrácení naskladnění: kusy z faktury se odečtou, pohyby skladu se smažou.
      const moves = await db.prepare('SELECT product_id AS productId,delta FROM stock_moves WHERE invoice_id=?').bind(id).all<{productId: string; delta: number}>();
      await db.batch([...moves.results.map(m => db.prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock IS NOT NULL').bind(m.delta, m.productId)),
        db.prepare('DELETE FROM stock_moves WHERE invoice_id=?').bind(id), db.prepare('DELETE FROM invoices WHERE id=?').bind(id)]);
      if (existing.fileKey) await photoStorage().delete(existing.fileKey);
      return json({ok: true, returned: moves.results.length});
    }
    if (body.action === 'paid') {
      if (!existing) return json({error: 'Faktura nebyla nalezena.'}, 404);
      await db.prepare('UPDATE invoices SET paid=? WHERE id=?').bind(d.paid === true ? 1 : 0, id).run();
      return json({ok: true});
    }
    if (body.action !== 'save') return json({error: 'Neplatná operace.'}, 400);

    const supplier = text('supplier', 120), number = text('number', 40), date = text('date', 10), due = text('due', 10) || null, note = text('note', 500);
    if (!supplier) return json({error: 'Vyplňte dodavatele.'}, 400);
    if (!isDate(date)) return json({error: 'Vyplňte datum faktury.'}, 400);
    if (due && !isDate(due)) return json({error: 'Zkontrolujte datum splatnosti.'}, 400);
    const total = money(d.total);
    if (total === undefined || total === null) return json({error: 'Zadejte částku faktury v Kč, například 4 520 nebo 4520,50.'}, 400);
    let bytes: Uint8Array | null = null, mime = '';
    if (file) {
      if (file.size > MAX_FILE) return json({error: 'Soubor faktury může mít nejvýše 10 MB.'}, 400);
      bytes = new Uint8Array(await file.arrayBuffer()); mime = fileType(bytes);
      if (!mime) return json({error: 'Fakturu nahrajte jako PDF nebo fotku (JPG, PNG, WebP).'}, 400);
    }
    const header = [supplier, number, date, due, total, d.paid === true ? 1 : 0, note];

    // Úprava uložené faktury mění jen hlavičku a soubor; položky a naskladnění zůstávají (pro změnu fakturu smažte a zadejte znovu).
    if (existing) {
      const key = bytes ? 'invoices/' + id + '-' + crypto.randomUUID().slice(0, 8) : null;
      if (key) await photoStorage().put(key, bytes!, {httpMetadata: {contentType: mime}});
      await db.prepare('UPDATE invoices SET supplier=?,number=?,date=?,due=?,total_cents=?,paid=?,note=?' + (key ? ',file_key=?,file_mime=?,file_name=?' : '') + ' WHERE id=?')
        .bind(...header, ...(key ? [key, mime, file!.name.slice(0, 120)] : []), id).run();
      if (key && existing.fileKey) await photoStorage().delete(existing.fileKey);
      return json({ok: true, id});
    }

    const raw = Array.isArray(d.items) ? d.items as ItemInput[] : [];
    if (raw.length > 80) return json({error: 'Faktura může mít nejvýše 80 položek.'}, 400);
    const productIds = raw.map(i => typeof i.productId === 'string' ? i.productId : '').filter(Boolean);
    const products = productIds.length ? (await db.prepare(`SELECT id,name,stock FROM products WHERE id IN (${productIds.map(() => '?').join(',')})`).bind(...productIds).all<{id: string; name: string; stock: number | null}>()).results : [];
    const invoiceId = crypto.randomUUID(), statements = [], moveDate = date === salonNow().slice(0, 10) ? salonNow() : date + 'T12:00';
    const label = `Faktura ${number || 'bez čísla'} (${supplier})`.slice(0, 200);
    let stocked = 0;
    const key = bytes ? 'invoices/' + invoiceId : null;
    statements.push(db.prepare('INSERT INTO invoices (id,supplier,number,date,due,total_cents,paid,note,file_key,file_mime,file_name,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(invoiceId, ...header, key, key ? mime : null, key ? file!.name.slice(0, 120) : '', now));
    for (const [n, item] of raw.entries()) {
      const qty = Number(item.qty), cost = money(item.cost);
      if (!Number.isInteger(qty) || qty < 1 || qty > 99999) return json({error: `Položka ${n + 1}: zadejte počet kusů (1 a víc).`}, 400);
      if (cost === undefined) return json({error: `Položka ${n + 1}: zadejte nákupní cenu za kus v Kč, nebo ji nechte prázdnou.`}, 400);
      let productId = typeof item.productId === 'string' && item.productId ? item.productId : null, name = typeof item.name === 'string' ? item.name.trim().slice(0, 150) : '';
      let tracked = false;
      if (productId) {
        const p = products.find(x => x.id === productId);
        if (!p) return json({error: `Položka ${n + 1}: produkt ve Skladu nebyl nalezen.`}, 400);
        name = name || p.name; tracked = p.stock !== null;
      } else if (item.newProduct === true) {
        // Nový produkt ze Skladu: sleduje se od 0 kusů a hned se naskladní.
        if (!name) return json({error: `Položka ${n + 1}: vyplňte název nového produktu.`}, 400);
        const price = money(item.price);
        if (price === undefined || price === null) return json({error: `Položka ${n + 1}: zadejte prodejní cenu nového produktu v Kč.`}, 400);
        productId = crypto.randomUUID(); tracked = true;
        statements.push(db.prepare('INSERT INTO products (id,name,price_cents,active,sort,stock,min_stock,cost_cents,created) VALUES (?,?,?,1,(SELECT coalesce(max(sort),0)+1 FROM products),0,1,?,?)').bind(productId, name, price, cost, now));
      }
      if (!name) return json({error: `Položka ${n + 1}: vyplňte název.`}, 400);
      statements.push(db.prepare('INSERT INTO invoice_items (id,invoice_id,sort,product_id,name,qty,unit_cost_cents,stocked,created) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), invoiceId, n, productId, name, qty, cost, tracked ? 1 : 0, now));
      if (productId && cost) statements.push(db.prepare('UPDATE products SET cost_cents=? WHERE id=?').bind(cost, productId));
      if (productId && tracked) {
        stocked++;
        statements.push(db.prepare('UPDATE products SET stock=stock+? WHERE id=?').bind(qty, productId),
          db.prepare("INSERT INTO stock_moves (id,product_id,date,kind,delta,stock_after,receipt_id,invoice_id,note,created) SELECT ?,id,?,'delivery',?,stock,NULL,?,?,? FROM products WHERE id=?").bind(crypto.randomUUID(), moveDate, qty, invoiceId, label, now, productId));
      }
    }
    if (key) await photoStorage().put(key, bytes!, {httpMetadata: {contentType: mime}});
    try { await db.batch(statements); } catch (e) { if (key) await photoStorage().delete(key); throw e; }
    return json({ok: true, id: invoiceId, stocked});
  } catch (e) { console.error(e); return json({error: 'Fakturu se nepodařilo uložit. Zkuste to znovu.'}, 503); }
}
