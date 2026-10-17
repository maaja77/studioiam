// API administrace rezervací: kalendář, ruční rezervace, ceník ošetření, nastavení a blokování klientek.
import {parseRule, ruleValue} from '../../../lib/deposit-rule';
import {database, photoStorage, publicOrigin, salonProfile, smsName, smsSender} from '../../../db/raw';
import {icalendar} from '../../../lib/ical';
import {addDays, addMinutes, isDate, isTime, parseSettings, salonName, salonNow, validateSettings, type BookingSettings} from '../../../lib/booking';
import {renderSms, smsPhone} from '../../../lib/sms';
import {parseRevenue} from '../../../lib/revenue';
import {releaseExpiredDeposits} from '../public/route';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
const STATUSES = ['confirmed', 'pending', 'done', 'no_show', 'cancelled'];
export const LOGO_KEY = 'branding/logo', COVER_KEY = 'branding/cover';
/** Typ obrázku podle prvních bajtů (nevěří se příponě ani hlavičce od prohlížeče). */
export function imageType(b: Uint8Array) {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return '';
}

export async function GET(request: Request) {
  try {
    await releaseExpiredDeposits();
    const params = new URL(request.url).searchParams, db = database();
    const from = isDate(params.get('from')) ? params.get('from')! : '0000-01-01', to = isDate(params.get('to')) ? params.get('to')! : '9999-12-31';
    const [bookings, services, setting, calendar] = await db.batch([
      db.prepare('SELECT b.id,b.service_id AS serviceId,b.client_id AS clientId,b.start_at AS start,b.end_at AS end,b.service_name AS serviceName,b.price_cents AS priceCents,b.name,b.phone,b.email,b.note,b.status,b.source,b.deposit_cents AS depositCents,b.deposit_status AS depositStatus,b.deposit_due AS depositDue,b.vs,b.payment_kind AS paymentKind,b.reminded_start AS remindedStart,b.reminded_at AS remindedAt,(SELECT f.status FROM intake_forms f WHERE f.client_id=b.client_id OR f.booking_id=b.id ORDER BY f.created DESC LIMIT 1) AS intake,b.created,s.color,s.category,(SELECT r.id FROM receipts r WHERE r.booking_id=b.id AND r.status=\'issued\' ORDER BY r.created DESC LIMIT 1) AS receiptId FROM bookings b LEFT JOIN services s ON s.id=b.service_id WHERE b.start_at>=? AND b.start_at<? ORDER BY b.start_at').bind(from, to + 'T99'),
      db.prepare('SELECT id,name,duration_min AS durationMin,price_cents AS priceCents,active,sort,category,description,color,sessions,prepay FROM services ORDER BY sort,name'),
      db.prepare("SELECT value FROM settings WHERE key='booking'"),
      db.prepare("SELECT value FROM settings WHERE key='calendar'"),
    ]) as {results: Record<string, unknown>[]}[];
    const token = (calendar.results[0] as {value?: string} | undefined)?.value;
    return json({bookings: bookings.results, services: services.results, settings: parseSettings((setting.results[0] as {value?: string} | undefined)?.value),
      features: {studioPriceList: salonProfile() === 'studioiam', sms: smsName(),
        calendarUrl: token ? `${publicOrigin(new URL(request.url).origin)}/kalendar/${token}.ics` : ''}});
  } catch (e) { console.error(e); return json({error: 'Rezervace se nepodařilo načíst. Zkuste to znovu.'}, 503); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({error: 'Nepovolený požadavek.'}, 403);
    const body = await request.json() as {kind?: string; action?: string; data?: Record<string, unknown>};
    const d = body.data || {}, db = database();
    const field = (k: string, max = 2000) => typeof d[k] === 'string' ? (d[k] as string).trim().slice(0, max) : '';

    const current = async () => parseSettings((await db.prepare("SELECT value FROM settings WHERE key='booking'").first<{value: string}>())?.value);
    const store = (value: unknown) => db.prepare("INSERT INTO settings (key,value) VALUES ('booking',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(value)).run();
    if (body.kind === 'settings') {
      const settings = validateSettings(d);
      if (typeof settings === 'string') return json({error: settings}, 400);
      const old = await current();
      await store({...settings, logoVersion: old.logoVersion, coverVersion: old.coverVersion}); // logo a fotka salonu se mění jen nahráním obrázku
      return json({ok: true});
    }

    // Logo salonu: obrázek PNG, JPEG nebo WebP do 1 MB; bez loga se ukáže neutrální výchozí.
    if (body.kind === 'logo') {
      const settings = await current();
      if (d.image === null) { await photoStorage().delete(LOGO_KEY); await store({...settings, logoVersion: 0}); return json({ok: true}); }
      const m = typeof d.image === 'string' ? /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(d.image) : null;
      const bytes = m ? Uint8Array.from(atob(m[2]), c => c.charCodeAt(0)) : null;
      if (!bytes || !imageType(bytes)) return json({error: 'Logo musí být obrázek PNG, JPG nebo WebP.'}, 400);
      if (bytes.length > 1024 * 1024) return json({error: 'Logo je příliš velké (nejvýš 1 MB).'}, 400);
      await photoStorage().put(LOGO_KEY, bytes);
      await store({...settings, logoVersion: Date.now()});
      return json({ok: true});
    }

    // Fotka salonu nahoře na rezervační stránce: PNG, JPEG nebo WebP do 3 MB (prohlížeč ji předem zmenší).
    if (body.kind === 'cover') {
      const settings = await current();
      if (d.image === null) { await photoStorage().delete(COVER_KEY); await store({...settings, coverVersion: 0}); return json({ok: true}); }
      const m = typeof d.image === 'string' ? /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(d.image) : null;
      const bytes = m ? Uint8Array.from(atob(m[2]), c => c.charCodeAt(0)) : null;
      if (!bytes || !imageType(bytes)) return json({error: 'Fotka musí být obrázek PNG, JPG nebo WebP.'}, 400);
      if (bytes.length > 3 * 1024 * 1024) return json({error: 'Fotka je příliš velká (nejvýš 3 MB).'}, 400);
      await photoStorage().put(COVER_KEY, bytes);
      await store({...settings, coverVersion: Date.now()});
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
      const sessions = d.sessions === undefined ? 1 : Number(d.sessions);
      if (!Number.isInteger(sessions) || sessions < 1 || sessions > 50) return json({error: 'Počet ošetření v balíčku musí být 1–50.'}, 400);
      const id = field('id') || crypto.randomUUID(), color = /^#[0-9a-f]{6}$/i.test(field('color')) ? field('color').toLowerCase() : '';
      await db.prepare('INSERT INTO services (id,name,duration_min,price_cents,active,sort,category,description,color,sessions,prepay,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,duration_min=excluded.duration_min,price_cents=excluded.price_cents,active=excluded.active,sort=excluded.sort,category=excluded.category,description=excluded.description,color=excluded.color,sessions=excluded.sessions,prepay=excluded.prepay')
        .bind(id, name, duration, price, d.active === false ? 0 : 1, Number.isInteger(d.sort) ? d.sort as number : 0, field('category', 80), field('description', 600), color, sessions, d.prepay === true ? 1 : 0, new Date().toISOString()).run();
      return json({ok: true, id});
    }

    if (body.kind === 'block') {
      const res = await db.prepare('UPDATE clients SET blocked=? WHERE id=?').bind(d.blocked ? 1 : 0, field('clientId')).run();
      if (!res.meta.changes) return json({error: 'Klient nebyl nalezen.'}, 404);
      return json({ok: true});
    }

    // Kauce a spolehlivost klientky: nespolehlivá klientka platí kauci vždy; výše kauce na míru (viz lib/deposit-rule).
    if (body.kind === 'clientDeposit') {
      const rule = typeof d.rule === 'string' ? d.rule : '', parsed = parseRule(rule);
      if (rule && ruleValue(parsed) !== rule) return json({error: 'Zadejte procento 1–100, nebo pevnou částku aspoň 100 Kč.'}, 400);
      const unreliable = d.unreliable === true, required = unreliable || d.required === true;
      const res = await db.prepare('UPDATE clients SET unreliable=?,deposit_required=?,deposit_rule=? WHERE id=?').bind(unreliable ? 1 : 0, required ? 1 : 0, ruleValue(parsed), field('clientId')).run();
      if (!res.meta.changes) return json({error: 'Klient nebyl nalezen.'}, 404);
      return json({ok: true});
    }

    if (body.kind === 'depositRequired') {
      const res = await db.prepare('UPDATE clients SET deposit_required=? WHERE id=?').bind(d.required ? 1 : 0, field('clientId')).run();
      if (!res.meta.changes) return json({error: 'Klient nebyl nalezen.'}, 404);
      return json({ok: true});
    }

    // Kalendář v telefonu: zapnutí (nový tajný odkaz), nový odkaz místo starého, nebo vypnutí.
    if (body.kind === 'calendar') {
      if (body.action === 'off') { await db.prepare("DELETE FROM settings WHERE key='calendar'").run(); return json({ok: true}); }
      const token = [...crypto.getRandomValues(new Uint8Array(20))].map(b => b.toString(16).padStart(2, '0')).join('');
      await db.prepare("INSERT INTO settings (key,value) VALUES ('calendar',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(token).run();
      return json({ok: true});
    }

    // SMS: zkušební zpráva na zadané číslo, nebo připomínka jedné rezervace hned.
    if (body.kind === 'sms') {
      const send = smsSender();
      if (!send) return json({error: 'SMS nejsou na serveru nastavené (SMS_PROVIDER v .env.selfhost).'}, 400);
      const settings = await current();
      if (body.action === 'test') {
        const phone = smsPhone(field('phone', 40));
        if (!phone) return json({error: 'Zadejte číslo mobilu, např. 777 123 456.'}, 400);
        const tomorrow = addDays(salonNow().slice(0, 10), 1);
        const text = renderSms(typeof d.template === 'string' ? d.template.slice(0, 480) : settings.smsTemplate, {name: 'Jana Nováková', start: tomorrow + 'T10:00', serviceName: 'Ukázkové ošetření'}, smsSalon(settings), d.ascii === undefined ? settings.smsAscii : d.ascii === true, salonNow().slice(0, 10));
        await send(phone, text);
        return json({ok: true, text});
      }
      if (body.action === 'remind') {
        const b = await db.prepare(`SELECT ${REMIND_COLUMNS} FROM bookings b WHERE b.id=?`).bind(field('id')).first<Remind>();
        if (!b) return json({error: 'Rezervace nebyla nalezena.'}, 404);
        const phone = smsPhone(b.phone);
        if (!phone) return json({error: 'Rezervace nemá číslo mobilu, na které jde poslat SMS.'}, 400);
        await sendReminder(b, phone, settings, send);
        return json({ok: true});
      }
      return json({error: 'Neplatná operace.'}, 400);
    }

    if (body.kind !== 'booking') return json({error: 'Neplatná operace.'}, 400);
    const id = field('id');

    if (body.action === 'delete') {
      if (await db.prepare("SELECT id FROM receipts WHERE booking_id=? AND status='issued'").bind(id).first()) return json({error: 'K rezervaci je vystavená účtenka, smazat ji nejde. Můžete ji zrušit.'}, 409);
      await db.batch([db.prepare('DELETE FROM bookings WHERE id=?').bind(id), db.prepare('DELETE FROM intake_forms WHERE booking_id=? AND client_id IS NULL').bind(id)]); return json({ok: true});
    }

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

    // Rychlý přesun na jiný den nebo čas; délka termínu zůstane stejná.
    if (body.action === 'move') {
      const date = field('date'), time = field('time');
      if (!isDate(date) || !isTime(time)) return json({error: 'Vyplňte nové datum a čas.'}, 400);
      const b = await db.prepare('SELECT start_at AS start,end_at AS "end" FROM bookings WHERE id=?').bind(id).first<{start: string; end: string}>();
      if (!b) return json({error: 'Rezervace nebyla nalezena.'}, 404);
      const minutes = Math.round((Date.parse(b.end + ':00Z') - Date.parse(b.start + ':00Z')) / 60000), start = `${date}T${time}`;
      await db.prepare('UPDATE bookings SET start_at=?,end_at=? WHERE id=?').bind(start, addMinutes(start, minutes), id).run();
      return json({ok: true});
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
  } catch (e) {
    console.error(e);
    if (e instanceof Error && /^(SMS brána|Telefon s SMS Gateway)/.test(e.message)) return json({error: e.message}, 502);
    return json({error: 'Změnu se nepodařilo uložit. Zkuste to znovu.'}, 503);
  }
}

type Remind = {id: string; name: string; phone: string; start: string; serviceName: string};
const REMIND_COLUMNS = 'b.id,b.name,b.phone,b.start_at AS start,b.service_name AS serviceName';
const smsSalon = (s: BookingSettings) => ({name: salonName(s), phone: s.businessPhone});
async function sendReminder(b: Remind, phone: string, settings: BookingSettings, send: (phone: string, text: string) => Promise<void>) {
  await send(phone, renderSms(settings.smsTemplate, b, smsSalon(settings), settings.smsAscii, salonNow().slice(0, 10)));
  await database().prepare('UPDATE bookings SET reminded_start=?,reminded_at=? WHERE id=?').bind(b.start, new Date().toISOString(), b.id).run();
}

/**
 * SMS připomínky na zítřejší termíny (volá časovač serveru). Posílají se od nastaveného času do 20:00,
 * každému termínu jednou; po přesunu termínu znovu. Rezervace vytvořené méně než den předem se nepřipomínají.
 */
export async function remindBookings(now = salonNow()) {
  const send = smsSender();
  if (!send) return 0;
  const db = database(), settings = parseSettings((await db.prepare("SELECT value FROM settings WHERE key='booking'").first<{value: string}>())?.value);
  if (!settings.smsReminders || now.slice(11, 16) < settings.smsTime || now.slice(11, 16) >= '20:00') return 0;
  const tomorrow = addDays(now.slice(0, 10), 1);
  const rows = await db.prepare(`SELECT ${REMIND_COLUMNS},b.created FROM bookings b LEFT JOIN clients c ON c.id=b.client_id
    WHERE b.start_at>=? AND b.start_at<? AND b.status='confirmed' AND b.source<>'block' AND b.phone<>'' AND COALESCE(c.blocked,0)=0
      AND (b.reminded_start IS NULL OR b.reminded_start<>b.start_at) ORDER BY b.start_at`).bind(tomorrow, addDays(tomorrow, 1)).all<Remind & {created: string}>();
  let sent = 0;
  for (const b of rows.results) {
    const phone = smsPhone(b.phone);
    if (!phone || Date.parse(b.created) > Date.parse(b.start + ':00Z') - 26 * 3600_000) continue; // start je místní čas (o 1–2 h před UTC)
    try { await sendReminder(b, phone, settings, send); sent++; }
    catch (e) { console.error(`SMS připomínka pro ${b.start} se nepodařila:`, e instanceof Error ? e.message : e); if (/přihlášení|heslo|kredit|IP adresa/.test(String(e))) break; }
  }
  return sent;
}

const FEED_STATUS: Record<string, string> = {pending: 'čeká na kauci nebo platbu', done: 'proběhlo'};
/** Kalendář rezervací pro odběr v telefonu (/kalendar/<token>.ics). Null = neplatný nebo vypnutý odkaz. */
export async function calendarFeed(token: string) {
  const db = database(), saved = (await db.prepare("SELECT value FROM settings WHERE key='calendar'").first<{value: string}>())?.value;
  if (!saved || !/^[0-9a-f]{40}$/.test(token) || token.length !== saved.length) return null;
  let diff = 0; for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ saved.charCodeAt(i);
  if (diff) return null;
  const today = salonNow().slice(0, 10), settings = parseSettings((await db.prepare("SELECT value FROM settings WHERE key='booking'").first<{value: string}>())?.value);
  const rows = await db.prepare("SELECT id,start_at AS start,end_at AS \"end\",service_name AS serviceName,name,phone,status,source FROM bookings WHERE start_at>=? AND start_at<? AND status IN ('confirmed','pending','done') ORDER BY start_at")
    .bind(addDays(today, -60), addDays(today, 400)).all<{id: string; start: string; end: string; serviceName: string; name: string; phone: string; status: string; source: string}>();
  // Do kalendáře jde jen jméno, ošetření a telefon; poznámky ani údaje z karty klientky ne.
  return icalendar(`Rezervace – ${salonName(settings)}`, rows.results.map(b => ({
    uid: `${b.id}@salon-rezervace`, start: b.start, end: b.end, tentative: b.status === 'pending',
    summary: b.source === 'block' ? b.serviceName : `${b.name} – ${b.serviceName}`,
    description: b.source === 'block' ? 'Blokovaný čas' : [b.phone && `Tel. ${b.phone}`, b.source === 'online' && 'rezervace z webu', FEED_STATUS[b.status]].filter(Boolean).join('\n'),
  })));
}
