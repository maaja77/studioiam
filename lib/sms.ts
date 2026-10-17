// SMS připomínky termínů: text ze šablony, délka zprávy a telefon v mezinárodním tvaru.

export const SMS_PLACEHOLDERS = ['jmeno', 'salon', 'kdy', 'datum', 'cas', 'osetreni', 'telefon'] as const;
export const DEFAULT_SMS_TEMPLATE = '{salon}: připomínáme Váš termín {kdy} {datum} v {cas} ({osetreni}). Pokud nemůžete přijít, dejte prosím vědět na {telefon}. Děkujeme.';
const DAYS = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];

/** Bez háčků a čárek se SMS vejde do 160 znaků; s nimi jen do 70. */
export const stripDiacritics = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export type SmsBooking = {name: string; start: string; serviceName: string};
export type SmsSalon = {name: string; phone: string};

/** Text připomínky pro konkrétní termín (start ve tvaru YYYY-MM-DDTHH:MM, today = dnešní datum salonu). */
export function renderSms(template: string, b: SmsBooking, salon: SmsSalon, ascii: boolean, today: string) {
  const date = b.start.slice(0, 10), next = new Date(today + 'T12:00:00Z'); next.setUTCDate(next.getUTCDate() + 1);
  const day = new Date(b.start.slice(0, 10) + 'T12:00:00Z');
  const values: Record<string, string> = {
    jmeno: b.name.trim().split(/\s+/)[0] || '',
    salon: salon.name,
    kdy: date === today ? 'dnes' : date === next.toISOString().slice(0, 10) ? 'zítra' : '',
    datum: `${DAYS[day.getUTCDay()]} ${day.getUTCDate()}.${day.getUTCMonth() + 1}.`,
    cas: b.start.slice(11, 16).replace(/^0/, ''),
    osetreni: b.serviceName,
    telefon: salon.phone,
  };
  const text = template.replace(/\{(\w+)\}/g, (m, k: string) => k in values ? values[k] : m).replace(/[ \t]+/g, ' ').replace(/ ([.,)])/g, '$1').trim();
  return ascii ? stripDiacritics(text) : text;
}

/** Počet SMS, ze kterých se zpráva skládá (GSM 160/153 znaků, s diakritikou 70/67). */
export function smsParts(text: string) {
  const gsm = /^[A-Za-z0-9 @£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/.test(text);
  const len = gsm ? [...text].reduce((n, c) => n + ('^{}\\[~]|€'.includes(c) ? 2 : 1), 0) : [...text].length;
  const [one, many] = gsm ? [160, 153] : [70, 67];
  return {length: len, parts: len <= one ? 1 : Math.ceil(len / many), unicode: !gsm};
}

/** Telefon klientky v mezinárodním tvaru (+420…); devítimístné číslo bez předvolby je české. Null = nejde o mobil, na který jde SMS poslat. */
export function smsPhone(phone: string) {
  const p = phone.trim().replace(/[\s\-/().]/g, '');
  const intl = p.startsWith('+') ? p : p.startsWith('00') ? '+' + p.slice(2) : /^\d{9}$/.test(p) ? '+420' + p : '';
  if (!/^\+\d{9,15}$/.test(intl)) return null;
  if (intl.startsWith('+420') && !/^\+420[67]\d{8}$/.test(intl)) return null; // v ČR jsou mobily jen 6xx a 7xx
  return intl;
}
