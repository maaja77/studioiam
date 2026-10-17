// API účtenek a produktů: vystavení účtenky k ošetření nebo prodeji produktu, QR platba, storno.
// Salon není plátce DPH, účtenka proto obsahuje jen celkové částky bez daně.
import {database, mailEnabled, notifyClient, publicOrigin} from '../../../db/raw';
import {receiptMessage} from '../../../lib/receipt-message';
import {parseSettings, salonNow} from '../../../lib/booking';
import {parseRevenue} from '../../../lib/revenue';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
export const METHODS = ['cash', 'card', 'qr'];
export type ReceiptItem = {name: string; qty: number; unitCents: number; kind: 'service' | 'product' | 'other'};
const RECEIPT_COLUMNS = 'id,number,booking_id AS bookingId,client_id AS clientId,client_name AS clientName,issued,items,total_cents AS totalCents,prepaid_cents AS prepaidCents,due_cents AS dueCents,method,paid,vs,status,note,discount_cents AS discountCents,discount_label AS discountLabel';
type Row = Record<string, unknown> & {items: string};
const decode = (r: Row) => ({...r, items: JSON.parse(r.items) as ReceiptItem[]});

async function settings() {
  const row = await database().prepare("SELECT value FROM settings WHERE key='booking'").first<{value: string}>();
  return parseSettings(row?.value);
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams, db = database();
    if (params.get('id')) {
      const r = await db.prepare(`SELECT ${RECEIPT_COLUMNS} FROM receipts WHERE id=?`).bind(params.get('id')).first<Row>();
      if (!r) return json({error: 'Účtenka nebyla nalezena.'}, 404);
      // Kontakt pro odeslání účtenky: z karty klientky, jinak z rezervace.
      const contact = await db.prepare("SELECT coalesce(nullif(c.email,''),b.email,'') AS email,coalesce(nullif(c.phone,''),b.phone,'') AS phone FROM receipts r LEFT JOIN clients c ON c.id=r.client_id LEFT JOIN bookings b ON b.id=r.booking_id WHERE r.id=?").bind(params.get('id')).first<{email: string; phone: string}>();
      return json({receipt: decode(r), settings: await settings(), contact: contact || {email: '', phone: ''}, mail: mailEnabled()});
    }
    const month = /^\d{4}-\d{2}$/.test(params.get('month') || '') ? params.get('month')! : salonNow().slice(0, 7);
    const [list, products] = await db.batch([
      db.prepare(`SELECT ${RECEIPT_COLUMNS} FROM receipts WHERE issued>=? AND issued<? ORDER BY issued DESC`).bind(month + '-01', month + '-99'),
      db.prepare('SELECT id,name,price_cents AS priceCents,active,sort FROM products ORDER BY sort,name'),
    ]) as {results: Row[]}[];
    return json({month, receipts: list.results.map(decode), products: products.results, settings: await settings()});
  } catch (e) { console.error(e); return json({error: 'Účtenky se nepodařilo načíst. Zkuste to znovu.'}, 503); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({error: 'Nepovolený požadavek.'}, 403);
    const body = await request.json() as {kind?: string; action?: string; data?: Record<string, unknown>};
    const d = body.data || {}, db = database();
    const field = (k: string, max = 2000) => typeof d[k] === 'string' ? (d[k] as string).trim().slice(0, max) : '';

    if (body.kind === 'product') {
      if (body.action === 'delete') { await db.prepare('DELETE FROM products WHERE id=?').bind(field('id')).run(); return json({ok: true}); }
      const name = field('name', 150);
      if (!name) return json({error: 'Vyplňte název produktu.'}, 400);
      let price: number | null;
      try { price = parseRevenue(typeof d.price === 'number' ? String(d.price) : d.price); } catch { return json({error: 'Zadejte cenu v Kč, například 590 nebo 590,50.'}, 400); }
      if (price === null) return json({error: 'Vyplňte cenu produktu.'}, 400);
      const id = field('id') || crypto.randomUUID();
      await db.prepare('INSERT INTO products (id,name,price_cents,active,sort,created) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,price_cents=excluded.price_cents,active=excluded.active,sort=excluded.sort')
        .bind(id, name, price, d.active === false ? 0 : 1, Number.isInteger(d.sort) ? d.sort as number : 0, new Date().toISOString()).run();
      return json({ok: true, id});
    }

    if (body.kind !== 'receipt') return json({error: 'Neplatná operace.'}, 400);
    const id = field('id');

    if (body.action === 'paid') {
      const res = await db.prepare("UPDATE receipts SET paid=? WHERE id=? AND status='issued'").bind(d.paid ? 1 : 0, id).run();
      if (!res.meta.changes) return json({error: 'Účtenka nebyla nalezena.'}, 404);
      return json({ok: true});
    }

    // Odkaz na účtenku pro klientku (SMS, sdílení) a odeslání e-mailem.
    if (body.action === 'link' || body.action === 'send') {
      await db.prepare('UPDATE receipts SET token=? WHERE id=? AND token IS NULL').bind(crypto.randomUUID(), id).run();
      const r = await db.prepare('SELECT number,total_cents AS totalCents,due_cents AS dueCents,paid,vs,status,token FROM receipts WHERE id=?').bind(id).first<{number: string; totalCents: number; dueCents: number; paid: number; vs: string; status: string; token: string}>();
      if (!r) return json({error: 'Účtenka nebyla nalezena.'}, 404);
      const s = await settings(), link = `${publicOrigin(new URL(request.url).origin)}/uctenka?t=${r.token}`;
      if (body.action === 'link') return json({ok: true, link, sms: receiptMessage(r, s, link, true)});
      const email = field('email', 200);
      if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)) return json({error: 'Zadejte platný e-mail klientky.'}, 400);
      if (!mailEnabled()) return json({error: 'Odesílání e-mailů není na serveru nastavené (SMTP v souboru .env.selfhost). Pošlete účtenku přes SMS nebo odkaz.'}, 409);
      notifyClient(email, `Účtenka ${r.number} – ${s.businessName || 'Studio I AM'}`, receiptMessage(r, s, link));
      return json({ok: true, link});
    }

    if (body.action === 'cancel') {
      const r = await db.prepare("SELECT booking_id AS bookingId,prepaid_cents AS prepaidCents FROM receipts WHERE id=? AND status='issued'").bind(id).first<{bookingId: string | null; prepaidCents: number}>();
      if (!r) return json({error: 'Účtenka nebyla nalezena nebo už je stornovaná.'}, 404);
      const statements = [db.prepare("UPDATE receipts SET status='cancelled' WHERE id=?").bind(id)];
      // Započtená kauce se po stornu znovu ukáže jako zaplacená, aby šla použít na nové účtence.
      if (r.bookingId && r.prepaidCents) statements.push(db.prepare("UPDATE bookings SET deposit_status='paid' WHERE id=? AND deposit_status='used'").bind(r.bookingId));
      await db.batch(statements);
      return json({ok: true});
    }

    if (body.action !== 'create') return json({error: 'Neplatná operace.'}, 400);
    if (!Array.isArray(d.items) || !d.items.length || d.items.length > 50) return json({error: 'Přidejte na účtenku alespoň jednu položku.'}, 400);
    const items: ReceiptItem[] = [];
    for (const raw of d.items as Record<string, unknown>[]) {
      const name = typeof raw?.name === 'string' ? raw.name.trim().slice(0, 150) : '', qty = Number(raw?.qty), unit = Number(raw?.unitCents);
      if (!name) return json({error: 'Každá položka potřebuje název.'}, 400);
      if (!Number.isInteger(qty) || qty < 1 || qty > 99) return json({error: `Počet u položky „${name}“ musí být 1–99.`}, 400);
      if (!Number.isInteger(unit) || unit < 0 || unit > 99999999) return json({error: `Zkontrolujte cenu u položky „${name}“.`}, 400);
      items.push({name, qty, unitCents: unit, kind: raw.kind === 'service' || raw.kind === 'product' ? raw.kind : 'other'});
    }
    const method = METHODS.includes(field('method')) ? field('method') : 'cash';
    const subtotal = items.reduce((sum, x) => sum + x.qty * x.unitCents, 0), discount = Number(d.discountCents || 0);
    if (!Number.isInteger(discount) || discount < 0 || discount > subtotal) return json({error: 'Sleva může být nejvýš celá částka účtenky.'}, 400);
    const total = subtotal - discount;

    // Zaplacená kauce nebo platba předem z rezervace se z účtenky odečte (jen jednou).
    const bookingId = field('bookingId') || null;
    const booking = bookingId ? await db.prepare('SELECT client_id AS clientId,name,deposit_cents AS depositCents,deposit_status AS depositStatus FROM bookings WHERE id=?').bind(bookingId).first<{clientId: string | null; name: string; depositCents: number | null; depositStatus: string | null}>() : null;
    if (bookingId && !booking) return json({error: 'Rezervace nebyla nalezena.'}, 404);
    const prepaid = booking?.depositStatus === 'paid' && booking.depositCents ? Math.min(booking.depositCents, total) : 0;
    const due = total - prepaid;
    const clientId = field('clientId') || booking?.clientId || null;
    const clientName = field('clientName', 120) || booking?.name || '';

    const issued = salonNow(), year = Number(issued.slice(0, 4));
    const last = await db.prepare('SELECT max(seq) AS seq FROM receipts WHERE year=?').bind(year).first<{seq: number | null}>();
    const seq = (last?.seq || 0) + 1, number = `${year}/${String(seq).padStart(4, '0')}`, vs = `${year}${String(seq).padStart(4, '0')}`;
    const receiptId = crypto.randomUUID();
    const statements = [db.prepare('INSERT INTO receipts (id,year,seq,number,booking_id,client_id,client_name,issued,items,total_cents,prepaid_cents,due_cents,method,paid,vs,status,note,discount_cents,discount_label,token,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(receiptId, year, seq, number, bookingId, clientId, clientName, issued, JSON.stringify(items), total, prepaid, due, method, method === 'qr' && due > 0 ? 0 : 1, vs, 'issued', field('note', 500), discount, discount ? field('discountLabel', 40) : '', crypto.randomUUID(), new Date().toISOString())];
    if (booking) statements.push(db.prepare(`UPDATE bookings SET status=CASE WHEN status IN ('confirmed','pending') THEN 'done' ELSE status END${prepaid ? ",deposit_status='used'" : ''} WHERE id=?`).bind(bookingId));
    await db.batch(statements);
    return json({ok: true, id: receiptId, number});
  } catch (e) { console.error(e); return json({error: 'Účtenku se nepodařilo uložit. Zkuste to znovu.'}, 503); }
}
