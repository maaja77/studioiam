// Platby z banky: nahraný výpis pohybů (CSV) se spáruje podle variabilního symbolu a částky
// s kaucemi rezervací, objednávkami poukazů z webu a nezaplacenými QR účtenkami.
import {database} from '../../../db/raw';
import {parseSettings, salonNow} from '../../../lib/booking';
import {parseStatement, sameAccount, type BankRow} from '../../../lib/bank';
import {formatRevenue} from '../../../lib/revenue';
import type {Voucher} from '../../../lib/vouchers';
import {markVoucherPaid, VOUCHER_COLUMNS} from '../vouchers/route';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
type DB = ReturnType<typeof database>;

export type OpenKind = 'deposit' | 'voucher' | 'receipt';
/** Co čeká na zaplacení převodem; open=false znamená, že už je zaplaceno (pro hlášení duplicitní platby). */
export type PayItem = {kind: OpenKind; id: string; label: string; amountCents: number; vs: string; open: boolean};
export type BankPayment = BankRow & {status: 'matched' | 'mismatch' | 'unmatched' | 'ignored'; matchKind: OpenKind | null; matchId: string | null; matchLabel: string; imported: string};
const PAYMENT_COLUMNS = 'id,date,amount_cents AS amountCents,vs,account,name,message,operation,status,match_kind AS matchKind,match_id AS matchId,match_label AS matchLabel,imported';
const dateText = (s: string) => s.slice(0, 10).split('-').reverse().map(Number).join('. ');

/** Kauce, objednávky poukazů a QR účtenky; s vs jen ty s tímto symbolem (i už zaplacené), jinak všechny nezaplacené. */
async function payItems(db: DB, vs?: string): Promise<PayItem[]> {
  const where = vs ? "ltrim(vs,'0')=?" : '1=1', args = vs ? [vs] : [];
  const [deposits, vouchers, receipts] = await db.batch([
    db.prepare(`SELECT id,name,service_name AS service,start_at AS start,deposit_cents AS amount,deposit_status AS state,status,vs FROM bookings WHERE deposit_cents>0 AND ${where}${vs ? '' : " AND deposit_status='pending' AND status IN ('pending','confirmed')"} ORDER BY start_at`).bind(...args),
    db.prepare(`SELECT id,code,buyer_name AS buyer,value_cents AS amount,status,vs FROM vouchers WHERE source='online' AND ${where}${vs ? '' : " AND status='pending'"} ORDER BY created`).bind(...args),
    db.prepare(`SELECT id,number,client_name AS client,due_cents AS amount,paid,status,vs FROM receipts WHERE method='qr' AND due_cents>0 AND status='issued' AND ${where}${vs ? '' : ' AND paid=0'} ORDER BY issued`).bind(...args),
  ]) as {results: Record<string, string | number | null>[]}[];
  return [
    ...deposits.results.map(b => ({kind: 'deposit' as const, id: String(b.id), label: `Kauce: ${b.name || 'bez jména'}, ${b.service} ${dateText(String(b.start))}`, amountCents: Number(b.amount), vs: String(b.vs || ''),
      open: b.state === 'pending' && (b.status === 'pending' || b.status === 'confirmed')})),
    ...vouchers.results.map(v => ({kind: 'voucher' as const, id: String(v.id), label: `Poukaz ${v.code}${v.buyer ? ', kupuje ' + v.buyer : ''}`, amountCents: Number(v.amount), vs: String(v.vs || ''), open: v.status === 'pending'})),
    ...receipts.results.map(r => ({kind: 'receipt' as const, id: String(r.id), label: `Účtenka ${r.number}${r.client ? ', ' + r.client : ''}`, amountCents: Number(r.amount), vs: String(r.vs || ''), open: !r.paid})),
  ];
}

/** Zapíše platbu u spárované položky (kauce zaplacena, poukaz začne platit, účtenka zaplacena). */
async function applyPayment(db: DB, item: PayItem, origin: string) {
  if (item.kind === 'deposit') {
    await db.prepare("UPDATE bookings SET deposit_status='paid',status=CASE WHEN status='pending' THEN 'confirmed' ELSE status END WHERE id=? AND deposit_status='pending'").bind(item.id).run();
  } else if (item.kind === 'receipt') {
    await db.prepare("UPDATE receipts SET paid=1 WHERE id=? AND status='issued'").bind(item.id).run();
  } else {
    const v = await db.prepare(`SELECT ${VOUCHER_COLUMNS} FROM vouchers WHERE id=?`).bind(item.id).first<Voucher>();
    if (v?.status === 'pending') await markVoucherPaid(db, v, origin);
  }
}

