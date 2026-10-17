// Přehled dne: dnešní termíny s tím, na co si dát pozor, a co čeká na vyřízení.
// Ranní e-mail salonu obsahuje jen časy, ošetření a jména; zdravotní údaje a upozornění z karty zůstávají v aplikaci.
import {database, salonMailer} from '../../../db/raw';
import {addDays, parseSettings, salonNow, validateSettings} from '../../../lib/booking';
import {intakeWarnings, type IntakeAnswers} from '../../../lib/intake';
import {formatRevenue} from '../../../lib/revenue';
import {nearestBirthday} from '../../../lib/birthdays';
import {BIRTH_SQL, birthdays} from '../birthdays/route';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});

export type TodayBooking = {id: string; start: string; end: string; serviceName: string; name: string; phone: string; clientId: string | null; status: string; source: string;
  depositCents: number | null; depositStatus: string | null; note: string; receiptId: string | null; cautions: string; intake: string | null; warnings: string[];
  lastVisit: string | null; lastTreatment: string; firstVisit: boolean; birthday: string; unreliable?: number};
export type TodayData = {today: string; now: string; bookings: TodayBooking[]; blocks: {start: string; end: string; serviceName: string}[];
  todo: {pendingDeposits: {id: string; start: string; name: string; depositCents: number; due: string | null}[]; unpaidReceipts: {count: number; cents: number};
    vouchersPending: number; stockLow: string[]; tomorrow: number; notFinished: number};
  morningMail: boolean; mail: boolean; birthdaysToday: string[]};

export async function todayData(now = salonNow()): Promise<TodayData> {
  const db = database(), today = now.slice(0, 10), tomorrow = addDays(today, 1);
  const [bookings, blocks, deposits, receipts, vouchers, stock, next, open, setting] = await db.batch([
    db.prepare(`SELECT b.id,b.start_at AS start,b.end_at AS end,b.service_name AS serviceName,b.name,b.phone,b.client_id AS clientId,b.status,b.source,b.deposit_cents AS depositCents,b.deposit_status AS depositStatus,b.note,
      (SELECT r.id FROM receipts r WHERE r.booking_id=b.id AND r.status='issued' LIMIT 1) AS receiptId,coalesce(c.cautions,'') AS cautions,coalesce(c.unreliable,0) AS unreliable,
      (SELECT f.status FROM intake_forms f WHERE f.client_id=b.client_id OR f.booking_id=b.id ORDER BY f.created DESC LIMIT 1) AS intake,
      (SELECT f.answers FROM intake_forms f WHERE (f.client_id=b.client_id OR f.booking_id=b.id) AND f.status='done' ORDER BY f.created DESC LIMIT 1) AS answers,
      (SELECT max(v.date) FROM visits v WHERE v.client_id=b.client_id AND v.date<?) AS lastVisit,
      (SELECT v.treatment FROM visits v WHERE v.client_id=b.client_id AND v.date<? ORDER BY v.date DESC LIMIT 1) AS lastTreatment,
      ${BIRTH_SQL} AS birth,
      (SELECT count(*) FROM bookings o WHERE o.client_id=b.client_id AND o.id<>b.id AND o.start_at<b.start_at AND o.status IN ('done','confirmed')) AS earlier
      FROM bookings b LEFT JOIN clients c ON c.id=b.client_id WHERE b.start_at>=? AND b.start_at<? AND b.source<>'block' AND b.status IN ('pending','confirmed','done') ORDER BY b.start_at`).bind(today, today, today, tomorrow),
    db.prepare("SELECT start_at AS start,end_at AS end,service_name AS serviceName FROM bookings WHERE source='block' AND status<>'cancelled' AND start_at<? AND end_at>? ORDER BY start_at").bind(tomorrow, today),
    db.prepare("SELECT id,start_at AS start,name,deposit_cents AS depositCents,deposit_due AS due FROM bookings WHERE deposit_status='pending' AND status IN ('pending','confirmed') AND start_at>=? ORDER BY start_at LIMIT 20").bind(today),
    db.prepare("SELECT count(*) AS count,coalesce(sum(due_cents),0) AS cents FROM receipts WHERE status='issued' AND paid=0 AND due_cents>0"),
    db.prepare("SELECT count(*) AS n FROM vouchers WHERE status='pending'"),
    db.prepare('SELECT name FROM products WHERE active=1 AND stock IS NOT NULL AND stock<=coalesce(min_stock,0) ORDER BY name'),
    db.prepare("SELECT count(*) AS n FROM bookings WHERE source<>'block' AND status IN ('pending','confirmed') AND start_at>=? AND start_at<?").bind(tomorrow, addDays(tomorrow, 1)),
    // Proběhlé termíny posledních 14 dní, které ještě nejsou dokončené účtenkou ani jinak uzavřené.
    db.prepare("SELECT count(*) AS n FROM bookings WHERE source<>'block' AND status='confirmed' AND end_at<? AND start_at>=?").bind(now, addDays(today, -14)),
    db.prepare("SELECT value FROM settings WHERE key='booking'"),
  ]) as {results: Record<string, unknown>[]}[];
  const rows = bookings.results as (Omit<TodayBooking, 'warnings' | 'firstVisit' | 'birthday'> & {answers: string | null; earlier: number; birth: string})[];
  // Narozeniny v týdnu kolem termínu: hodí se popřát osobně.
  const birthdayText = (birth: string) => { const b = birth ? nearestBirthday(birth, today, 7) : null; if (!b || b.days > 7) return ''; return b.days === 0 ? 'Dnes má narozeniny' : `Narozeniny ${Number(b.date.slice(8, 10))}. ${Number(b.date.slice(5, 7))}.`; };
  return {
    today, now,
    bookings: rows.map(({answers, earlier, birth, ...b}) => ({...b, lastTreatment: b.lastTreatment || '', firstVisit: !b.lastVisit && !earlier, birthday: birthdayText(birth),
      warnings: intakeWarnings(answers ? JSON.parse(answers) as IntakeAnswers : null).map(w => w.detail ? `${w.text}: ${w.detail}` : w.text)})),
    blocks: blocks.results as TodayData['blocks'],
    todo: {pendingDeposits: deposits.results as TodayData['todo']['pendingDeposits'], unpaidReceipts: receipts.results[0] as {count: number; cents: number},
      vouchersPending: Number((vouchers.results[0] as {n: number}).n), stockLow: stock.results.map(r => String(r.name)), tomorrow: Number((next.results[0] as {n: number}).n),
      notFinished: Number((open.results[0] as {n: number}).n)},
    morningMail: parseSettings((setting.results[0] as {value?: string} | undefined)?.value).morningMail, mail: !!salonMailer(), birthdaysToday: (await birthdays(today, 0, 0)).filter(c => c.days === 0).map(c => c.name),
  };
}

