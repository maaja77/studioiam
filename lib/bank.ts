// Načtení výpisu pohybů z banky (CSV export ČSOB „Pohyby na účtu“) pro párování plateb podle variabilního symbolu.

export type BankRow = {id: string; date: string; amountCents: number; vs: string; account: string; name: string; message: string; operation: string};
export type BankStatement = {account: string; rows: BankRow[]; outgoing: number; skipped: number};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Rozdělí řádek CSV se středníky; zvládne i hodnoty v uvozovkách. */
function splitLine(line: string, sep: string) {
  const out: string[] = []; let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch; }
    else if (ch === '"' && !cur.trim()) { quoted = true; cur = ''; }
    else if (ch === sep) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Částka „1 690,50“ nebo „-690.00“ v haléřích. */
export function parseAmount(s: string) {
  const t = s.replace(/[\s ]/g, '').replace(/kč|czk/gi, '').replace(',', '.');
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** Datum „16.10.2026“ nebo „2026-10-16“ jako 2026-10-16. */
export function parseDate(s: string) {
  let m = s.trim().match(/^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/** Variabilní symbol bez úvodních nul (banky ho často doplňují na 10 číslic). */
export const cleanVs = (s: string) => s.replace(/\D/g, '').replace(/^0+/, '');

// Sloupce exportu ČSOB; jiné banky mají podobné názvy, takže se hledá i podle náhradních.
const COLUMNS = {
  date: ['datum zauctovani', 'datum provedeni', 'datum'],
  amount: ['castka', 'objem'],
  vs: ['variabilni symbol', 'vs'],
  account: ['cislo protiuctu', 'protiucet'],
  bank: ['kod banky protiuctu', 'kod banky'],
  name: ['jmeno protistrany', 'nazev protiuctu', 'protistrana'],
  message: ['zprava', 'zprava pro prijemce', 'poznamka'],
  operation: ['oznaceni operace', 'typ transakce', 'typ'],
  id: ['id transakce', 'id pohybu'],
  own: ['cislo uctu'],
} as const;

/**
 * Přečte CSV výpis: najde řádek s hlavičkou, vezme jen příchozí platby (kladná částka).
 * Vrací chybu jako text, pokud soubor nevypadá jako výpis pohybů.
 */
export function parseStatement(text: string): BankStatement | string {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const headerAt = lines.findIndex(l => { const n = norm(l); return n.includes('castka') && n.includes('datum'); });
  if (headerAt < 0) return 'Soubor nevypadá jako výpis pohybů z banky. Stáhněte v internetovém bankovnictví Pohyby na účtu jako CSV.';
  const sep = lines[headerAt].includes(';') ? ';' : lines[headerAt].includes('\t') ? '\t' : ',';
  const header = splitLine(lines[headerAt], sep).map(norm);
  const col = (k: keyof typeof COLUMNS) => { for (const name of COLUMNS[k]) { const i = header.indexOf(name); if (i >= 0) return i; } return -1; };
  const c = Object.fromEntries(Object.keys(COLUMNS).map(k => [k, col(k as keyof typeof COLUMNS)])) as Record<keyof typeof COLUMNS, number>;
  if (c.date < 0 || c.amount < 0 || c.vs < 0) return 'Ve výpisu chybí sloupec s datem, částkou nebo variabilním symbolem.';
  const title = lines.slice(0, headerAt).join(' ').match(/(\d{0,6}-?\d{2,10}\/\d{4})/);
  let account = title ? title[1] : '', outgoing = 0, skipped = 0;
  const rows: BankRow[] = [];
  for (const line of lines.slice(headerAt + 1)) {
    if (!line.trim()) continue;
    const f = splitLine(line, sep), get = (i: number) => (i >= 0 ? f[i] || '' : '');
    const date = parseDate(get(c.date)), amountCents = parseAmount(get(c.amount));
    if (!date || amountCents === null) { skipped++; continue; }
    if (!account && get(c.own)) account = get(c.own);
    if (amountCents <= 0) { outgoing++; continue; }
    const vs = cleanVs(get(c.vs)), bank = get(c.bank), other = get(c.account);
    const row = {date, amountCents, vs, account: other ? other + (bank && !other.includes('/') ? '/' + bank : '') : '', name: get(c.name).slice(0, 120),
      message: get(c.message).slice(0, 200), operation: get(c.operation).slice(0, 80)};
    // Bez ID transakce (jiné banky) slouží jako klíč obsah platby, aby opakované nahrání nic nezdvojilo.
    const id = get(c.id).slice(0, 120) || ['x', date, amountCents, vs, row.account, row.message].join('|').slice(0, 120);
    rows.push({id, ...row});
  }
  return {account, rows, outgoing, skipped};
}

/** Porovná čísla účtů bez předčíslí nul a mezer. */
export const sameAccount = (a: string, b: string) => {
  const n = (s: string) => s.replace(/\s/g, '').replace(/^0+-?/, '').replace(/^(\d+)-0*/, '$1-');
  return !!a && !!b && n(a) === n(b);
};
