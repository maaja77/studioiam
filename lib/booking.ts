// Pravidla online rezervací: otevírací doba, volné termíny a porovnání telefonů.
// Časy se ukládají jako místní čas salonu (Europe/Prague) ve tvaru YYYY-MM-DDTHH:MM.

export type Hours = Record<string, [string, string] | null>; // klíč 0 = neděle … 6 = sobota
export type BookingSettings = {hours: Hours; leadHours: number; horizonDays: number; stepMinutes: number};
export type BusyRange = {start: string; end: string};

export const DEFAULT_SETTINGS: BookingSettings = {
  hours: {'0': null, '1': ['09:00', '18:00'], '2': ['09:00', '18:00'], '3': ['09:00', '18:00'], '4': ['09:00', '18:00'], '5': ['09:00', '16:00'], '6': null},
  leadHours: 12,
  horizonDays: 60,
  stepMinutes: 30,
};
export const WEEKDAYS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
export const ACTIVE_STATUSES = ['confirmed', 'done'];

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
  return {hours, leadHours: lead, horizonDays: horizon, stepMinutes: step};
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
