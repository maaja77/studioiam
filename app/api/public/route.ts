// Veřejné API rezervačního formuláře na webu: jen nabídka ošetření, volné časy a vytvoření rezervace.
// Žádné údaje o klientkách ani o obsazených termínech se ven neposílají.
import {database, notifySalon} from '../../../db/raw';
import {ACTIVE_STATUSES, addDays, addMinutes, freeSlots, isDate, isTime, normalizePhone, parseSettings, salonNow} from '../../../lib/booking';
import {formatRevenue} from '../../../lib/revenue';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
type Service = {id: string; name: string; durationMin: number; priceCents: number};

async function context() {
  const db = database();
  const [services, setting] = await db.batch([
    db.prepare('SELECT id,name,duration_min AS durationMin,price_cents AS priceCents FROM services WHERE active=1 ORDER BY sort,name'),
    db.prepare("SELECT value FROM settings WHERE key='booking'"),
  ]) as {results: Record<string, unknown>[]}[];
  return {db, services: services.results as Service[], settings: parseSettings((setting.results[0] as {value?: string} | undefined)?.value)};
}

async function busyBetween(from: string, to: string) {
  const rows = await database().prepare(`SELECT start_at AS start,end_at AS end FROM bookings WHERE status IN (${ACTIVE_STATUSES.map(() => '?').join(',')}) AND start_at<? AND end_at>?`)
    .bind(...ACTIVE_STATUSES, to, from).all<{start: string; end: string}>();
  return rows.results;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams, {services, settings} = await context();
    const serviceId = params.get('serviceId');
    if (!serviceId) return json({services, horizonDays: settings.horizonDays});
    const service = services.find(s => s.id === serviceId);
    if (!service) return json({error: 'Ošetření není k dispozici.'}, 404);
    const now = salonNow(), from = isDate(params.get('from')) ? params.get('from')! : now.slice(0, 10);
    const count = Math.min(31, Math.max(1, Number(params.get('days')) || 14));
    const busy = await busyBetween(from + 'T00:00', addDays(from, count) + 'T00:00');
    const days: Record<string, string[]> = {};
    for (let i = 0; i < count; i++) { const date = addDays(from, i); days[date] = freeSlots(date, service.durationMin, settings, busy, now); }
    return json({days});
  } catch (e) { console.error(e); return json({error: 'Rezervace se nepodařilo načíst. Zkuste to prosím znovu.'}, 503); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({error: 'Nepovolený požadavek.'}, 403);
    const d = await request.json() as Record<string, unknown>;
    const text = (k: string, max: number) => typeof d[k] === 'string' ? (d[k] as string).trim().slice(0, max) : '';
    if (text('website', 200)) return json({ok: true}); // past na roboty: skryté pole vyplní jen robot
    const name = text('name', 120), phone = text('phone', 40), email = text('email', 200), note = text('note', 1000), date = text('date', 10), time = text('time', 5);
    if (!name) return json({error: 'Vyplňte prosím jméno.'}, 400);
    if (normalizePhone(phone).length < 9) return json({error: 'Vyplňte prosím telefon, ať vás můžeme kontaktovat.'}, 400);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({error: 'Zkontrolujte prosím e-mail.'}, 400);
    if (d.consent !== true) return json({error: 'Pro rezervaci je potřeba souhlas se zpracováním osobních údajů.'}, 400);
    if (!isDate(date) || !isTime(time)) return json({error: 'Vyberte prosím termín.'}, 400);

    const {db, services, settings} = await context();
    const service = services.find(s => s.id === text('serviceId', 100));
    if (!service) return json({error: 'Ošetření není k dispozici.'}, 404);

    const clients = await db.prepare('SELECT id,phone,email,blocked FROM clients').all<{id: string; phone: string; email: string; blocked: number}>();
    const phoneKey = normalizePhone(phone), emailKey = email.toLowerCase();
    const matches = clients.results.filter(c => (c.phone && normalizePhone(c.phone) === phoneKey) || (emailKey && c.email.toLowerCase() === emailKey));
    if (matches.some(c => c.blocked)) return json({error: 'Online rezervace pro vás teď není dostupná. Zavolejte nám prosím, domluvíme termín spolu.'}, 403);

    const start = `${date}T${time}`, end = addMinutes(start, service.durationMin);
    const busy = await busyBetween(date + 'T00:00', addDays(date, 1) + 'T00:00');
    if (!freeSlots(date, service.durationMin, settings, busy, salonNow()).includes(time)) return json({error: 'Tento termín už není volný. Vyberte prosím jiný.'}, 409);

    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO bookings (id,service_id,client_id,start_at,end_at,service_name,price_cents,name,phone,email,note,status,source,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id, service.id, matches[0]?.id ?? null, start, end, service.name, service.priceCents, name, phone, email, note, 'confirmed', 'online', new Date().toISOString()).run();

    const when = new Date(start + ':00').toLocaleString('cs-CZ', {weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'});
    notifySalon(`Nová rezervace: ${name}, ${when}`, [
      'Nová online rezervace ve Studiu I AM', '',
      `Ošetření: ${service.name} (${service.durationMin} min, ${formatRevenue(service.priceCents)})`,
      `Termín: ${when}`, `Jméno: ${name}`, `Telefon: ${phone}`, email ? `E-mail: ${email}` : '', note ? `Poznámka: ${note}` : '',
      matches.length ? 'Klientka už má kartu v kartotéce.' : 'Nová klientka, karta zatím neexistuje.',
    ].filter(Boolean).join('\n'));
    return json({ok: true, id, start, end, service: service.name});
  } catch (e) { console.error(e); return json({error: 'Rezervaci se nepodařilo odeslat. Zkuste to prosím znovu nebo nám zavolejte.'}, 503); }
}
