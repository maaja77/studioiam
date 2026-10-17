// Veřejné API rezervačního formuláře na webu: jen nabídka ošetření, volné časy a vytvoření rezervace.
// Žádné údaje o klientkách ani o obsazených termínech se ven neposílají.
// Klientka může přes tajný odkaz z potvrzení zrušit nebo přesunout svůj termín, nejpozději v nastavené lhůtě předem.
import {database, notifyClient, notifySalon} from '../../../db/raw';
import {ACTIVE_STATUSES, addDays, addMinutes, freeSlots, isDate, isTime, normalizePhone, parseSettings, salonName, salonNow, type BookingSettings} from '../../../lib/booking';
import {formatRevenue} from '../../../lib/revenue';
import {czIban, depositFor, formatIban, spdPayload} from '../../../lib/payment';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
type Service = {id: string; name: string; durationMin: number; priceCents: number; category: string; description: string; sessions: number; prepay: number};

async function context() {
  const db = database();
  const [services, setting] = await db.batch([
    db.prepare('SELECT id,name,duration_min AS durationMin,price_cents AS priceCents,category,description,sessions,prepay FROM services WHERE active=1 ORDER BY sort,name'),
    db.prepare("SELECT value FROM settings WHERE key='booking'"),
  ]) as {results: Record<string, unknown>[]}[];
  return {db, services: services.results as Service[], settings: parseSettings((setting.results[0] as {value?: string} | undefined)?.value)};
}

/** Nezaplacené kauce po lhůtě uvolní termín. */
export async function releaseExpiredDeposits() {
  await database().prepare("UPDATE bookings SET status='cancelled',deposit_status='expired' WHERE status='pending' AND deposit_due<?").bind(salonNow()).run();
}

async function busyBetween(from: string, to: string, exceptId = '') {
  const rows = await database().prepare(`SELECT start_at AS start,end_at AS end FROM bookings WHERE status IN (${ACTIVE_STATUSES.map(() => '?').join(',')}) AND start_at<? AND end_at>? AND id<>?`)
    .bind(...ACTIVE_STATUSES, to, from, exceptId).all<{start: string; end: string}>();
  return rows.results;
}

function slotDays(params: URLSearchParams, durationMin: number, settings: BookingSettings, busy: (from: string, to: string) => ReturnType<typeof busyBetween>) {
  const now = salonNow(), from = isDate(params.get('from')) ? params.get('from')! : now.slice(0, 10);
  const count = Math.min(31, Math.max(1, Number(params.get('days')) || 14));
  return busy(from + 'T00:00', addDays(from, count) + 'T00:00').then(list => {
    const days: Record<string, string[]> = {};
    for (let i = 0; i < count; i++) { const date = addDays(from, i); days[date] = freeSlots(date, durationMin, settings, list, now); }
    return days;
  });
}

