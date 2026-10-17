// Veřejná část vstupního dotazníku: klientka ho otevře přes tajný odkaz, vyplní a podepíše.
import {database, notifySalon} from '../../../db/raw';
import {isDate, normalizePhone, parseSettings, salonName} from '../../../lib/booking';
import {consentText, INTAKE_QUESTIONS, intakeWarnings, PHOTO_CONSENT, type IntakeAnswers} from '../../../lib/intake';
import {salonInfo} from './route';

const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
const NOT_FOUND = 'Dotazník nebyl nalezen. Odkaz už možná neplatí, zeptejte se prosím v salonu.';
type Pending = {id: string; clientId: string | null; bookingId: string | null; status: string};

async function pending(token: string) {
  if (!/^[0-9a-f]{40}$/.test(token)) return null;
  return database().prepare('SELECT id,client_id AS clientId,booking_id AS bookingId,status FROM intake_forms WHERE token=?').bind(token).first<Pending>();
}
async function settings() {
  return parseSettings((await database().prepare("SELECT value FROM settings WHERE key='booking'").first<{value: string}>())?.value);
}

/** Údaje pro formulář: předvyplněné jméno a kontakty z karty nebo rezervace, text souhlasu. */
export async function intakeGet(token: string) {
  const form = await pending(token);
  if (!form || form.status === 'withdrawn') return json({error: NOT_FOUND}, 404);
  const s = await settings();
  if (form.status === 'done') return json({done: true, salon: salonInfo(s)});
  const db = database();
  const person = (form.clientId ? await db.prepare('SELECT name,phone,email FROM clients WHERE id=?').bind(form.clientId).first<{name: string; phone: string; email: string}>() : null)
    || (form.bookingId ? await db.prepare('SELECT name,phone,email FROM bookings WHERE id=?').bind(form.bookingId).first<{name: string; phone: string; email: string}>() : null)
    || {name: '', phone: '', email: ''};
  return json({person, questions: INTAKE_QUESTIONS, consentText: consentText(s), photoConsent: PHOTO_CONSENT, salon: salonInfo(s)});
}

export async function intakeSubmit(d: Record<string, unknown>, ip: string) {
  const text = (k: string, max: number) => typeof d[k] === 'string' ? (d[k] as string).trim().slice(0, max) : '';
  const form = await pending(text('token', 64));
  if (!form || form.status === 'withdrawn') return json({error: NOT_FOUND}, 404);
  if (form.status === 'done') return json({error: 'Dotazník už je vyplněný. Děkujeme.'}, 409);
  const name = text('name', 120), phone = text('phone', 40), email = text('email', 200), birthDate = text('birthDate', 10), signedName = text('signedName', 120);
  if (!name) return json({error: 'Vyplňte prosím jméno a příjmení.'}, 400);
  if (phone && normalizePhone(phone).length < 9) return json({error: 'Zkontrolujte prosím telefon.'}, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({error: 'Zkontrolujte prosím e-mail.'}, 400);
  if (birthDate && (!isDate(birthDate) || birthDate < '1900-01-01' || birthDate > new Date().toISOString().slice(0, 10))) return json({error: 'Zkontrolujte prosím datum narození.'}, 400);
  const raw = (d.answers && typeof d.answers === 'object' ? d.answers : {}) as Record<string, {yes?: unknown; detail?: unknown}>, answers = {} as IntakeAnswers;
  for (const q of INTAKE_QUESTIONS) {
    const a = raw[q.id];
    if (!a || typeof a.yes !== 'boolean') return json({error: `Odpovězte prosím na otázku: ${q.text}`}, 400);
    answers[q.id] = {yes: a.yes, detail: a.yes && typeof a.detail === 'string' ? a.detail.trim().slice(0, 500) : ''};
  }
  const other = typeof raw.other?.detail === 'string' ? raw.other.detail.trim().slice(0, 1000) : '';
  if (other) answers.other = {yes: true, detail: other};
  if (d.consentHealth !== true) return json({error: 'Bez souhlasu se zpracováním údajů nemůžeme dotazník uložit. Pokud nesouhlasíte, domluvíme se prosím osobně v salonu.'}, 400);
  if (d.truth !== true) return json({error: 'Potvrďte prosím pravdivost údajů.'}, 400);
  const signature = typeof d.signature === 'string' ? d.signature : '';
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) || signature.length < 400) return json({error: 'Podepište se prosím prstem nebo myší do rámečku.'}, 400);
  if (signature.length > 300_000) return json({error: 'Podpis je příliš velký, zkuste ho prosím smazat a podepsat znovu.'}, 400);
  if (!signedName) return json({error: 'Vyplňte prosím jméno pod podpis.'}, 400);

  const db = database(), s = await settings(), now = new Date().toISOString();
  // Karta klientky: z odkazu, z rezervace, podle telefonu, nebo se založí nová.
  let clientId = form.clientId;
  if (!clientId && form.bookingId) clientId = (await db.prepare('SELECT client_id AS clientId FROM bookings WHERE id=?').bind(form.bookingId).first<{clientId: string | null}>())?.clientId ?? null;
  if (!clientId && phone) {
    const all = await db.prepare('SELECT id,phone FROM clients').all<{id: string; phone: string}>();
    clientId = all.results.find(c => c.phone && normalizePhone(c.phone) === normalizePhone(phone))?.id ?? null;
  }
  const statements = [];
  if (!clientId) {
    clientId = crypto.randomUUID();
    statements.push(db.prepare('INSERT INTO clients (id,name,phone,email,created) VALUES (?,?,?,?,?)').bind(clientId, name, phone, email, now));
  } else {
    statements.push(db.prepare("UPDATE clients SET phone=CASE WHEN phone='' THEN ? ELSE phone END,email=CASE WHEN email='' THEN ? ELSE email END WHERE id=?").bind(phone, email, clientId));
  }
  if (form.bookingId) statements.push(db.prepare('UPDATE bookings SET client_id=? WHERE id=? AND client_id IS NULL').bind(clientId, form.bookingId));
  statements.push(db.prepare("UPDATE intake_forms SET status='done',client_id=?,answers=?,birth_date=?,consent_health=1,consent_photos=?,signed_name=?,signature=?,consent_text=?,submitted_at=?,submitted_ip=? WHERE id=? AND status='sent'")
    .bind(clientId, JSON.stringify(answers), birthDate, d.consentPhotos === true ? 1 : 0, signedName, signature, consentText(s) + '\n\n' + (d.consentPhotos === true ? PHOTO_CONSENT : 'Bez souhlasu s fotografiemi.'), now, ip.slice(0, 64), form.id));
  await db.batch(statements);
  // Do e-mailu nejdou údaje o zdraví, jen upozornění, že jsou na kartě.
  const warnings = intakeWarnings(answers).length;
  notifySalon(`Vyplněný dotazník: ${name}`, [`${name} vyplnila vstupní dotazník a podepsala souhlas (${salonName(s)}).`,
    warnings ? `Odpovědi „ano“: ${warnings}. Podrobnosti jsou na kartě klientky.` : 'Žádné zdravotní upozornění.',
    d.consentPhotos === true ? 'Souhlasí s fotografiemi.' : 'Nesouhlasí s fotografiemi.'].join('\n'));
  return json({ok: true});
}
