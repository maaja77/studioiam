// API dárkových poukazů: prodej (s účtenkou), objednávky z webu, přehled s hlídáním platnosti, čerpání, prodloužení a storno.
import {database, mailEnabled, notifyClient, publicOrigin, salonMailer} from '../../../db/raw';
import {addDays, isDate, parseSettings, salonName, salonNow} from '../../../lib/booking';
import {formatRevenue} from '../../../lib/revenue';
import {parseRevenue} from '../../../lib/revenue';
import {addMonths, daysLeft, EXPIRING_DAYS, normalizeCode, voucherCode, type Voucher} from '../../../lib/vouchers';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
export const VOUCHER_COLUMNS = 'id,code,kind,service_name AS serviceName,value_cents AS valueCents,balance_cents AS balanceCents,buyer_name AS buyerName,buyer_contact AS buyerContact,recipient_name AS recipientName,note,issued,valid_until AS validUntil,status,receipt_id AS receiptId,source,buyer_email AS buyerEmail,delivery,vs,pay_due AS payDue';
const METHODS = ['cash', 'card', 'qr'];
type DB = ReturnType<typeof database>;

/** Nový jedinečný kód poukazu. */
export async function uniqueVoucherCode(db: DB) {
  for (let i = 0; i < 10; i++) { const c = voucherCode(); if (!await db.prepare('SELECT 1 FROM vouchers WHERE code=?').bind(c).first()) return c; }
  throw new Error('Kód poukazu se nepodařilo vytvořit.');
}

