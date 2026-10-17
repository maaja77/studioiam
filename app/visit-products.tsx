'use client';
// Přípravky použité při návštěvě: řádky s názvem (nabídka ze Skladu a dříve zapsaných) a nepovinným množstvím.
import {useId, useState} from 'react';
import {Copy, Plus, X} from 'lucide-react';

export type VisitItem = {productId: string | null; name: string; amount: string};
export type CatalogItem = {name: string; productId: string | null};

/** Starý volný text přípravků rozdělí na jednotlivé položky (po řádcích, čárkách a střednících). */
export const splitProducts = (text: string): VisitItem[] =>
  text.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean).slice(0, 40).map(name => ({productId: null, name: name.slice(0, 150), amount: ''}));

export default function VisitProducts({initial, legacy, previous, catalog}: {initial: VisitItem[]; legacy: string; previous: VisitItem[]; catalog: CatalogItem[]}) {
  const [rows, setRows] = useState<VisitItem[]>(() => initial.length ? initial : legacy ? splitProducts(legacy) : [{productId: null, name: '', amount: ''}]);
  const listId = useId();
  const fold = (s: string) => s.trim().toLocaleLowerCase('cs');
  const set = (i: number, patch: Partial<VisitItem>) => setRows(r => r.map((x, j) => j === i ? {...x, ...patch} : x));
  // Název vybraný z nabídky se propojí s produktem ve Skladu; vlastní název zůstane bez vazby.
  const rename = (i: number, name: string) => set(i, {name, productId: catalog.find(c => fold(c.name) === fold(name))?.productId || null});
  const filled = rows.filter(r => r.name.trim());
  return <fieldset className="visit-products">
    <legend>Použité přípravky</legend>
    <input type="hidden" name="items" value={JSON.stringify(filled.map(r => ({...r, name: r.name.trim(), amount: r.amount.trim()})))}/>
    <datalist id={listId}>{catalog.map(c => <option key={c.name} value={c.name}/>)}</datalist>
    {rows.map((r, i) => <div className="visit-product-row" key={i}>
      <input aria-label={`Přípravek ${i + 1}`} list={listId} value={r.name} maxLength={150} placeholder="Název přípravku" onChange={e => rename(i, e.target.value)}/>
      <input aria-label={`Množství přípravku ${i + 1}`} className="amount" value={r.amount} maxLength={60} placeholder="Množství" onChange={e => set(i, {amount: e.target.value})}/>
      <button type="button" aria-label={`Odebrat přípravek ${i + 1}`} onClick={() => setRows(x => x.length > 1 ? x.filter((_, j) => j !== i) : [{productId: null, name: '', amount: ''}])}><X size={16}/></button>
    </div>)}
    <div className="visit-product-actions">
      <button type="button" className="secondary" disabled={rows.length >= 40} onClick={() => setRows(x => [...x, {productId: null, name: '', amount: ''}])}><Plus size={15}/> Další přípravek</button>
      {previous.length > 0 && <button type="button" className="secondary" title={previous.map(p => p.name).join(', ')}
        onClick={() => setRows(x => { const have = x.filter(r => r.name.trim()); return [...have, ...previous.filter(p => !have.some(h => fold(h.name) === fold(p.name)))].slice(0, 40); })}><Copy size={15}/> Jako minule</button>}
    </div>
    <small>Vyberte z nabídky (produkty ze Skladu a dříve zapsané) nebo napište vlastní název. Množství je nepovinné, např. 2 ml nebo 1 ampule.</small>
  </fieldset>;
}

/** Přípravky v kartě klientky: položky se zapsaným množstvím, u starších návštěv původní text. */
export function VisitProductList({items, legacy}: {items: VisitItem[]; legacy: string}) {
  if (!items.length) return legacy ? <p>{legacy}</p> : null;
  return <ul className="visit-product-list">{items.map((x, i) => <li key={i}>{x.name}{x.amount && <small> · {x.amount}</small>}</li>)}</ul>;
}
