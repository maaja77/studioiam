// Statistiky salonu: počty ošetření a tržby za měsíc, rok a celkem.
// Ošetření = rezervace označené jako proběhlé. Tržby = vystavené účtenky (bez storna)
// a částky zapsané u návštěv v kartotéce (starší záznamy před účtenkami).
import {database} from '../../../db/raw';
import {salonNow} from '../../../lib/booking';
import {serviceColor} from '../../../lib/price-list';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});

type Item = {name: string; qty: number; unitCents: number; kind: string};
type Receipt = {issued: string; items: string; totalCents: number; discountCents: number};
type Row = {name: string; category: string | null; color: string | null; count: number};
type Rows = {results: Record<string, unknown>[]};

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams, now = salonNow();
    const year = /^\d{4}$/.test(params.get('year') || '') ? params.get('year')! : now.slice(0, 4);
    const month = /^(0[1-9]|1[0-2])$/.test(params.get('month') || '') ? params.get('month')! : '';
    // Období: měsíc, celý rok, nebo všechno (period=all).
    const all = params.get('period') === 'all';
    const from = all ? '0000' : month ? `${year}-${month}-01` : `${year}-01-01`, to = all ? '9999' : month ? `${year}-${month}-99` : `${year}-12-99`;
    const yFrom = `${year}-01-01`, yTo = `${year}-12-99`;
    const db = database();
    const [done, receipts, visits, noShows, cancelled, yearReceipts, yearVisits, yearDone, allTime] = await db.batch([
      db.prepare("SELECT b.service_name AS name,max(s.category) AS category,max(s.color) AS color,count(*) AS count FROM bookings b LEFT JOIN services s ON s.id=b.service_id WHERE b.status='done' AND b.source<>'block' AND b.start_at>=? AND b.start_at<? GROUP BY b.service_name ORDER BY count DESC,b.service_name").bind(from, to),
      db.prepare("SELECT issued,items,total_cents AS totalCents,discount_cents AS discountCents FROM receipts WHERE status='issued' AND issued>=? AND issued<?").bind(from, to),
      db.prepare('SELECT revenue_cents AS cents FROM visits WHERE revenue_cents IS NOT NULL AND date>=? AND date<?').bind(from, to),
      db.prepare("SELECT count(*) AS n FROM bookings WHERE status='no_show' AND start_at>=? AND start_at<?").bind(from, to),
      db.prepare("SELECT count(*) AS n FROM bookings WHERE status='cancelled' AND source<>'block' AND start_at>=? AND start_at<?").bind(from, to),
      db.prepare("SELECT substr(issued,1,7) AS m,sum(total_cents) AS cents FROM receipts WHERE status='issued' AND issued>=? AND issued<? GROUP BY m").bind(yFrom, yTo),
      db.prepare('SELECT substr(date,1,7) AS m,sum(revenue_cents) AS cents FROM visits WHERE revenue_cents IS NOT NULL AND date>=? AND date<? GROUP BY m').bind(yFrom, yTo),
      db.prepare("SELECT substr(start_at,1,7) AS m,count(*) AS n FROM bookings WHERE status='done' AND source<>'block' AND start_at>=? AND start_at<? GROUP BY m").bind(yFrom, yTo),
      db.prepare("SELECT (SELECT coalesce(sum(total_cents),0) FROM receipts WHERE status='issued')+(SELECT coalesce(sum(revenue_cents),0) FROM visits) AS cents"),
    ]) as Rows[];

    // Tržba za jednotlivá ošetření a za produkty z položek účtenek (sleva se rozpočítá poměrně).
    const byService = new Map<string, number>();
    let services = 0, products = 0, other = 0, discounts = 0;
    for (const r of receipts.results as Receipt[]) {
      const items = JSON.parse(r.items) as Item[], gross = items.reduce((s, x) => s + x.qty * x.unitCents, 0);
      const ratio = gross ? r.totalCents / gross : 0;
      discounts += r.discountCents || 0;
      for (const x of items) {
        const cents = Math.round(x.qty * x.unitCents * ratio);
        if (x.kind === 'service') { services += cents; byService.set(x.name, (byService.get(x.name) || 0) + cents); }
        else if (x.kind === 'product') products += cents; else other += cents;
      }
    }
    const visitCents = (visits.results as {cents: number}[]).reduce((s, v) => s + v.cents, 0);
    const receiptCents = (receipts.results as Receipt[]).reduce((s, r) => s + r.totalCents, 0);
    const treatments = (done.results as Row[]).map(t => ({name: t.name, category: t.category || '', color: serviceColor(t.color, t.category), count: t.count, revenueCents: byService.get(t.name) || 0}));

    const pick = (rows: Rows, m: string, key: string) => Number(rows.results.find(x => x.m === m)?.[key] || 0);
    const months = Array.from({length: 12}, (_, i) => {
      const m = `${year}-${String(i + 1).padStart(2, '0')}`;
      return {month: m, revenueCents: pick(yearReceipts, m, 'cents') + pick(yearVisits, m, 'cents'), treatments: pick(yearDone, m, 'n')};
    });
    return json({
      period: {year, month, all, today: now.slice(0, 10)},
      revenue: {totalCents: receiptCents + visitCents, receiptsCents: receiptCents, visitsCents: visitCents, servicesCents: services, productsCents: products, otherCents: other, discountsCents: discounts, receipts: receipts.results.length},
      treatments, count: treatments.reduce((s, t) => s + t.count, 0),
      noShows: Number(noShows.results[0]?.n || 0), cancelled: Number(cancelled.results[0]?.n || 0),
      months, allTimeCents: Number(allTime.results[0]?.cents || 0),
    });
  } catch (e) { console.error(e); return json({error: 'Statistiky se nepodařilo načíst. Zkuste to znovu.'}, 503); }
}
