// Programy: série jednoho ošetření se slevou podle pořadí návštěvy. Když klientka nepřijde do intervalu od minulé návštěvy, série začíná znovu.
export type Program = {id: string; name: string; treatment: string; priceCents: number; discounts: number[]; intervalDays: number; active: number; sort: number};
export type ProgramVisit = {id: string; date: string; programId: string | null; programPriceCents: number | null; programStep: number | null};

const DAY = 86400000;
const day = (date: string) => Date.parse(date + 'T00:00:00Z') / DAY;
export function addDays(date: string, days: number) { return new Date((day(date) + days) * DAY).toISOString().slice(0, 10); }

/** Sleva v % pro n-tou návštěvu série (poslední sleva v seznamu platí pro všechny další). */
export const stepDiscount = (p: Pick<Program, 'discounts'>, step: number) => p.discounts.length ? p.discounts[Math.min(step, p.discounts.length) - 1] : 0;
export const stepPrice = (p: Pick<Program, 'priceCents' | 'discounts'>, step: number) => Math.round(p.priceCents * (100 - stepDiscount(p, step)) / 100);

/** Kolikátá návštěva v sérii a za kolik by byla návštěva v daný den. */
export function programQuote(program: Program, visits: ProgramVisit[], date: string, excludeId?: string) {
  const history = visits.filter(v => v.programId === program.id && v.id !== excludeId && v.date <= date).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let step = 0, last: string | null = null;
  for (const visit of history) { step = last && day(visit.date) - day(last) <= program.intervalDays ? step + 1 : 1; last = visit.date; }
  const restarted = last !== null && day(date) - day(last) > program.intervalDays;
  const nextStep = restarted ? 1 : step + 1;
  return {step: nextStep, discount: stepDiscount(program, nextStep), priceCents: stepPrice(program, nextStep), lastDate: last, dueDate: last ? addDays(last, program.intervalDays) : null, restarted};
}

/** Do kdy má klientka přijít na další návštěvu, aby jí sleva zůstala. */
export function programStatus(program: Program, visits: ProgramVisit[], today: string) {
  const latest = visits.filter(v => v.programId === program.id).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!latest) return {dueDate: null, daysLeft: null, overdue: false};
  const dueDate = addDays(latest.date, program.intervalDays), daysLeft = day(dueDate) - day(today);
  return {dueDate, daysLeft, overdue: daysLeft < 0};
}

/** Seznam slev z textu „0, 5, 10“; vrací chybu jako text. */
export function parseDiscounts(value: unknown): number[] | string {
  const parts = Array.isArray(value) ? value.map(String) : String(value ?? '').split(/[,;\s]+/).filter(Boolean);
  if (!parts.length) return [0];
  if (parts.length > 12) return 'Zadejte nejvýš 12 slev.';
  const list = parts.map(x => Number(x.replace('%', '').replace(',', '.')));
  if (list.some(n => !Number.isInteger(n) || n < 0 || n > 90)) return 'Slevy zadejte jako celá procenta 0–90, oddělená čárkou (např. 0, 5, 10).';
  return list;
}

export const parseProgram = (row: Record<string, unknown>): Program => {
  let discounts: number[] = [0];
  try { const v = parseDiscounts(JSON.parse(String(row.discounts || '[0]'))); if (Array.isArray(v)) discounts = v; } catch { /* výchozí bez slevy */ }
  return {id: String(row.id), name: String(row.name), treatment: String(row.treatment), priceCents: Number(row.priceCents), discounts, intervalDays: Number(row.intervalDays) || 28, active: Number(row.active), sort: Number(row.sort) || 0};
};
export const PROGRAM_COLUMNS = 'id,name,treatment,price_cents AS priceCents,discounts,interval_days AS intervalDays,active,sort';
