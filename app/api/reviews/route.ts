// Prosba o hodnocení: klientky, které byly v salonu v posledních 7 dnech a ještě o hodnocení požádané nebyly.
// Každá se žádá nejvýš jednou; vynechávají se klientky, které zprávy nechtějí nebo mají blokované rezervace. Posílá salon sám (SMS z telefonu nebo e-mail).
import {database, mailEnabled, notifyClient} from '../../../db/raw';
import {addDays, parseSettings, salonName, salonNow, validateSettings} from '../../../lib/booking';
import {fillReview} from '../../../lib/reviews';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
type DB = ReturnType<typeof database>;

export type ReviewClient = {id: string; name: string; phone: string; email: string; lastVisit: string; lastTreatment: string};
export type ReviewData = {clients: ReviewClient[]; url: string; text: string; salon: string; mail: boolean; askedMonth: number};
const settingsOf = async (db: DB) => parseSettings((await db.prepare("SELECT value FROM settings WHERE key='booking'").first<{value: string}>())?.value);
async function saveSettings(db: DB, patch: Record<string, unknown>) {
  const next = validateSettings({...await settingsOf(db), ...patch});
  if (typeof next === 'string') return next;
  await db.prepare("INSERT INTO settings (key,value) VALUES ('booking',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(next)).run();
  return next;
}

export async function reviewData(now = salonNow()): Promise<ReviewData> {
  const db = database(), today = now.slice(0, 10), from = addDays(today, -7);
  // Návštěva je zápis v kartě, proběhlý termín v kalendáři nebo účtenka; dnešní se nabídnou až zítra.
  const rows = await db.prepare(`WITH ev AS (
      SELECT client_id AS cid,date AS d,treatment AS t FROM visits
      UNION ALL SELECT client_id,substr(start_at,1,10),service_name FROM bookings WHERE client_id IS NOT NULL AND source<>'block' AND (status='done' OR (status='confirmed' AND start_at<?))
      UNION ALL SELECT client_id,substr(issued,1,10),'' FROM receipts WHERE client_id IS NOT NULL AND status='issued')
    SELECT c.id,c.name,c.phone,c.email,max(ev.d) AS lastVisit,
      (SELECT e2.t FROM ev e2 WHERE e2.cid=c.id AND e2.d<? AND e2.t<>'' ORDER BY e2.d DESC LIMIT 1) AS lastTreatment
    FROM clients c JOIN ev ON ev.cid=c.id
    WHERE c.review_asked_at IS NULL AND c.no_contact=0 AND c.blocked=0 AND (c.phone<>'' OR c.email<>'') AND ev.d<?
    GROUP BY c.id HAVING max(ev.d)>=? ORDER BY lastVisit DESC,c.name LIMIT 30`).bind(now, today, today, from).all<ReviewClient>();
  const s = await settingsOf(db);
  const asked = await db.prepare("SELECT count(*) AS n FROM clients WHERE review_asked_at>=? AND review_via<>'skip'").bind(today.slice(0, 8) + '01').first<{n: number}>();
  return {clients: rows.results.map(r => ({...r, lastTreatment: r.lastTreatment || ''})), url: s.reviewUrl, text: s.reviewText, salon: s.businessName.trim(), mail: mailEnabled(), askedMonth: Number(asked?.n || 0)};
}

export async function GET() {
  try { return json(await reviewData()); } catch (e) { console.error(e); return json({error: 'Seznam se nepodařilo načíst. Zkuste to znovu.'}, 503); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({error: 'Nepovolený požadavek.'}, 403);
    const body = await request.json() as {action?: string; data?: Record<string, unknown>};
    const d = body.data || {}, db = database();
    if (body.action === 'settings') {
      const next = await saveSettings(db, {reviewUrl: typeof d.url === 'string' ? d.url : '', reviewText: typeof d.text === 'string' ? d.text : ''});
      return typeof next === 'string' ? json({error: next}, 400) : json({ok: true, url: next.reviewUrl, text: next.reviewText});
    }
    const client = await db.prepare('SELECT id,name,email FROM clients WHERE id=?').bind(typeof d.id === 'string' ? d.id : '').first<{id: string; name: string; email: string}>();
    if (!client) return json({error: 'Klientka nebyla nalezena.'}, 404);
    const mark = (via: string) => db.prepare('UPDATE clients SET review_asked_at=?,review_via=? WHERE id=?').bind(salonNow().slice(0, 10), via, client.id).run();
    if (body.action === 'undo') { await db.prepare("UPDATE clients SET review_asked_at=NULL,review_via='' WHERE id=?").bind(client.id).run(); return json({ok: true}); }
    if (body.action === 'skip') { await mark('skip'); return json({ok: true}); }
    if (body.action === 'noContact') { await db.prepare('UPDATE clients SET no_contact=1 WHERE id=?').bind(client.id).run(); return json({ok: true}); }
    if (body.action === 'sent') { await mark(d.via === 'copy' ? 'copy' : 'sms'); return json({ok: true}); }
    if (body.action === 'email') {
      const s = await settingsOf(db);
      if (!mailEnabled()) return json({error: 'E-maily nejsou na serveru nastavené. Pošlete prosbu SMS.'}, 400);
      if (!s.reviewUrl) return json({error: 'Nejdřív vložte odkaz na hodnocení.'}, 400);
      if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(client.email)) return json({error: 'Klientka nemá v kartě platný e-mail.'}, 400);
      const salon = salonName(s);
      notifyClient(client.email, `Děkujeme za návštěvu – ${salon}`, fillReview(s.reviewText, client.name, s.businessName.trim(), s.reviewUrl).replace(/^Dobrý den, /, 'Dobrý den,\n\n') + `\n\n${salon}`);
      await mark('email');
      return json({ok: true});
    }
    return json({error: 'Neplatná operace.'}, 400);
  } catch (e) { console.error(e); return json({error: 'Změnu se nepodařilo uložit. Zkuste to znovu.'}, 503); }
}
