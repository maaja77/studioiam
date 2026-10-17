// API dárkových poukazů: prodej (s účtenkou), přehled s hlídáním platnosti, čerpání, prodloužení a storno.
import {database} from '../../../db/raw';
import {isDate, parseSettings, salonNow} from '../../../lib/booking';
import {parseRevenue} from '../../../lib/revenue';
import {addMonths, normalizeCode, voucherCode, type Voucher} from '../../../lib/vouchers';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
export const VOUCHER_COLUMNS = 'id,code,kind,service_name AS serviceName,value_cents AS valueCents,balance_cents AS balanceCents,buyer_name AS buyerName,buyer_contact AS buyerContact,recipient_name AS recipientName,note,issued,valid_until AS validUntil,status,receipt_id AS receiptId';
const METHODS = ['cash', 'card', 'qr'];

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams, db = database();
    // Vyhledání podle kódu při uplatnění na účtence.
    if (params.has('code')) {
      const v = await db.prepare(`SELECT ${VOUCHER_COLUMNS} FROM vouchers WHERE code=?`).bind(normalizeCode(params.get('code') || '')).first<Voucher>();
      return v ? json({voucher: v, today: salonNow().slice(0, 10)}) : json({error: 'Poukaz s tímto kódem neexistuje. Zkontrolujte ho prosím.'}, 404);
    }
    if (params.has('id')) {
      const v = await db.prepare(`SELECT ${VOUCHER_COLUMNS} FROM vouchers WHERE id=?`).bind(params.get('id')).first<Voucher>();
      if (!v) return json({error: 'Poukaz nebyl nalezen.'}, 404);
      const uses = await db.prepare('SELECT u.id,u.date,u.amount_cents AS amountCents,u.note,u.receipt_id AS receiptId,r.number AS receiptNumber FROM voucher_uses u LEFT JOIN receipts r ON r.id=u.receipt_id WHERE u.voucher_id=? ORDER BY u.date,u.created').bind(v.id).all();
      return json({voucher: v, uses: uses.results, today: salonNow().slice(0, 10)});
    }
    const [list, setting] = await db.batch([
      db.prepare(`SELECT ${VOUCHER_COLUMNS} FROM vouchers ORDER BY issued DESC,created DESC`),
      db.prepare("SELECT value FROM settings WHERE key='booking'"),
    ]) as {results: Record<string, unknown>[]}[];
    return json({vouchers: list.results, today: salonNow().slice(0, 10), months: parseSettings((setting.results[0] as {value?: string} | undefined)?.value).voucherMonths});
  } catch (e) { console.error(e); return json({error: 'Poukazy se nepodařilo načíst. Zkuste to znovu.'}, 503); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({error: 'Nepovolený požadavek.'}, 403);
    const body = await request.json() as {action?: string; data?: Record<string, unknown>};
    const d = body.data || {}, db = database(), today = salonNow().slice(0, 10);
    const field = (k: string, max = 200) => typeof d[k] === 'string' ? (d[k] as string).trim().slice(0, max) : '';
    const money = (k: string) => { try { return parseRevenue(typeof d[k] === 'number' ? String(d[k]) : d[k]); } catch { return undefined; } };

    if (body.action === 'create') {
      const kind = d.kind === 'service' ? 'service' : 'value', serviceName = kind === 'service' ? field('serviceName', 150) : '';
      const value = money('value');
      if (kind === 'service' && !serviceName) return json({error: 'Vyberte ošetření, na které poukaz platí.'}, 400);
      if (value === undefined || value === null || value <= 0 || value > 10000000) return json({error: 'Zadejte hodnotu poukazu v Kč, například 1500.'}, 400);
      const validUntil = field('validUntil', 10);
      if (!isDate(validUntil) || validUntil < today || validUntil > addMonths(today, 120)) return json({error: 'Zkontrolujte datum platnosti (nejdřív dnes).'}, 400);
      let code = '';
      for (let i = 0; i < 10 && !code; i++) { const c = voucherCode(); if (!await db.prepare('SELECT 1 FROM vouchers WHERE code=?').bind(c).first()) code = c; }
      const id = crypto.randomUUID(), now = new Date().toISOString();
      const statements = [db.prepare('INSERT INTO vouchers (id,code,kind,service_name,value_cents,balance_cents,buyer_name,buyer_contact,recipient_name,note,issued,valid_until,status,receipt_id,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(id, code, kind, serviceName, value, value, field('buyerName', 120), field('buyerContact', 120), field('recipientName', 120), field('note', 500), today, validUntil, 'active', null, now)];
      // Prodej poukazu jde rovnou na účtenku, aby se započítal do tržeb a šlo zaplatit QR kódem.
      let receiptId: string | null = null;
      if (d.receipt !== false) {
        const method = METHODS.includes(field('method')) ? field('method') : 'cash';
        const issued = salonNow(), year = Number(issued.slice(0, 4));
        const last = await db.prepare('SELECT max(seq) AS seq FROM receipts WHERE year=?').bind(year).first<{seq: number | null}>();
        const seq = (last?.seq || 0) + 1, number = `${year}/${String(seq).padStart(4, '0')}`, vs = `${year}${String(seq).padStart(4, '0')}`;
        receiptId = crypto.randomUUID();
        const items = [{name: `Dárkový poukaz ${code}${serviceName ? ' – ' + serviceName : ''}`, qty: 1, unitCents: value, kind: 'voucher'}];
        statements.push(db.prepare('INSERT INTO receipts (id,year,seq,number,booking_id,client_id,client_name,issued,items,total_cents,prepaid_cents,due_cents,method,paid,vs,status,note,discount_cents,discount_label,token,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .bind(receiptId, year, seq, number, null, null, field('buyerName', 120), issued, JSON.stringify(items), value, 0, value, method, method === 'qr' ? 0 : 1, vs, 'issued', '', 0, '', crypto.randomUUID(), now));
        statements.push(db.prepare('UPDATE vouchers SET receipt_id=? WHERE id=?').bind(receiptId, id));
      }
      await db.batch(statements);
      return json({ok: true, id, code, receiptId});
    }

    const id = field('id');
    const v = await db.prepare(`SELECT ${VOUCHER_COLUMNS} FROM vouchers WHERE id=?`).bind(id).first<Voucher>();
    if (!v) return json({error: 'Poukaz nebyl nalezen.'}, 404);

    if (body.action === 'update') {
      await db.prepare('UPDATE vouchers SET buyer_name=?,buyer_contact=?,recipient_name=?,note=? WHERE id=?').bind(field('buyerName', 120), field('buyerContact', 120), field('recipientName', 120), field('note', 500), id).run();
      return json({ok: true});
    }
    if (body.action === 'extend') {
      const validUntil = field('validUntil', 10);
      if (!isDate(validUntil) || validUntil > addMonths(today, 120)) return json({error: 'Zadejte nové datum platnosti.'}, 400);
      await db.prepare('UPDATE vouchers SET valid_until=?,note=ltrim(note||char(10)||?,char(10)) WHERE id=?').bind(validUntil, `Platnost změněna ${today} z ${v.validUntil} na ${validUntil}.`, id).run();
      return json({ok: true});
    }
    // Ruční čerpání, např. poukaz uplatněný mimo účtenku nebo ve starém systému.
    if (body.action === 'use') {
      if (v.status !== 'active') return json({error: 'Poukaz je stornovaný.'}, 409);
      const amount = v.kind === 'service' ? v.balanceCents : money('amount');
      if (!amount || amount <= 0 || amount > v.balanceCents) return json({error: `Částka musí být 1 až ${v.balanceCents / 100} Kč (zůstatek poukazu).`}, 400);
      await db.batch([
        db.prepare('INSERT INTO voucher_uses (id,voucher_id,receipt_id,date,amount_cents,note,created) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(), id, null, today, amount, field('note', 200), new Date().toISOString()),
        db.prepare(`UPDATE vouchers SET balance_cents=${v.kind === 'service' ? '0' : 'balance_cents-?'} WHERE id=?`).bind(...(v.kind === 'service' ? [id] : [amount, id])),
      ]);
      return json({ok: true});
    }
    if (body.action === 'cancel') {
      if (v.status === 'cancelled') return json({error: 'Poukaz už je stornovaný.'}, 409);
      if (v.balanceCents < v.valueCents) return json({error: 'Poukaz už byl čerpán, stornovat ho nejde. Případně zapište čerpání zbytku.'}, 409);
      const statements = [db.prepare("UPDATE vouchers SET status='cancelled' WHERE id=?").bind(id)];
      // Storno prodaného poukazu stornuje i jeho účtenku, aby nezůstala v tržbách.
      if (v.receiptId) statements.push(db.prepare("UPDATE receipts SET status='cancelled' WHERE id=?").bind(v.receiptId));
      await db.batch(statements);
      return json({ok: true});
    }
    return json({error: 'Neplatná operace.'}, 400);
  } catch (e) { console.error(e); return json({error: 'Změnu poukazu se nepodařilo uložit. Zkuste to znovu.'}, 503); }
}
