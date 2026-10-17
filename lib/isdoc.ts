// Načtení elektronické faktury ISDOC (český standard, XML) v prohlížeči: dodavatel, číslo, data, částka a položky.
export type IsdocInvoice = {supplier: string; number: string; date: string; due: string; totalKc: string; items: {name: string; qty: number; costKc: string}[]};

const kc = (v: string) => { const n = Number(v); return Number.isFinite(n) ? String(Math.round(n * 100) / 100).replace('.', ',') : ''; };

export function parseIsdoc(xml: string): IsdocInvoice {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== 'Invoice') throw new Error('Soubor není faktura ve formátu ISDOC.');
  const root = doc.documentElement;
  // Jmenné prostory se v ISDOC liší podle verze, hledá se proto podle místního názvu prvku.
  const child = (el: Element | null | undefined, ...path: string[]) => {
    let cur: Element | null | undefined = el;
    for (const name of path) cur = cur ? Array.from(cur.children).find(c => c.localName === name) : null;
    return cur || null;
  };
  const value = (el: Element | null | undefined, ...path: string[]) => child(el, ...path)?.textContent?.trim() || '';
  const party = child(root, 'AccountingSupplierParty', 'Party');
  const lines = Array.from(child(root, 'InvoiceLines')?.children || []).filter(c => c.localName === 'InvoiceLine');
  return {
    supplier: value(party, 'PartyName', 'Name'),
    number: value(root, 'ID'),
    date: value(root, 'IssueDate'),
    due: value(root, 'PaymentMeans', 'Payment', 'Details', 'PaymentDueDate') || value(root, 'PaymentDueDate'),
    totalKc: kc(value(root, 'LegalMonetaryTotal', 'TaxInclusiveAmount') || value(root, 'LegalMonetaryTotal', 'PayableAmount')),
    items: lines.map(l => {
      const qty = Number(value(l, 'InvoicedQuantity')) || 1, unit = value(l, 'UnitPriceTaxInclusive') || value(l, 'UnitPrice');
      const lineTotal = value(l, 'LineExtensionAmountTaxInclusive');
      return {name: value(l, 'Item', 'Description') || value(l, 'Note') || 'Položka', qty: Math.max(1, Math.round(qty)), costKc: kc(unit || (lineTotal ? String(Number(lineTotal) / qty) : ''))};
    }),
  };
}
