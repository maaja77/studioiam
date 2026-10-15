// API administrace rezervací: kalendář, ruční rezervace, ceník ošetření, nastavení a blokování klientek.
import {database} from '../../../db/raw';
import {addMinutes, isDate, isTime, parseSettings, validateSettings} from '../../../lib/booking';
import {parseRevenue} from '../../../lib/revenue';
import {releaseExpiredDeposits} from '../public/route';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
const STATUSES = ['confirmed', 'pending', 'done', 'no_show', 'cancelled'];

export async function GET(request: Request) {
  try {
    await releaseExpiredDeposits();
    const params = new URL(request.url).searchParams, db = database();
    const from = isDate(params.get('from')) ? params.get('from')! : '0000-01-01', to = isDate(params.get('to')) ? params.get('to')! : '9999-12-31';
    const [bookings, services, setting] = await db.batch([
      db.prepare('SELECT b.id,b.service_id AS serviceId,b.client_id AS clientId,b.start_at AS start,b.end_at AS end,b.service_name AS serviceName,b.price_cents AS priceCents,b.name,b.phone,b.email,b.note,b.status,b.source,b.deposit_cents AS depositCents,b.deposit_status AS depositStatus,b.deposit_due AS depositDue,b.vs,b.created,s.color,s.category FROM bookings b LEFT JOIN services s ON s.id=b.service_id WHERE b.start_at>=? AND b.start_at<? ORDER BY b.start_at').bind(from, to + 'T99'),
      db.prepare('SELECT id,name,duration_min AS durationMin,price_cents AS priceCents,active,sort,category,description,color FROM services ORDER BY sort,name'),
      db.prepare("SELECT value FROM settings WHERE key='booking'"),
    ]) as {results: Record<string, unknown>[]}[];
    return json({bookings: bookings.results, services: services.results, settings: parseSettings((setting.results[0] as {value?: string} | undefined)?.value)});
  } catch (e) { console.error(e); return json({error: 'Rezervace se nepodařilo načíst. Zkuste to znovu.'}, 503); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({error: 'Nepovolený požadavek.'}, 403);
    const body = await request.json() as {kind?: string; action?: string; data?: Record<string, unknown>};
    const d = body.data || {}, db = database();
    const field = (k: string, max = 2000) => typeof d[k] === 'string' ? (d[k] as string).trim().slice(0, max) : '';

    if (body.kind === 'settings') {
      const settings = validateSettings(d);
      if (typeof settings === 'string') return json({error: settings}, 400);
      await db.prepare("INSERT INTO settings (key,value) VALUES ('booking',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(settings)).run();
      return json({ok: true});
    }

    if (body.kind === 'service') {
      if (body.action === 'delete') { await db.prepare('DELETE FROM services WHERE id=?').bind(field('id')).run(); return json({ok: true}); }
      const name = field('name', 150), duration = Number(d.durationMin);
      if (!name) return json({error: 'Vyplňte název ošetření.'}, 400);
      if (!Number.isInteger(duration) || duration < 5 || duration > 600) return json({error: 'Délka ošetření musí být 5–600 minut.'}, 400);
      let price: number | null;
      try { price = parseRevenue(typeof d.price === 'number' ? String(d.price) : d.price); } catch (e) { return json({error: (e as Error).message.replace('tržbu', 'cenu').replace('Tržba', 'Cena')}, 400); }
      if (price === null) return json({error: 'Vyplňte cenu ošetření.'}, 400);
      const id = field('id') || crypto.randomUUID(), color = /^#[0-9a-f]{6}$/i.test(field('color')) ? field('color').toLowerCase() : '';
      await db.prepare('INSERT INTO services (id,name,duration_min,price_cents,active,sort,category,description,color,created) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,duration_min=excluded.duration_min,price_cents=excluded.price_cents,active=excluded.active,sort=excluded.sort,category=excluded.category,description=excluded.description,color=excluded.color')
        .bind(id, name, duration, price, d.active === false ? 0 : 1, Number.isInteger(d.sort) ? d.sort as number : 0, field('category', 80), field('description', 600), color, new Date().toISOString()).run();
      return json({ok: true, id});
    }

    if (body.kind === 'block') {
      const res = await db.prepare('UPDATE clients SET blocked=? WHERE id=?').bind(d.blocked ? 1 : 0, field('clientId')).run();
      if (!res.meta.changes) return json({error: 'Klient nebyl nalezen.'}, 404);
      return json({ok: true});
    }

    if (body.kind === 'depositRequired') {
      const res = await db.prepare('UPDATE clients SET deposit_required=? WHERE id=?').bind(d.required ? 1 : 0, field('clientId')).run();
      if (!res.meta.changes) return json({error: 'Klient nebyl nalezen.'}, 404);
      return json({ok: true});
    }

    if (body.kind !== 'booking') return json({error: 'Neplatná operace.'}, 400);
    const id = field('id');

    if (body.action === 'delete') { await db.prepare('DELETE FROM bookings WHERE id=?').bind(id).run(); return json({ok: true}); }

    if (body.action === 'status') {
      const status = field('status');
      if (!STATUSES.includes(status)) return json({error: 'Neplatný stav rezervace.'}, 400);
      const booking = await db.prepare('SELECT client_id AS clientId FROM bookings WHERE id=?').bind(id).first<{clientId: string | null}>();
      if (!booking) return json({error: 'Rezervace nebyla nalezena.'}, 404);
      const statements = [db.prepare('UPDATE bookings SET status=? WHERE id=?').bind(status, id)];
      if (status === 'no_show' && d.block === true && booking.clientId) statements.push(db.prepare('UPDATE clients SET blocked=1 WHERE id=?').bind(booking.clientId));
      await db.batch(statements);
      return json({ok: true});
    }

    if (body.action === 'deposit') {
      const state = field('depositStatus');
      if (!['paid', 'returned', 'forfeited'].includes(state)) return json({error: 'Neplatný stav kauce.'}, 400);
      const res = await db.prepare("UPDATE bookings SET deposit_status=?,status=CASE WHEN status='pending' AND ?='paid' THEN 'confirmed' ELSE status END WHERE id=? AND deposit_cents IS NOT NULL").bind(state, state, id).run();
      if (!res.meta.changes) return json({error: 'Rezervace s kaucí nebyla nalezena.'}, 404);
      return json({ok: true});
    }

    if (body.action === 'createClient') {
      const booking = await db.prepare('SELECT name,phone,email,client_id AS clientId FROM bookings WHERE id=?').bind(id).first<{name: string; phone: string; email: string; clientId: string | null}>();
      if (!booking) return json({error: 'Rezervace nebyla nalezena.'}, 404);
      if (booking.clientId) return json({ok: true, clientId: booking.clientId});
      const clientId = crypto.randomUUID();
      await db.batch([
        db.prepare('INSERT INTO clients (id,name,phone,email,created) VALUES (?,?,?,?,?)').bind(clientId, booking.name || 'Bez jména', booking.phone, booking.email, new Date().toISOString()),
        db.prepare('UPDATE bookings SET client_id=? WHERE id=?').bind(clientId, id),
      ]);
      return json({ok: true, clientId});
    }

    // Uložení rezervace nebo blokace času zadané v salonu.
    const date = field('date'), time = field('time'), duration = Number(d.durationMin);
    if (!isDate(date) || !isTime(time)) return json({error: 'Vyplňte datum a čas.'}, 400);
    if (!Number.isInteger(duration) || duration < 5 || duration > 720) return json({error: 'Délka musí být 5–720 minut.'}, 400);
    const isBlock = d.source === 'block', clientId = field('clientId') || null;
    let name = field('name', 120), phone = field('phone', 40), email = field('email', 200);
    if (clientId) {
      const client = await db.prepare('SELECT name,phone,email FROM clients WHERE id=?').bind(clientId).first<{name: string; phone: string; email: string}>();
      if (!client) return json({error: 'Klient nebyl nalezen.'}, 404);
      name ||= client.name; phone ||= client.phone; email ||= client.email;
    }
    if (!isBlock && !name) return json({error: 'Vyplňte jméno klientky nebo ji vyberte z kartotéky.'}, 400);
    const service = field('serviceId') ? await db.prepare('SELECT id,name,price_cents AS priceCents FROM services WHERE id=?').bind(field('serviceId')).first<{id: string; name: string; priceCents: number}>() : null;
    const serviceName = isBlock ? (field('serviceName', 150) || 'Blokovaný čas') : (service?.name || field('serviceName', 150));
    if (!serviceName) return json({error: 'Vyberte ošetření.'}, 400);
    const start = `${date}T${time}`, status = STATUSES.includes(field('status')) ? field('status') : 'confirmed';
    const newId = id || crypto.randomUUID();
    await db.prepare('INSERT INTO bookings (id,service_id,client_id,start_at,end_at,service_name,price_cents,name,phone,email,note,status,source,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET service_id=excluded.service_id,client_id=excluded.client_id,start_at=excluded.start_at,end_at=excluded.end_at,service_name=excluded.service_name,price_cents=excluded.price_cents,name=excluded.name,phone=excluded.phone,email=excluded.email,note=excluded.note,status=excluded.status')
      .bind(newId, isBlock ? null : service?.id ?? null, isBlock ? null : clientId, start, addMinutes(start, duration), serviceName, isBlock ? null : service?.priceCents ?? null, isBlock ? '' : name, isBlock ? '' : phone, isBlock ? '' : email, field('note', 1000), status, isBlock ? 'block' : (field('source') === 'online' ? 'online' : 'salon'), new Date().toISOString()).run();
    return json({ok: true, id: newId});
  } catch (e) { console.error(e); return json({error: 'Změnu se nepodařilo uložit. Zkuste to znovu.'}, 503); }
}
