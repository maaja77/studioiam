// Dárkové poukazy: stav podle platnosti a zůstatku, kódy a výpočet čerpání na účtence.
export type Voucher = {id: string; code: string; kind: 'value' | 'service'; serviceName: string; valueCents: number; balanceCents: number;
  buyerName: string; buyerContact: string; recipientName: string; note: string; issued: string; validUntil: string; status: string; receiptId: string | null;
  source?: string; buyerEmail?: string; delivery?: string; vs?: string | null; payDue?: string | null; token?: string | null};
export type VoucherState = 'pending' | 'active' | 'expiring' | 'expired' | 'used' | 'cancelled';
export const EXPIRING_DAYS = 30;

const day = (date: string) => Math.round(Date.parse(date + 'T12:00:00Z') / 86400000);
export const daysLeft = (validUntil: string, today: string) => day(validUntil) - day(today);

/** Stav poukazu k danému dni (platí včetně posledního dne platnosti). */
export function voucherState(v: Pick<Voucher, 'status' | 'balanceCents' | 'validUntil'>, today: string): VoucherState {
  if (v.status === 'cancelled') return 'cancelled';
  if (v.status === 'pending') return 'pending'; // objednávka z webu, čeká na platbu
  if (v.balanceCents <= 0) return 'used';
  const left = daysLeft(v.validUntil, today);
  return left < 0 ? 'expired' : left <= EXPIRING_DAYS ? 'expiring' : 'active';
}

/** Datum o daný počet měsíců později (31. 1. + 1 měsíc = 28./29. 2.). */
export function addMonths(date: string, months: number) {
  const [y, m, d] = date.split('-').map(Number), target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bez 0/O a 1/I, aby se kód dal přepsat z papíru
/** Náhodný kód poukazu ve tvaru ABCD-EF23; nedá se uhodnout z pořadí. */
export function voucherCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const s = Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
  return s.slice(0, 4) + '-' + s.slice(4);
}
export const normalizeCode = (code: string) => { const s = code.toUpperCase().replace(/[^A-Z0-9]/g, ''); return s.length === 8 ? s.slice(0, 4) + '-' + s.slice(4) : s; };

/**
 * Kolik poukaz uhradí na účtence. Hodnotový poukaz do výše zůstatku. Poukaz na ošetření uhradí celé ošetření
 * (i když mezitím zdražilo) a tím se vyčerpá.
 */
export function voucherCover(v: Pick<Voucher, 'kind' | 'serviceName' | 'balanceCents'>, items: {name: string; qty: number; unitCents: number}[], toPay: number) {
  if (toPay <= 0 || v.balanceCents <= 0) return 0;
  if (v.kind === 'service') {
    const match = items.find(x => x.name.trim().toLocaleLowerCase('cs') === v.serviceName.trim().toLocaleLowerCase('cs'));
    return Math.min(toPay, Math.max(v.balanceCents, match?.unitCents || 0));
  }
  return Math.min(toPay, v.balanceCents);
}

/** Kolik dní má kupující na zaplacení poukazu objednaného přes web. */
export const VOUCHER_PAY_DAYS = 5;
/** Nabízené částky poukazů na webu z textu „1000, 1500, 2000“ (celé Kč, vzestupně, bez duplicit). */
export function parseAmounts(text: string) {
  return [...new Set(text.split(/[,;]+/).map(x => x.replace(/kč|\s/gi, '')).filter(Boolean).map(Number).filter(n => Number.isInteger(n) && n >= 100 && n <= 100000))].sort((a, b) => a - b).slice(0, 8);
}
