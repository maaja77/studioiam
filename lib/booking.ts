// Pravidla online rezervací: otevírací doba, volné termíny a porovnání telefonů.
import {czIban} from './payment';
// Časy se ukládají jako místní čas salonu (Europe/Prague) ve tvaru YYYY-MM-DDTHH:MM.

export type Hours = Record<string, [string, string] | null>; // klíč 0 = neděle … 6 = sobota
export type BookingSettings = {hours: Hours; leadHours: number; horizonDays: number; stepMinutes: number;
  depositFromKc: number; depositPercent: number; depositHoldHours: number; account: string; accountName: string; changeLimitHours: number;
  businessName: string; businessOwner: string; businessAddress: string; businessId: string};
export type BusyRange = {start: string; end: string};

export const DEFAULT_SETTINGS: BookingSettings = {
  hours: {'0': null, '1': ['09:00', '20:00'], '2': ['09:00', '20:00'], '3': ['09:00', '20:00'], '4': ['09:00', '20:00'], '5': ['09:00', '20:00'], '6': null},
  leadHours: 12,
  horizonDays: 60,
  stepMinutes: 30,
  depositFromKc: 2000,
  depositPercent: 30,
  depositHoldHours: 24,
  account: '',
  accountName: 'STUDIO I AM',
  changeLimitHours: 24,
  businessName: 'STUDIO I AM',
  businessOwner: '',
  businessAddress: 'Nerudova 884/11, 500 02 Hradec Králové',
  businessId: '73975052',
};
export const WEEKDAYS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
export const ACTIVE_STATUSES = ['confirmed', 'done', 'pending'];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTime = (s: unknown): s is string => typeof s === 'string' && TIME.test(s);
export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
export const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const fromMinutes = (m: number) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

export function addDays(date: string, days: number) {
  const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
export function weekday(date: string) { return new Date(date + 'T12:00:00Z').getUTCDay(); }

/** Aktuální místní datum a čas salonu jako YYYY-MM-DDTHH:MM. */
export function salonNow(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(now).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
/** Posune místní čas salonu o daný počet minut (kalendářně, bez ohledu na letní čas). */
export function addMinutes(local: string, minutes: number) {
  const d = new Date(local + ':00Z'); d.setUTCMinutes(d.getUTCMinutes() + minutes); return d.toISOString().slice(0, 16);
}

export function parseSettings(raw: string | null | undefined): BookingSettings {
  try {
    const v = JSON.parse(raw || '') as Partial<BookingSettings>;
    return {...DEFAULT_SETTINGS, ...v, hours: {...DEFAULT_SETTINGS.hours, ...(v.hours || {})}};
  } catch { return DEFAULT_SETTINGS; }
}

export function validateSettings(v: unknown): BookingSettings | string {
  if (!v || typeof v !== 'object') return 'Neplatné nastavení.';
  const s = v as BookingSettings, hours: Hours = {};
  for (let i = 0; i < 7; i++) {
    const h = s.hours?.[String(i)];
    if (h === null || h === undefined) { hours[String(i)] = null; continue; }
    if (!Array.isArray(h) || !isTime(h[0]) || !isTime(h[1]) || toMinutes(h[0]) >= toMinutes(h[1])) return `Zkontrolujte otevírací dobu (${WEEKDAYS[i]}).`;
    hours[String(i)] = [h[0], h[1]];
  }
  const lead = Number(s.leadHours), horizon = Number(s.horizonDays), step = Number(s.stepMinutes);
  if (!Number.isInteger(lead) || lead < 0 || lead > 168) return 'Minimální předstih musí být 0–168 hodin.';
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 365) return 'Rezervace dopředu musí být 1–365 dní.';
  if (![15, 30, 60].includes(step)) return 'Krok nabízených časů musí být 15, 30 nebo 60 minut.';
  const depositFrom = Number(s.depositFromKc), percent = Number(s.depositPercent), hold = Number(s.depositHoldHours);
  if (!Number.isInteger(depositFrom) || depositFrom < 0) return 'Hranice pro kauci musí být celé číslo v Kč (0 = kauce vypnutá).';
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) return 'Výše kauce musí být 1–100 %.';
  if (!Number.isInteger(hold) || hold < 1 || hold > 168) return 'Lhůta na zaplacení kauce musí být 1–168 hodin.';
  const account = typeof s.account === 'string' ? s.account.trim() : '';
  if (account && !czIban(account)) return 'Zkontrolujte číslo účtu (např. 123456789/0300).';
  const accountName = typeof s.accountName === 'string' ? s.accountName.trim().slice(0, 60) : '';
  const change = Number(s.changeLimitHours ?? DEFAULT_SETTINGS.changeLimitHours);
  if (!Number.isInteger(change) || change < 0 || change > 336) return 'Lhůta pro online změnu termínu musí být 0–336 hodin.';
  const raw = s as unknown as Record<string, unknown>, text = (k: keyof BookingSettings, max: number) => typeof raw[k] === 'string' ? (raw[k] as string).trim().slice(0, max) : String(DEFAULT_SETTINGS[k]);
  const businessId = text('businessId', 12);
  if (businessId && !/^\d{8}$/.test(businessId)) return 'IČO musí mít 8 číslic.';
  return {businessName: text('businessName', 80), businessOwner: text('businessOwner', 80), businessAddress: text('businessAddress', 160), businessId,
    hours, leadHours: lead, horizonDays: horizon, stepMinutes: step, depositFromKc: depositFrom, depositPercent: percent, depositHoldHours: hold, account, accountName, changeLimitHours: change};
}

/** Volné začátky termínů pro ošetření dané délky v daný den. */
export function freeSlots(date: string, durationMin: number, settings: BookingSettings, busy: BusyRange[], now: string) {
  const h = settings.hours[String(weekday(date))];
  if (!h || durationMin <= 0) return [];
  const earliest = addMinutes(now, settings.leadHours * 60), latest = addDays(now.slice(0, 10), settings.horizonDays);
  if (date > latest) return [];
  const out: string[] = [];
  for (let m = toMinutes(h[0]); m + durationMin <= toMinutes(h[1]); m += settings.stepMinutes) {
    const start = `${date}T${fromMinutes(m)}`, end = addMinutes(start, durationMin);
    if (start < earliest) continue;
    if (busy.some(b => b.start < end && start < b.end)) continue;
    out.push(fromMinutes(m));
  }
  return out;
}

/** Telefon bez mezer a předvolby +420, aby šlo poznat stejnou klientku. */
export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits.replace(/^(00)?420(?=\d{9}$)/, '');
}
