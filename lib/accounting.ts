// Podklady pro účetní: měsíční souhrn účtenek podle způsobu platby a druhu položek, export CSV.
// Jména klientek se do podkladů nedávají; účetní je k evidenci příjmů nepotřebuje.
export type AccountingReceipt = {number: string; issued: string; status: string; method: string; paid: number; totalCents: number; prepaidCents: number; voucherCents: number;
  dueCents: number; discountCents: number; services: number; products: number; vouchers: number; other: number};
export type AccountingDeposit = {date: string; vs: string; cents: number};
export type AccountingSummary = {count: number; cancelled: number; totalCents: number; voucherCoveredCents: number; receivedCents: number;
  byMethod: {cash: number; card: number; qr: number; prepaid: number}; byKind: {services: number; products: number; vouchers: number; other: number};
  discountCents: number; unpaid: {count: number; cents: number}; forfeitedCents: number};
type Item = {qty: number; unitCents: number; kind: string};

/** Rozdělí zaplacenou část účtenky (bez části uhrazené poukazem) na ošetření, produkty, prodané poukazy a ostatní; sleva se rozpočítá poměrně. */
export function splitItems(items: Item[], paidCents: number) {
  const gross = items.reduce((s, x) => s + x.qty * x.unitCents, 0), out = {services: 0, products: 0, vouchers: 0, other: 0};
  if (!gross) return out;
  for (const x of items) {
    const key = x.kind === 'service' ? 'services' : x.kind === 'product' ? 'products' : x.kind === 'voucher' ? 'vouchers' : 'other';
    out[key] += Math.round(x.qty * x.unitCents * paidCents / gross);
  }
  // Zaokrouhlovací rozdíl se přičte k největší položce, aby součet seděl na korunu.
  const diff = paidCents - out.services - out.products - out.vouchers - out.other;
  if (diff) { const k = (Object.keys(out) as (keyof typeof out)[]).sort((a, b) => out[b] - out[a])[0]; out[k] += diff; }
  return out;
}

export function summarize(receipts: AccountingReceipt[], deposits: AccountingDeposit[]): AccountingSummary {
  const s: AccountingSummary = {count: 0, cancelled: 0, totalCents: 0, voucherCoveredCents: 0, receivedCents: 0, byMethod: {cash: 0, card: 0, qr: 0, prepaid: 0},
    byKind: {services: 0, products: 0, vouchers: 0, other: 0}, discountCents: 0, unpaid: {count: 0, cents: 0}, forfeitedCents: deposits.reduce((n, d) => n + d.cents, 0)};
  for (const r of receipts) {
    if (r.status !== 'issued') { s.cancelled++; continue; }
    s.count++; s.totalCents += r.totalCents; s.voucherCoveredCents += r.voucherCents; s.receivedCents += r.totalCents - r.voucherCents; s.discountCents += r.discountCents;
    s.byMethod.prepaid += r.prepaidCents;
    if (r.method === 'cash' || r.method === 'card' || r.method === 'qr') s.byMethod[r.method] += r.dueCents;
    if (!r.paid && r.dueCents > 0) { s.unpaid.count++; s.unpaid.cents += r.dueCents; }
    s.byKind.services += r.services; s.byKind.products += r.products; s.byKind.vouchers += r.vouchers; s.byKind.other += r.other;
  }
  return s;
}

export const METHOD_TEXT: Record<string, string> = {cash: 'hotově', card: 'kartou', qr: 'QR platba / převod'};
const kc = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const cell = (v: string) => /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
const dateCz = (s: string) => s.slice(0, 10).split('-').reverse().join('.');

/** CSV pro Excel (středník, UTF-8 s BOM): kniha účtenek, propadlé kauce a souhrn. */
export function accountingCsv(month: string, salon: string, receipts: AccountingReceipt[], deposits: AccountingDeposit[]) {
  const s = summarize(receipts, deposits), rows: string[][] = [
    [`Podklady pro účetní ${month.slice(5)}/${month.slice(0, 4)}`, salon], [],
    ['Číslo účtenky', 'Datum', 'Stav', 'Způsob platby', 'Celkem Kč', 'Sleva Kč', 'Uhrazeno poukazem Kč', 'Zaplaceno předem (kauce) Kč', 'K úhradě Kč', 'Zaplaceno', 'Ošetření Kč', 'Produkty Kč', 'Prodej poukazů Kč', 'Ostatní Kč'],
    ...receipts.map(r => [r.number, dateCz(r.issued), r.status === 'issued' ? 'vystaveno' : 'storno', METHOD_TEXT[r.method] || r.method, kc(r.totalCents), kc(r.discountCents), kc(r.voucherCents), kc(r.prepaidCents), kc(r.dueCents),
      r.status !== 'issued' ? '' : r.paid || !r.dueCents ? 'ano' : 'ne', kc(r.services), kc(r.products), kc(r.vouchers), kc(r.other)]),
  ];
  if (deposits.length) rows.push([], ['Propadlé kauce (klientka nepřišla)'], ['Datum termínu', 'Variabilní symbol', 'Částka Kč'], ...deposits.map(d => [dateCz(d.date), d.vs, kc(d.cents)]));
  rows.push([], ['Souhrn'], ['Účtenek', String(s.count)], ['Stornovaných účtenek', String(s.cancelled)], ['Celkem na účtenkách Kč', kc(s.totalCents)],
    ['Uhrazeno dárkovými poukazy Kč (tržba byla při prodeji poukazu)', kc(s.voucherCoveredCents)], ['Tržby Kč', kc(s.receivedCents)],
    ['  z toho hotově Kč', kc(s.byMethod.cash)], ['  z toho kartou Kč', kc(s.byMethod.card)], ['  z toho QR platba / převod Kč', kc(s.byMethod.qr)], ['  z toho kauce zaplacené předem převodem Kč', kc(s.byMethod.prepaid)],
    ['Ošetření Kč', kc(s.byKind.services)], ['Produkty Kč', kc(s.byKind.products)], ['Prodej dárkových poukazů Kč', kc(s.byKind.vouchers)], ['Ostatní Kč', kc(s.byKind.other)],
    ['Poskytnuté slevy Kč', kc(s.discountCents)], ['Nezaplacené QR účtenky (stav ke dni stažení) Kč', kc(s.unpaid.cents)], ['Propadlé kauce Kč', kc(s.forfeitedCents)]);
  return '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n') + '\r\n';
}
