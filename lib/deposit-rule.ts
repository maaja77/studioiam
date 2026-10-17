// Kauce na míru jedné klientce: '' = podle nastavení salonu, 'p:50' = procento z ceny, 'k:50000' = pevná částka v haléřích, 'full' = celá cena předem.
import {depositFor} from './payment';

export type DepositRule = {kind: 'salon'} | {kind: 'percent'; percent: number} | {kind: 'fixed'; cents: number} | {kind: 'full'};

export function parseRule(raw: string | null | undefined): DepositRule {
  const v = (raw || '').trim();
  if (v === 'full') return {kind: 'full'};
  const p = /^p:(\d{1,3})$/.exec(v); if (p && +p[1] >= 1 && +p[1] <= 100) return {kind: 'percent', percent: +p[1]};
  const k = /^k:(\d{1,9})$/.exec(v); if (k && +k[1] >= 10000) return {kind: 'fixed', cents: +k[1]};
  return {kind: 'salon'};
}
export const ruleValue = (r: DepositRule) => r.kind === 'full' ? 'full' : r.kind === 'percent' ? `p:${r.percent}` : r.kind === 'fixed' ? `k:${r.cents}` : '';

/** Výše kauce za ošetření podle pravidla klientky; pevná částka nejvýš do ceny ošetření (u ošetření bez ceny celá). */
export function ruleAmount(rule: DepositRule, priceCents: number, salonPercent: number) {
  if (rule.kind === 'fixed') return priceCents > 0 ? Math.min(priceCents, rule.cents) : rule.cents;
  if (priceCents <= 0) return 0;
  if (rule.kind === 'full') return priceCents;
  return Math.min(priceCents, depositFor(priceCents, rule.kind === 'percent' ? rule.percent : salonPercent));
}

export function ruleText(rule: DepositRule, salonPercent: number) {
  return rule.kind === 'full' ? 'celá cena předem' : rule.kind === 'percent' ? `${rule.percent} % z ceny` : rule.kind === 'fixed' ? `${rule.cents / 100} Kč` : `${salonPercent} % z ceny (podle nastavení salonu)`;
}