export async function GET() {
  try {
    const db = database();
    const [payments, open, settings] = await Promise.all([
      db.prepare(`SELECT ${PAYMENT_COLUMNS} FROM bank_payments ORDER BY date DESC,imported DESC LIMIT 300`).all<BankPayment>(),
      payItems(db),
      db.prepare("SELECT value FROM settings WHERE key='booking'").first<{value: string}>(),
    ]);
    const last = await db.prepare('SELECT max(date) AS date,max(imported) AS imported FROM bank_payments').first<{date: string | null; imported: string | null}>();
    return json({payments: payments.results, open, account: parseSettings(settings?.value).account, lastDate: last?.date || null, lastImport: last?.imported || null, today: salonNow().slice(0, 10)});
  } catch (e) { console.error(e); return json({error: 'Platby se nepodařilo načíst. Zkuste to znovu.'}, 503); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({error: 'Nepovolený požadavek.'}, 403);
    const body = await request.json() as {action?: string; data?: Record<string, unknown>};
    const d = body.data || {}, db = database(), origin = new URL(request.url).origin;

    if (body.action === 'import') {
      if (typeof d.text !== 'string' || !d.text.trim()) return json({error: 'Vyberte soubor s výpisem.'}, 400);
      if (d.text.length > 5_000_000) return json({error: 'Soubor je moc velký. Stáhněte výpis za kratší období.'}, 413);
      const statement = parseStatement(d.text);
      if (typeof statement === 'string') return json({error: statement}, 400);
      const account = parseSettings((await db.prepare("SELECT value FROM settings WHERE key='booking'").first<{value: string}>())?.value).account;
      // Výpis z jiného účtu (třeba osobního) by mohl spárovat cizí platby, proto se bez potvrzení nenahraje.
      if (statement.account && account && !sameAccount(statement.account, account) && d.otherAccount !== true)
        return json({error: `Výpis je z účtu ${statement.account}, ale v Nastavení je účet salonu ${account}.`, otherAccount: statement.account}, 409);
      const imported = new Date().toISOString(), result = {added: 0, known: 0, matched: 0, mismatch: 0, unmatched: 0, outgoing: statement.outgoing, skipped: statement.skipped, items: [] as {label: string; amountCents: number; status: string}[]};
      for (const row of [...statement.rows].sort((a, b) => a.date.localeCompare(b.date))) {
        if (await db.prepare('SELECT 1 FROM bank_payments WHERE id=?').bind(row.id).first()) { result.known++; continue; }
        let status: 'matched' | 'mismatch' | 'unmatched' = 'unmatched', match: PayItem | null = null, label = '';
        if (row.vs) {
          const items = await payItems(db, row.vs);
          // Přednost má položka čekající na platbu se stejnou částkou, pak jakákoli čekající, nakonec už zaplacená.
          match = items.find(i => i.open && i.amountCents === row.amountCents) || items.find(i => i.open) || items[0] || null;
          if (match && !match.open) { status = 'matched'; label = `${match.label} (už bylo označeno jako zaplacené)`; }
          else if (match && row.amountCents >= match.amountCents) {
            await applyPayment(db, match, origin); status = 'matched';
            label = match.label + (row.amountCents > match.amountCents ? ` (přeplatek ${formatRevenue(row.amountCents - match.amountCents)})` : '');
          } else if (match) { status = 'mismatch'; label = `${match.label}: přišlo ${formatRevenue(row.amountCents)} z ${formatRevenue(match.amountCents)}`; }
        }
        await db.prepare('INSERT INTO bank_payments (id,date,amount_cents,vs,account,name,message,operation,status,match_kind,match_id,match_label,imported) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .bind(row.id, row.date, row.amountCents, row.vs, row.account, row.name, row.message, row.operation, status, match?.kind || null, match?.id || null, label, imported).run();
        result.added++; result[status]++;
        if (status !== 'unmatched') result.items.push({label, amountCents: row.amountCents, status});
      }
      return json({ok: true, ...result});
    }

    // Ostatní příjmy (platby kartou z terminálu, platby mimo aplikaci) se jen schovají ze seznamu k vyřízení.
    if (body.action === 'ignoreAll') {
      const res = await db.prepare("UPDATE bank_payments SET status='ignored' WHERE status='unmatched'").run();
      return json({ok: true, count: res.meta.changes});
    }
    const id = typeof d.id === 'string' ? d.id : '';
    const payment = await db.prepare(`SELECT ${PAYMENT_COLUMNS} FROM bank_payments WHERE id=?`).bind(id).first<BankPayment>();
    if (!payment) return json({error: 'Platba nebyla nalezena.'}, 404);
    // Ruční přiřazení platby, např. když klientka zapomněla variabilní symbol nebo poslala méně.
    if (body.action === 'assign') {
      if (payment.status === 'matched') return json({error: 'Platba už je přiřazená.'}, 409);
      const item = (await payItems(db)).find(i => i.kind === d.kind && i.id === d.itemId);
      if (!item) return json({error: 'Položka už nečeká na zaplacení. Obnovte stránku.'}, 409);
      await applyPayment(db, item, origin);
      await db.prepare("UPDATE bank_payments SET status='matched',match_kind=?,match_id=?,match_label=? WHERE id=?").bind(item.kind, item.id, item.label + ' (přiřazeno ručně)', id).run();
      return json({ok: true});
    }
    if (body.action === 'ignore') {
      if (payment.status === 'matched') return json({error: 'Spárovanou platbu nejde skrýt.'}, 409);
      await db.prepare('UPDATE bank_payments SET status=? WHERE id=?').bind(d.undo === true ? (payment.matchId ? 'mismatch' : 'unmatched') : 'ignored', id).run();
      return json({ok: true});
    }
    return json({error: 'Neplatná operace.'}, 400);
  } catch (e) { console.error(e); return json({error: 'Výpis se nepodařilo zpracovat. Zkuste to znovu.'}, 503); }
}
