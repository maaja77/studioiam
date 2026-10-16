// QR platba podle české normy Short Payment Descriptor (SPD), jak ji čtou bankovní aplikace.

/** Převede české číslo účtu (předčíslí-číslo/banka) na IBAN; vrací null, když formát nesedí. */
export function czIban(account: string): string | null {
  const m = account.replace(/\s/g, '').match(/^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/);
  if (!m) return null;
  const bban = m[3] + (m[1] || '').padStart(6, '0') + m[2].padStart(10, '0');
  const numeric = bban + '123500'; // C=12, Z=35, kontrolní číslice 00
  let rest = 0;
  for (const digit of numeric) rest = (rest * 10 + Number(digit)) % 97;
  return 'CZ' + String(98 - rest).padStart(2, '0') + bban;
}

export function formatIban(iban: string) { return iban.replace(/(.{4})/g, '$1 ').trim(); }

const spdText = (s: string) => s.replace(/×/g, 'x').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[*]/g, ' ').replace(/[^\x20-\x7E]/g, '-').toUpperCase().slice(0, 60);

/** Text pro QR kód platby. Částka v haléřích, variabilní symbol nejvýše 10 číslic. */
export function spdPayload({iban, amountCents, vs, message, recipient}: {iban: string; amountCents: number; vs?: string; message?: string; recipient?: string}) {
  const parts = ['SPD', '1.0', 'ACC:' + iban, 'AM:' + (amountCents / 100).toFixed(2), 'CC:CZK'];
  if (vs) parts.push('X-VS:' + vs.replace(/\D/g, '').slice(0, 10));
  if (message) parts.push('MSG:' + spdText(message));
  if (recipient) parts.push('RN:' + spdText(recipient));
  return parts.join('*');
}

/** Kauce: procento z ceny zaokrouhlené na celé stovky (nejméně 100 Kč). */
export function depositFor(priceCents: number, percent: number) {
  return Math.max(10000, Math.round(priceCents * percent / 100 / 10000) * 10000);
}