const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(16).padStart(2, '0')).join('');
const whenText = (start: string) => new Date(start + ':00').toLocaleString('cs-CZ', {weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'});
const minutesBetween = (a: string, b: string) => Math.round((Date.parse(b + ':00Z') - Date.parse(a + ':00Z')) / 60000);
type Managed = {id: string; start: string; end: string; serviceName: string; name: string; phone: string; email: string; note: string; status: string; depositCents: number | null; depositStatus: string | null; depositDue: string | null; vs: string | null; paymentKind: PaymentKind | null};

async function managed(token: string | null) {
  if (!token || !/^[a-f0-9]{36}$/.test(token)) return null;
  return database().prepare('SELECT id,start_at AS start,end_at AS end,service_name AS serviceName,name,phone,email,note,status,deposit_cents AS depositCents,deposit_status AS depositStatus,deposit_due AS depositDue,vs,payment_kind AS paymentKind FROM bookings WHERE manage_token=?').bind(token).first<Managed>();
}
/** Klientka smí měnit jen platný termín, který začíná nejdříve za nastavenou lhůtu. */
/** Veřejné údaje salonu pro rezervační stránku (hlavička a patička). */
export const salonInfo = (s: BookingSettings) => ({name: salonName(s), address: s.businessAddress, phone: s.businessPhone, businessId: s.businessId, logoVersion: s.logoVersion});
const canChange = (b: Managed, settings: BookingSettings) => ['confirmed', 'pending'].includes(b.status) && b.start >= addMinutes(salonNow(), settings.changeLimitHours * 60);

type PaymentKind = 'deposit' | 'prepay';
/** Co se platí předem: celá cena u balíčků a programů, jinak kauce u dražších ošetření a u klientek se zapnutou kaucí.
 *  Bez čísla účtu salonu se předem neplatí nic. */
function payment(service: Service, settings: BookingSettings, clientRequires: boolean): {cents: number; kind: PaymentKind} | null {
  if (!czIban(settings.account) || service.priceCents <= 0) return null;
  if (service.prepay) return {cents: service.priceCents, kind: 'prepay'};
  if ((settings.depositFromKc > 0 && service.priceCents >= settings.depositFromKc * 100) || clientRequires) return {cents: Math.min(service.priceCents, depositFor(service.priceCents, settings.depositPercent)), kind: 'deposit'};
  return null;
}

function depositInfo(settings: BookingSettings, amountCents: number, due: string, vs: string, label: string, kind: PaymentKind) {
  const iban = czIban(settings.account);
  if (!iban) return null;
  return {amountCents, due, vs, kind, iban: formatIban(iban), account: settings.account, recipient: settings.accountName,
    qr: spdPayload({iban, amountCents, vs, message: (kind === 'prepay' ? '' : 'Kauce ') + label, recipient: settings.accountName})};
}

async function manageInfo(b: Managed, settings: BookingSettings) {
  return {start: b.start, end: b.end, service: b.serviceName, status: b.status, durationMin: minutesBetween(b.start, b.end),
    canChange: canChange(b, settings), limitHours: settings.changeLimitHours,
    deposit: b.status === 'pending' && b.depositCents && b.depositDue && b.vs ? depositInfo(settings, b.depositCents, b.depositDue, b.vs, b.serviceName, b.paymentKind || 'deposit') : null};
}

export async function GET(request: Request) {
  try {
    await releaseExpiredDeposits();
    const params = new URL(request.url).searchParams, {services, settings} = await context();
    // Účtenka pro klientku přes tajný odkaz (bez údajů z kartotéky).
    if (params.has('receipt')) {
      const token = params.get('receipt') || '';
      const r = /^[0-9a-f-]{36}$/.test(token) ? await database().prepare("SELECT number,client_name AS clientName,issued,items,total_cents AS totalCents,prepaid_cents AS prepaidCents,due_cents AS dueCents,discount_cents AS discountCents,discount_label AS discountLabel,method,paid,vs,status FROM receipts WHERE token=?").bind(token).first<Record<string, unknown> & {items: string}>() : null;
      if (!r) return json({error: 'Účtenka nebyla nalezena. Zkontrolujte prosím odkaz.'}, 404);
      const {businessName, businessOwner, businessAddress, businessId, businessPhone, account, accountName, logoVersion} = settings;
      return json({receipt: {...r, id: '', bookingId: null, clientId: null, note: '', items: JSON.parse(r.items)}, settings: {businessName, businessOwner, businessAddress, businessId, businessPhone, account, accountName, logoVersion}});
    }
    if (params.has('token')) {
      const b = await managed(params.get('token'));
      if (!b) return json({error: 'Rezervace nebyla nalezena. Zkontrolujte prosím odkaz nebo nám zavolejte.'}, 404);
      if (!params.has('from')) return json({booking: await manageInfo(b, settings)});
      return json({days: await slotDays(params, minutesBetween(b.start, b.end), settings, (from, to) => busyBetween(from, to, b.id))});
    }
    const serviceId = params.get('serviceId');
    if (!serviceId) {
      return json({services: services.map(x => ({...x, prepay: !!x.prepay, depositCents: payment(x, settings, false)?.cents ?? null})), horizonDays: settings.horizonDays, salon: salonInfo(settings)});
    }
    const service = services.find(s => s.id === serviceId);
    if (!service) return json({error: 'Ošetření není k dispozici.'}, 404);
    return json({days: await slotDays(params, service.durationMin, settings, busyBetween)});
  } catch (e) { console.error(e); return json({error: 'Rezervace se nepodařilo načíst. Zkuste to prosím znovu.'}, 503); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({error: 'Nepovolený požadavek.'}, 403);
    const d = await request.json() as Record<string, unknown>;
    const text = (k: string, max: number) => typeof d[k] === 'string' ? (d[k] as string).trim().slice(0, max) : '';
    if (d.action === 'cancel' || d.action === 'move') return manage(d.action, text('token', 64), text('date', 10), text('time', 5));
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

    await releaseExpiredDeposits();
    const clients = await db.prepare('SELECT id,phone,email,blocked,deposit_required AS depositRequired FROM clients').all<{id: string; phone: string; email: string; blocked: number; depositRequired: number}>();
    const phoneKey = normalizePhone(phone), emailKey = email.toLowerCase();
    const matches = clients.results.filter(c => (c.phone && normalizePhone(c.phone) === phoneKey) || (emailKey && c.email.toLowerCase() === emailKey));
    if (matches.some(c => c.blocked)) return json({error: 'Online rezervace pro vás teď není dostupná. Zavolejte nám prosím, domluvíme termín spolu.'}, 403);

    const start = `${date}T${time}`, end = addMinutes(start, service.durationMin);
    const busy = await busyBetween(date + 'T00:00', addDays(date, 1) + 'T00:00');
    if (!freeSlots(date, service.durationMin, settings, busy, salonNow()).includes(time)) return json({error: 'Tento termín už není volný. Vyberte prosím jiný.'}, 409);

    const pay = payment(service, settings, matches.some(c => c.depositRequired));
    const needsDeposit = !!pay, depositCents = pay?.cents ?? null, kind = pay?.kind ?? null;
    const due = needsDeposit ? [addMinutes(salonNow(), settings.depositHoldHours * 60), start].sort()[0] : null;
    const vs = needsDeposit ? start.slice(2, 10).replace(/-/g, '') + start.slice(11, 13) + String(Math.floor(Math.random() * 100)).padStart(2, '0') : null;

    const id = crypto.randomUUID(), token = newToken();
    await db.prepare('INSERT INTO bookings (id,service_id,client_id,start_at,end_at,service_name,price_cents,name,phone,email,note,status,source,deposit_cents,deposit_status,deposit_due,vs,payment_kind,manage_token,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id, service.id, matches[0]?.id ?? null, start, end, service.name, service.priceCents, name, phone, email, service.sessions > 1 ? [`Balíček ${service.sessions}× ošetření, 1. termín; další termíny domluvit.`, note].filter(Boolean).join('\n') : note, needsDeposit ? 'pending' : 'confirmed', 'online', depositCents, needsDeposit ? 'pending' : null, due, vs, kind, token, new Date().toISOString()).run();
    const deposit = needsDeposit ? depositInfo(settings, depositCents!, due!, vs!, service.name, kind!) : null;

    const when = whenText(start), link = `${new URL(request.url).origin}/rezervace?t=${token}`;
    notifySalon(`Nová rezervace: ${name}, ${when}`, [
      `Nová online rezervace (${salonName(settings)})`, '',
      `Ošetření: ${service.name} (${service.durationMin} min${service.priceCents ? ', ' + formatRevenue(service.priceCents) : ''})`,
      `Termín: ${when}`, `Jméno: ${name}`, `Telefon: ${phone}`, email ? `E-mail: ${email}` : '', note ? `Poznámka: ${note}` : '',
      deposit ? `${deposit.kind === 'prepay' ? 'Platba předem' : 'Kauce'}: ${formatRevenue(deposit.amountCents)}, VS ${deposit.vs}, zaplatit do ${deposit.due.replace('T', ' ')}. Do té doby termín čeká na platbu.` : '',
      service.sessions > 1 ? `Balíček ${service.sessions}× ošetření: toto je 1. termín, další je potřeba domluvit.` : '',
      matches.length ? 'Klientka už má kartu v kartotéce.' : 'Nová klientka, karta zatím neexistuje.',
    ].filter(Boolean).join('\n'));
    if (email) notifyClient(email, `Rezervace – ${salonName(settings)}: ${when}`, [
      `Dobrý den, děkujeme za rezervaci.`, '',
      `Ošetření: ${service.name}`, `Termín: ${when}`, [salonName(settings), settings.businessAddress].filter(Boolean).join(', '), '',
      deposit ? `Termín držíme do zaplacení ${deposit.kind === 'prepay' ? 'částky' : 'kauce'} ${formatRevenue(deposit.amountCents)} na účet ${deposit.account}, VS ${deposit.vs}, nejpozději ${deposit.due.replace('T', ' ')}.\n` : '',
      `Zrušit nebo změnit termín můžete nejpozději ${settings.changeLimitHours} h předem zde: ${link}`,
      settings.businessPhone ? `Později nám prosím zavolejte: ${settings.businessPhone}.` : '', '', `Těšíme se na vás, ${salonName(settings)}`,
    ].filter(Boolean).join('\n'));
    return json({ok: true, id, start, end, service: service.name, deposit, token});
  } catch (e) { console.error(e); return json({error: 'Rezervaci se nepodařilo odeslat. Zkuste to prosím znovu nebo nám zavolejte.'}, 503); }
}

async function manage(action: 'cancel' | 'move', token: string, date: string, time: string) {
  await releaseExpiredDeposits();
  const {db, settings} = await context(), b = await managed(token);
  if (!b) return json({error: 'Rezervace nebyla nalezena. Zkontrolujte prosím odkaz nebo nám zavolejte.'}, 404);
  if (b.status === 'cancelled') return json({error: 'Tento termín je už zrušený.'}, 409);
  if (!canChange(b, settings)) return json({error: `Termín už online změnit nejde (nejpozději ${settings.changeLimitHours} h předem). ${settings.businessPhone ? `Zavolejte nám prosím: ${settings.businessPhone}.` : 'Ozvěte se nám prosím telefonicky.'}`}, 409);
  const stamp = new Date(salonNow() + ':00').toLocaleString('cs-CZ', {day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit'});
  const old = whenText(b.start);
  if (action === 'cancel') {
    await db.prepare("UPDATE bookings SET status='cancelled',deposit_status=CASE WHEN deposit_status='pending' THEN 'cancelled' ELSE deposit_status END,note=ltrim(note||char(10)||?,char(10)) WHERE id=?")
      .bind(`Klientka zrušila online ${stamp}.`, b.id).run();
    notifySalon(`Zrušená rezervace: ${b.name}, ${old}`, ['Klientka zrušila online rezervaci.', '', `Ošetření: ${b.serviceName}`, `Termín: ${old}`, `Jméno: ${b.name}`, `Telefon: ${b.phone}`,
      b.depositStatus === 'paid' ? `${b.paymentKind === 'prepay' ? 'Platba předem' : 'Kauce'} ${formatRevenue(b.depositCents!)} byla zaplacená, rozhodněte o vrácení v kalendáři.` : ''].filter(Boolean).join('\n'));
    return json({ok: true, booking: await manageInfo({...b, status: 'cancelled'}, settings)});
  }
  if (!isDate(date) || !isTime(time)) return json({error: 'Vyberte prosím nový termín.'}, 400);
  const duration = minutesBetween(b.start, b.end), start = `${date}T${time}`, end = addMinutes(start, duration);
  const busy = await busyBetween(date + 'T00:00', addDays(date, 1) + 'T00:00', b.id);
  if (!freeSlots(date, duration, settings, busy, salonNow()).includes(time)) return json({error: 'Tento termín už není volný. Vyberte prosím jiný.'}, 409);
  const due = b.depositDue && b.depositDue > start ? start : b.depositDue;
  await db.prepare('UPDATE bookings SET start_at=?,end_at=?,deposit_due=?,note=ltrim(note||char(10)||?,char(10)) WHERE id=?')
    .bind(start, end, due, `Klientka přesunula online ${stamp} z ${b.start.replace('T', ' ')}.`, b.id).run();
  const when = whenText(start);
  notifySalon(`Přesunutá rezervace: ${b.name}, ${when}`, ['Klientka přesunula online rezervaci.', '', `Ošetření: ${b.serviceName}`, `Původní termín: ${old}`, `Nový termín: ${when}`, `Jméno: ${b.name}`, `Telefon: ${b.phone}`].join('\n'));
  if (b.email) notifyClient(b.email, `Změna termínu – ${salonName(settings)}: ${when}`, [`Dobrý den, váš termín jsme přesunuli.`, '', `Ošetření: ${b.serviceName}`, `Nový termín: ${when}`, '', `Těšíme se na vás, ${salonName(settings)}`].join('\n'));
  return json({ok: true, booking: await manageInfo({...b, start, end, depositDue: due}, settings)});
}
