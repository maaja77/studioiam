// Spotřební materiál: kolik kusů se spotřebuje na jednu klientku u každého ošetření a kolik to stojí.
// Nákupní cena spotřebního materiálu je za balení (pack_size kusů); sklad se počítá v kusech.
export const ALL_SERVICES = '*';
export type SupplyRow = {serviceKey: string; productId: string; qty: number};
export type SupplyProduct = {id: string; name: string; costCents: number | null; packSize: number | null};

/** Cena jednoho kusu v haléřích (může být desetinná, třeba tampon za 0,35 Kč). */
export const pieceCost = (p: Pick<SupplyProduct, 'costCents' | 'packSize'>) => p.costCents == null ? null : p.costCents / Math.max(1, p.packSize || 1);

/** Spotřeba pro ošetření: výchozí spotřeba každého ošetření, kterou přepíše nastavení u konkrétního ošetření (i nulou). */
export function recipeFor(serviceId: string | null, rows: SupplyRow[]) {
  const out = new Map<string, number>();
  for (const r of rows) if (r.serviceKey === ALL_SERVICES) out.set(r.productId, r.qty);
  if (serviceId) for (const r of rows) if (r.serviceKey === serviceId) out.set(r.productId, r.qty);
  for (const [k, v] of out) if (v <= 0) out.delete(k);
  return out;
}

/** Cena materiálu na jednu klientku; missing = materiál bez nákupní ceny (cena je pak neúplná). */
export function recipeCost(recipe: Map<string, number>, products: SupplyProduct[]) {
  let cents = 0, missing = 0;
  for (const [id, qty] of recipe) { const p = products.find(x => x.id === id), c = p ? pieceCost(p) : null; if (c == null) missing++; else cents += c * qty; }
  return {cents, missing};
}

/** Běžný spotřební materiál kosmetického salonu s návrhem spotřeby na klientku; ošetření se vybírají podle názvu. */
export const STARTER_SUPPLIES: {name: string; pack: number; perClient: number; only?: RegExp}[] = [
  {name: 'Odličovací tampony', pack: 100, perClient: 4},
  {name: 'Jednorázové kapesníky', pack: 100, perClient: 2},
  {name: 'Vatové tyčinky', pack: 200, perClient: 2},
  {name: 'Jednorázové ručníky', pack: 50, perClient: 1},
  {name: 'Vyšetřovací papír 50×50', pack: 100, perClient: 1},
  {name: 'Perlan přířezy', pack: 100, perClient: 2},
  {name: 'Jednorázové rukavice nitrilové (ks)', pack: 100, perClient: 2, only: /jehli[cč]k/i},
  {name: 'Jednorázové igelitové rukavice (ks)', pack: 100, perClient: 2, only: /z[aá]bal/i},
];