export async function GET() {
  try { return json(await todayData()); } catch (e) { console.error(e); return json({error: 'Přehled dne se nepodařilo načíst. Zkuste to znovu.'}, 503); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({error: 'Nepovolený požadavek.'}, 403);
    const body = await request.json() as {action?: string; data?: {on?: unknown}};
    if (body.action !== 'mail') return json({error: 'Neplatná operace.'}, 400);
    const db = database(), row = await db.prepare("SELECT value FROM settings WHERE key='booking'").first<{value: string}>();
    const next = validateSettings({...parseSettings(row?.value), morningMail: body.data?.on === true});
    if (typeof next === 'string') return json({error: next}, 400);
    await db.prepare("INSERT INTO settings (key,value) VALUES ('booking',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(next)).run();
    return json({ok: true, morningMail: next.morningMail});
  } catch (e) { console.error(e); return json({error: 'Nastavení se nepodařilo uložit. Zkuste to znovu.'}, 503); }
}

const time = (s: string) => s.slice(11, 16).replace(/^0/, '');
const dayText = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('cs-CZ', {weekday: 'long', day: 'numeric', month: 'numeric'});

/**
 * Ranní e-mail salonu s přehledem dne (zapíná se v aplikaci v části Dnes). Bez zdravotních údajů:
 * u termínu je jen poznámka, že v kartě je upozornění.
 */
export async function morningDigest(adminUrl: string, now = salonNow()) {
  const send = salonMailer();
  if (!send) return false;
  const d = await todayData(now);
  if (!d.morningMail) return false;
  const lines = d.bookings.map(b => {
    const flags = [b.firstVisit && 'nová klientka', b.depositStatus === 'pending' && 'kauce nezaplacená', b.intake === 'sent' && 'dotazník nevyplněný',
      !b.intake && b.clientId && 'bez dotazníku', (b.cautions.trim() || b.warnings.length) && 'upozornění v kartě'].filter(Boolean);
    return `- ${time(b.start)}–${time(b.end)} ${b.serviceName} · ${b.name || 'bez jména'}${flags.length ? ` (${flags.join(', ')})` : ''}`;
  });
  const todo = [d.todo.pendingDeposits.length && `Nezaplacené kauce: ${d.todo.pendingDeposits.length}`,
    d.todo.unpaidReceipts.count && `Nezaplacené účtenky: ${d.todo.unpaidReceipts.count} (${formatRevenue(d.todo.unpaidReceipts.cents)})`,
    d.todo.vouchersPending && `Poukazy z webu čekají na platbu: ${d.todo.vouchersPending}`, d.todo.notFinished && `Proběhlé termíny bez účtenky: ${d.todo.notFinished}`,
    d.todo.stockLow.length && `Dochází: ${d.todo.stockLow.join(', ')}`].filter(Boolean);
  await send(`Dnes ${dayText(d.today)}: ${d.bookings.length ? `${d.bookings.length} ${d.bookings.length === 1 ? 'termín' : d.bookings.length <= 4 ? 'termíny' : 'termínů'}` : 'žádné termíny'}`, [
    'Dobré ráno,', '', d.bookings.length ? 'dnešní termíny:' : 'dnes nemáte žádné objednané termíny.', ...lines,
    ...d.blocks.map(b => `- ${time(b.start)}–${time(b.end)} blokováno: ${b.serviceName}`), '',
    ...(todo.length ? ['Čeká na vyřízení:', ...todo.map(t => '- ' + t), ''] : []),
    d.birthdaysToday.length ? `Narozeniny dnes: ${d.birthdaysToday.join(', ')}.` : '',
    d.todo.tomorrow ? `Zítra: ${d.todo.tomorrow} ${d.todo.tomorrow === 1 ? 'termín' : d.todo.tomorrow <= 4 ? 'termíny' : 'termínů'}.` : '',
    'Podrobnosti a upozornění ke klientkám najdete v aplikaci v části Dnes:', adminUrl,
  ].join('\n').replace(/\n{3,}/g, '\n\n'));
  return true;
}