/** Účtenka za prodej poukazu, aby se započítal do tržeb (QR platba zůstane nezaplacená, dokud ji salon nepotvrdí). */
async function saleReceipt(db: DB, v: {id: string; code: string; serviceName: string; valueCents: number; buyerName: string}, method: string, paid: boolean) {
  const issued = salonNow(), year = Number(issued.slice(0, 4));
  const last = await db.prepare('SELECT max(seq) AS seq FROM receipts WHERE year=?').bind(year).first<{seq: number | null}>();
  const seq = (last?.seq || 0) + 1, number = `${year}/${String(seq).padStart(4, '0')}`, vs = `${year}${String(seq).padStart(4, '0')}`, receiptId = crypto.randomUUID();
  const items = [{name: `Dárkový poukaz ${v.code}${v.serviceName ? ' – ' + v.serviceName : ''}`, qty: 1, unitCents: v.valueCents, kind: 'voucher'}];
  return {receiptId, statements: [
    db.prepare('INSERT INTO receipts (id,year,seq,number,booking_id,client_id,client_name,issued,items,total_cents,prepaid_cents,due_cents,method,paid,vs,status,note,discount_cents,discount_label,token,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(receiptId, year, seq, number, null, null, v.buyerName, issued, JSON.stringify(items), v.valueCents, 0, v.valueCents, method, paid ? 1 : 0, vs, 'issued', '', 0, '', crypto.randomUUID(), new Date().toISOString()),
    db.prepare('UPDATE vouchers SET receipt_id=? WHERE id=?').bind(receiptId, v.id)]};
}

/**
 * Platba za poukaz objednaný na webu dorazila: poukaz začne platit ode dneška, vznikne zaplacená účtenka
 * a kupující dostane e-mailem odkaz na poukaz. Používá ruční potvrzení i párování z výpisu banky.
 */
export async function markVoucherPaid(db: DB, v: Voucher, origin: string) {
  const today = salonNow().slice(0, 10);
  const settings = parseSettings((await db.prepare("SELECT value FROM settings WHERE key='booking'").first<{value: string}>())?.value);
  const validUntil = addMonths(today, settings.voucherMonths);
  const sale = await saleReceipt(db, v, 'qr', true);
  await db.batch([db.prepare("UPDATE vouchers SET status='active',issued=?,valid_until=?,reminder_stage=0 WHERE id=? AND status='pending'").bind(today, validUntil, v.id), ...sale.statements]);
  if (v.buyerEmail) {
    const token = (await db.prepare('SELECT token FROM vouchers WHERE id=?').bind(v.id).first<{token: string | null}>())?.token;
    const link = token ? `${publicOrigin(origin)}/poukaz?t=${token}` : '';
    notifyClient(v.buyerEmail, `Dárkový poukaz – ${salonName(settings)}`, [
      'Dobrý den,', '', `děkujeme, platba dorazila. Dárkový poukaz ${v.kind === 'service' ? 'na ošetření ' + v.serviceName : 'v hodnotě ' + formatRevenue(v.valueCents)} je platný do ${dateText(validUntil)}.`,
      link ? `Poukaz si můžete zobrazit, vytisknout nebo uložit jako PDF zde: ${link}` : '',
      v.delivery === 'pickup' ? 'Tištěný poukaz pro vás připravíme v salonu.' : '', '',
      `Kód poukazu: ${v.code}. Při objednání stačí nahlásit kód nebo poukaz přinést s sebou.`,
      settings.businessPhone ? `Objednat se lze na tel. ${settings.businessPhone}.` : '', '', `Děkujeme, ${salonName(settings)}`,
    ].join('\n').replace(/\n{3,}/g, '\n\n'));
  }
  return sale.receiptId;
}

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
    return json({vouchers: list.results, today: salonNow().slice(0, 10), months: parseSettings((setting.results[0] as {value?: string} | undefined)?.value).voucherMonths, mail: mailEnabled()});
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
      const code = await uniqueVoucherCode(db);
      const id = crypto.randomUUID(), now = new Date().toISOString();
      const statements = [db.prepare('INSERT INTO vouchers (id,code,kind,service_name,value_cents,balance_cents,buyer_name,buyer_contact,recipient_name,note,issued,valid_until,status,receipt_id,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(id, code, kind, serviceName, value, value, field('buyerName', 120), field('buyerContact', 120), field('recipientName', 120), field('note', 500), today, validUntil, 'active', null, now)];
      // Prodej poukazu jde rovnou na účtenku, aby se započítal do tržeb a šlo zaplatit QR kódem.
      let receiptId: string | null = null;
      if (d.receipt !== false) {
        const method = METHODS.includes(field('method')) ? field('method') : 'cash';
        const sale = await saleReceipt(db, {id, code, serviceName, valueCents: value, buyerName: field('buyerName', 120)}, method, method !== 'qr');
        receiptId = sale.receiptId; statements.push(...sale.statements);
      }
      await db.batch(statements);
      return json({ok: true, id, code, receiptId});
    }

    const id = field('id');
    const v = await db.prepare(`SELECT ${VOUCHER_COLUMNS} FROM vouchers WHERE id=?`).bind(id).first<Voucher>();
    if (!v) return json({error: 'Poukaz nebyl nalezen.'}, 404);

    // Platba za poukaz objednaný na webu dorazila: poukaz začne platit ode dneška, vznikne účtenka a kupující dostane odkaz.
    if (body.action === 'paid') {
      if (v.status !== 'pending') return json({error: 'Poukaz už není objednávka čekající na platbu.'}, 409);
      return json({ok: true, receiptId: await markVoucherPaid(db, v, new URL(request.url).origin)});
    }
    if (body.action === 'update') {
      await db.prepare('UPDATE vouchers SET buyer_name=?,buyer_contact=?,recipient_name=?,note=? WHERE id=?').bind(field('buyerName', 120), field('buyerContact', 120), field('recipientName', 120), field('note', 500), id).run();
      return json({ok: true});
    }
    if (body.action === 'extend') {
      if (v.status === 'pending') return json({error: 'Poukaz ještě není zaplacený, platnost se nastaví při potvrzení platby.'}, 409);
      const validUntil = field('validUntil', 10);
      if (!isDate(validUntil) || validUntil > addMonths(today, 120)) return json({error: 'Zadejte nové datum platnosti.'}, 400);
      await db.prepare('UPDATE vouchers SET valid_until=?,reminder_stage=0,note=ltrim(note||char(10)||?,char(10)) WHERE id=?').bind(validUntil, `Platnost změněna ${today} z ${v.validUntil} na ${validUntil}.`, id).run();
      return json({ok: true});
    }
    // Ruční čerpání, např. poukaz uplatněný mimo účtenku nebo ve starém systému.
    if (body.action === 'use') {
      if (v.status !== 'active') return json({error: v.status === 'pending' ? 'Poukaz ještě není zaplacený.' : 'Poukaz je stornovaný.'}, 409);
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
      if (v.status === 'pending') { await db.prepare("UPDATE vouchers SET status='cancelled',note=ltrim(note||char(10)||?,char(10)) WHERE id=?").bind(`Objednávka zrušena ${today}, platba nedorazila.`, id).run(); return json({ok: true}); }
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

const REMIND_AGAIN_DAYS = 7;
const dateText = (s: string) => s.split('-').reverse().map(Number).join('. ');

/**
 * Připomenutí poukazů, které brzy vyprší: jeden souhrnný e-mail jen salonu (SALON_NOTIFY_EMAIL),
 * 30 dní a znovu 7 dní před koncem platnosti. Každý poukaz se v každém kroku připomene jen jednou.
 */
export async function remindExpiring(adminUrl: string, today = salonNow().slice(0, 10)) {
  const send = salonMailer();
  if (!send) return 0;
  const db = database();
  const rows = await db.prepare(`SELECT ${VOUCHER_COLUMNS},reminder_stage AS stage FROM vouchers WHERE status='active' AND balance_cents>0 AND valid_until>=? AND valid_until<=? ORDER BY valid_until,code`)
    .bind(today, addDays(today, EXPIRING_DAYS)).all<Voucher & {stage: number}>();
  const due = rows.results.map(v => ({v, stage: daysLeft(v.validUntil, today) <= REMIND_AGAIN_DAYS ? 2 : 1})).filter(x => x.v.stage < x.stage);
  if (!due.length) return 0;
  const line = ({v}: {v: Voucher}) => {
    const left = daysLeft(v.validUntil, today);
    return '- ' + [v.code, v.kind === 'service' ? v.serviceName : `zůstatek ${formatRevenue(v.balanceCents)}`, v.recipientName && `pro ${v.recipientName}`,
      `platí do ${dateText(v.validUntil)} (${left === 0 ? 'dnes je poslední den' : left === 1 ? 'zítra končí' : `zbývá ${left} ${left <= 4 ? 'dny' : 'dní'}`})`,
      (v.buyerName || v.buyerContact) && `kupující ${[v.buyerName, v.buyerContact].filter(Boolean).join(', ')}`].filter(Boolean).join(' · ');
  };
  await send(`Dárkové poukazy brzy vyprší (${due.length})`, [
    'Dobrý den,', '', due.length === 1 ? 'tento dárkový poukaz brzy vyprší:' : 'tyto dárkové poukazy brzy vyprší:', '', ...due.map(line), '',
    'Můžete obdarované připomenout, ať se objednají, nebo platnost prodloužit v administraci v části Poukazy:', adminUrl,
  ].join('\n'));
  await db.batch(due.map(x => db.prepare('UPDATE vouchers SET reminder_stage=? WHERE id=?').bind(x.stage, x.v.id)));
  return due.length;
}
