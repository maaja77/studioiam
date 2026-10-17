// Kalendář rezervací ve formátu iCalendar (.ics) pro odběr v telefonu (iPhone, Google Kalendář).

export type IcalEvent = {uid: string; start: string; end: string; summary: string; description: string; tentative: boolean};

/** Místní čas salonu (YYYY-MM-DDTHH:MM, Europe/Prague) jako okamžik v UTC, včetně letního času. */
export function pragueToUtc(local: string) {
  const guess = Date.parse(local + ':00Z');
  const offset = (t: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(t).map(x => [x.type, x.value]));
    return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) - t;
  };
  const first = guess - offset(guess);
  return new Date(guess - offset(first));
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Řádky delší než 75 bajtů se podle normy zalomí (pokračování začíná mezerou). */
function fold(line: string) {
  const out: string[] = [];
  let current = '', bytes = 0;
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length;
    if (bytes + size > (out.length ? 74 : 75)) { out.push(current); current = ''; bytes = 0; }
    current += ch; bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

export function icalendar(name: string, events: IcalEvent[], now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Salon//Rezervace//CS', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(name)}`, 'X-WR-TIMEZONE:Europe/Prague', 'REFRESH-INTERVAL;VALUE=DURATION:PT15M', 'X-PUBLISHED-TTL:PT15M'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(pragueToUtc(e.start))}`, `DTEND:${stamp(pragueToUtc(e.end))}`,
      `SUMMARY:${escape(e.summary)}`, ...(e.description ? [`DESCRIPTION:${escape(e.description)}`] : []), `STATUS:${e.tentative ? 'TENTATIVE' : 'CONFIRMED'}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
