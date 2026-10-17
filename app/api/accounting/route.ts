// Podklady pro účetní za měsíc: účtenky (bez jmen klientek), propadlé kauce a souhrn; ?format=csv vrátí soubor ke stažení.
import {database} from '../../../db/raw';
import {parseSettings, salonName, salonNow} from '../../../lib/booking';
import {accountingCsv, splitItems, summarize, type AccountingDeposit, type AccountingReceipt} from '../../../lib/accounting';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams, m = params.get('month') || '';
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : salonNow().slice(0, 7), from = month + '-01', to = month + '-99';
    const db = database();
    const [rows, deposits, setting] = await db.batch([
      db.prepare('SELECT number,issued,status,method,paid,items,total_cents AS totalCents,prepaid_cents AS prepaidCents,voucher_cents AS voucherCents,due_cents AS dueCents,discount_cents AS discountCents FROM receipts WHERE issued>=? AND issued<? ORDER BY year,seq').bind(from, to),
      // Propadlá kauce je příjem bez účtenky; počítá se k měsíci termínu.
      db.prepare("SELECT substr(start_at,1,10) AS date,coalesce(vs,'') AS vs,deposit_cents AS cents FROM bookings WHERE deposit_status='forfeited' AND deposit_cents>0 AND start_at>=? AND start_at<? ORDER BY start_at").bind(from, to),
      db.prepare("SELECT value FROM settings WHERE key='booking'"),
    ]) as {results: Record<string, unknown>[]}[];
    const receipts: AccountingReceipt[] = (rows.results as (Omit<AccountingReceipt, 'services' | 'products' | 'vouchers' | 'other'> & {items: string})[]).map(({items, ...r}) => ({...r, voucherCents: r.voucherCents || 0, prepaidCents: r.prepaidCents || 0,
      discountCents: r.discountCents || 0, ...splitItems(JSON.parse(items), r.status === 'issued' ? r.totalCents - (r.voucherCents || 0) : 0)}));
    const dep = deposits.results as AccountingDeposit[], s = parseSettings((setting.results[0] as {value?: string} | undefined)?.value);
    const salon = [salonName(s), s.businessId && 'IČO ' + s.businessId].filter(Boolean).join(', ');
    if (params.get('format') === 'csv') return new Response(accountingCsv(month, salon, receipts, dep), {headers: {'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="podklady-ucetni-${month}.csv"`}});
    return json({month, salon: {name: salonName(s), businessId: s.businessId, owner: s.businessOwner, address: s.businessAddress}, receipts, deposits: dep, summary: summarize(receipts, dep)});
  } catch (e) { console.error(e); return json({error: 'Podklady se nepodařilo připravit. Zkuste to znovu.'}, 503); }
}
