// Narozeniny klientek v nejbližších dnech: datum narození z karty, jinak z vyplněného dotazníku.
// Přání posílá salon sám (SMS z telefonu); klientky, které nechtějí zprávy, se jen zobrazí bez tlačítka SMS.
import {database} from '../../../db/raw';
import {parseSettings, salonNow, validateSettings} from '../../../lib/booking';
import {nearestBirthday} from '../../../lib/birthdays';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});

export type BirthdayClient = {id: string; name: string; phone: string; noContact: number; date: string; days: number; age: number; wished: boolean};
export const BIRTH_SQL = "coalesce(nullif(c.birth_date,''),(SELECT f.birth_date FROM intake_forms f WHERE f.client_id=c.id AND f.status='done' AND f.birth_date<>'' ORDER BY f.created DESC LIMIT 1),'')";

export async function birthdays(today = salonNow().slice(0, 10), ahead = 14, back = 3) {
  const db = database();
  const rows = await db.prepare(`SELECT c.id,c.name,c.phone,c.no_contact AS noContact,c.birthday_wished AS wished,${BIRTH_SQL} AS birth FROM clients c WHERE c.blocked=0`).all<{id: string; name: string; phone: string; noContact: number; wished: string; birth: string}>();
  return rows.results.flatMap(r => {
    const b = r.birth ? nearestBirthday(r.birth, today, back) : null;
    // Už popřáno letos: zápis obsahuje datum narozenin, kterým se přání týkalo.
    return b && b.days <= ahead ? [{id: r.id, name: r.name, phone: r.phone, noContact: r.noContact, date: b.date, days: b.days, age: b.age, wished: r.wished === b.date}] : [];
  }).sort((a, b) => a.days - b.days || a.name.localeCompare(b.name, 'cs'));
}

export async function GET() {
  try {
    const db = database(), s = parseSettings((await db.prepare("SELECT value FROM settings WHERE key='booking'").first<{value: string}>())?.value);
    // Proběhlé narozeniny se ukazují jen ty, kterým se ještě nepopřálo.
    return json({today: salonNow().slice(0, 10), clients: (await birthdays()).filter(c => c.days >= 0 || !c.wished), text: s.birthdayText, salon: s.businessName.trim()});
  } catch (e) { console.error(e); return json({error: 'Narozeniny se nepodařilo načíst. Zkuste to znovu.'}, 503); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({error: 'Nepovolený požadavek.'}, 403);
    const body = await request.json() as {action?: string; data?: Record<string, unknown>};
    const d = body.data || {}, db = database();
    if (body.action === 'text') {
      const row = await db.prepare("SELECT value FROM settings WHERE key='booking'").first<{value: string}>();
      const next = validateSettings({...parseSettings(row?.value), birthdayText: typeof d.text === 'string' ? d.text : ''});
      if (typeof next === 'string') return json({error: next}, 400);
      await db.prepare("INSERT INTO settings (key,value) VALUES ('booking',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(next)).run();
      return json({ok: true, text: next.birthdayText});
    }
    if (body.action !== 'wished') return json({error: 'Neplatná operace.'}, 400);
    const id = typeof d.id === 'string' ? d.id : '', date = typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : '';
    const res = await db.prepare('UPDATE clients SET birthday_wished=? WHERE id=?').bind(d.undo === true ? '' : date, id).run();
    if (!res.meta.changes) return json({error: 'Klientka nebyla nalezena.'}, 404);
    return json({ok: true});
  } catch (e) { console.error(e); return json({error: 'Změnu se nepodařilo uložit. Zkuste to znovu.'}, 503); }
}
