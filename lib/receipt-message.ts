// Text zprávy klientce s účtenkou a platebními údaji (e-mail i SMS).
import {formatRevenue} from './revenue';
import {salonName, type BookingSettings} from './booking';

type ReceiptSummary = {number: string; totalCents: number; dueCents: number; paid: number; vs: string; status: string};

export function receiptMessage(r: ReceiptSummary, s: Pick<BookingSettings, 'businessName' | 'account'>, link: string, short = false) {
  const name = salonName(s), toPay = r.status === 'issued' && r.dueCents > 0 && !r.paid && !!s.account.trim(); // bez účtu salonu není kam platit převodem
  if (short) return toPay
    ? `${name}: účtenka ${r.number}, k zaplacení ${formatRevenue(r.dueCents)}. Účet ${s.account}, VS ${r.vs}. QR kód a účtenka: ${link}`
    : `${name}: děkujeme za návštěvu. Účtenka ${r.number} (${formatRevenue(r.totalCents)}): ${link}`;
  return [
    'Dobrý den,',
    '',
    `děkujeme za návštěvu. Posíláme účtenku č. ${r.number} na ${formatRevenue(r.totalCents)}.`,
    ...(toPay ? ['', `K zaplacení: ${formatRevenue(r.dueCents)}`, `Účet: ${s.account}`, `Variabilní symbol: ${r.vs}`, '', 'Na odkazu níže najdete QR kód pro platbu z bankovní aplikace.'] : []),
    '',
    `Účtenka${toPay ? ' a QR platba' : ''}: ${link}`,
    '',
    `${name}`,
  ].join('\n');
}
