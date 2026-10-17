// Klientky, které dlouho nepřišly: poslední návštěva podle zápisů v kartě, dokončených rezervací a účtenek.
// Oslovuje je salon sám (SMS z telefonu nebo hovor); tady se jen eviduje, kdy a jestli o to klientka stojí.
import {database, publicOrigin} from '../../../db/raw';
import {ACTIVE_STATUSES, parseSettings, salonNow, validateSettings} from '../../../lib/booking';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});

export type LapsedClient = {id: string; name: string; phone: string; email: string; blocked: number; contactedAt: string | null; noContact: number;
  lastVisit: string; lastTreatment: string; visits: number; nextBooking: string | null};

export async function GET(request: Request) {
  try {
    const db = database(), now = salonNow(), origin = new URL(request.url).origin;
    // Každá návštěva je zápis v kartě, proběhlý termín v kalendáři (ne zrušený, ne nedostavila se) nebo účtenka.
    const rows = await db.prepare(`WITH ev AS (
        SELECT client_id AS cid,date AS d,treatment AS t FROM visits
        UNION ALL SELECT client_id,substr(start_at,1,10),service_name FROM bookings WHERE client_id IS NOT NULL AND source<>'block' AND (status='done' OR (status='confirmed' AND start_at<?))
        UNION ALL SELECT client_id,substr(issued,1,10),'' FROM receipts WHERE client_id IS NOT NULL AND status='issued' AND booking_id IS NULL)
      SELECT c.id,c.name,c.phone,c.email,c.blocked,c.contacted_at AS contactedAt,c.no_contact AS noContact,
        max(ev.d) AS lastVisit,count(DISTINCT ev.d) AS visits,
        (SELECT e2.t FROM ev e2 WHERE e2.cid=c.id AND e2.t<>'' ORDER BY e2.d DESC LIMIT 1) AS lastTreatment,
        (SELECT min(b.start_at) FROM bookings b WHERE b.client_id=c.id AND b.start_at>=? AND b.status IN (${ACTIVE_STATUSES.map(() => '?').join(',')}) AND b.status<>'done') AS nextBooking
      FROM clients c JOIN ev ON ev.cid=c.id GROUP BY c.id`).bind(now, now, ...ACTIVE_STATUSES).all<LapsedClient>();
    const s = parseSettings((await db.prepare("SELECT value FROM settings WHERE key='booking'").first<{value: string}>())?.value);
    return json({clients: rows.results.map(r => ({...r, lastTreatment: r.lastTreatment || ''})), today: now.slice(0, 10), text: s.lapsedText,
      salon: s.businessName.trim(), bookingUrl: publicOrigin(origin) + '/rezervace'});
  } catch (e) { console.error(e); return json({error: 'Přehled se nepodařilo načíst. Zkuste to znovu.'}, 503); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({error: 'Nepovolený požadavek.'}, 403);
    const body = await request.json() as {action?: string; data?: Record<string, unknown>};
    const d = body.data || {}, db = database(), id = typeof d.id === 'string' ? d.id : '';
    if (body.action === 'text') {
      const row = await db.prepare("SELECT value FROM settings WHERE key='booking'").first<{value: string}>();
      const next = validateSettings({...parseSettings(row?.value), lapsedText: typeof d.text === 'string' ? d.text : ''});
      if (typeof next === 'string') return json({error: next}, 400);
      await db.prepare("INSERT INTO settings (key,value) VALUES ('booking',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(next)).run();
      return json({ok: true, text: next.lapsedText});
    }
    if (!await db.prepare('SELECT 1 FROM clients WHERE id=?').bind(id).first()) return json({error: 'Klientka nebyla nalezena.'}, 404);
    if (body.action === 'contacted') { await db.prepare('UPDATE clients SET contacted_at=? WHERE id=?').bind(d.undo === true ? null : salonNow().slice(0, 10), id).run(); return json({ok: true}); }
    if (body.action === 'noContact') { await db.prepare('UPDATE clients SET no_contact=? WHERE id=?').bind(d.value === true ? 1 : 0, id).run(); return json({ok: true}); }
    return json({error: 'Neplatná operace.'}, 400);
  } catch (e) { console.error(e); return json({error: 'Změnu se nepodařilo uložit. Zkuste to znovu.'}, 503); }
}
