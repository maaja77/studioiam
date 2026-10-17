'use client';
// Spotřeba na ošetření: kolik spotřebního materiálu se použije na jednu klientku a kolik to stojí.
import {useState} from 'react';
import {Pencil, X} from 'lucide-react';
import {formatRevenue} from '../lib/revenue';
import type {StockProduct} from '../lib/stock';
import {ALL_SERVICES, pieceCost, recipeCost, recipeFor, type SupplyRow} from '../lib/supplies';

export type SupplyData = {services: {id: string; name: string; category: string}[]; supplies: SupplyRow[]; used30: Record<string, number>; treated30: number};
const money = (cents: number) => formatRevenue(Math.round(cents));

async function post(action: string, data: Record<string, unknown>) {
  const r = await fetch('/api/stock', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, data})});
  const d = await r.json() as {error?: string};
  if (!r.ok) throw new Error(d.error || 'Spotřebu se nepodařilo uložit.');
}

export default function SupplyRecipes({products, data, onOpenSupplies, onSaved}: {products: StockProduct[]; data: SupplyData; onOpenSupplies: () => void; onSaved: () => void}) {
  const supplies = products.filter(p => p.kind === 'supply'), [open, setOpen] = useState(''), [error, setError] = useState(''), [status, setStatus] = useState('');
  if (!supplies.length) return <div className="setup-hint" role="note"><span>Nejdřív založte spotřební materiál a pak tady nastavíte, kolik ho spotřebujete na jednu klientku.</span><button className="secondary" onClick={onOpenSupplies}>Spotřební materiál</button></div>;

  const base = recipeCost(recipeFor(null, data.supplies), supplies);
  const usedCents = Object.entries(data.used30).reduce((s, [id, qty]) => { const p = supplies.find(x => x.id === id), c = p ? pieceCost(p) : null; return s + (c || 0) * qty; }, 0);
  const groups = new Map<string, SupplyData['services']>();
  for (const s of data.services) groups.set(s.category || 'Ostatní', [...(groups.get(s.category || 'Ostatní') || []), s]);
  const diffText = (id: string) => {
    const own = data.supplies.filter(r => r.serviceKey === id), dflt = recipeFor(null, data.supplies);
    return own.map(r => { const name = supplies.find(p => p.id === r.productId)?.name || ''; return r.qty === 0 ? `bez: ${name}` : dflt.has(r.productId) ? `${name} ${r.qty} ks` : `+ ${name} ${r.qty} ks`; }).join(', ');
  };
  async function save(serviceKey: string, items: {productId: string; qty: number}[]) {
    setError(''); setStatus('');
    try { await post('recipe', {serviceKey, items}); setOpen(''); setStatus('Spotřeba je uložená.'); onSaved(); } catch (e) { setError((e as Error).message); }
  }
  return <div className="supply-recipes">
    <section className="stat-tiles" aria-label="Materiál na klientku">
      <div className="stat-tile main"><span>Materiál na 1 klientku (běžné ošetření)</span><strong>{money(base.cents)}</strong><small>{base.missing ? `bez ceny: ${base.missing} ${base.missing === 1 ? 'položka' : 'položky'}, doplňte ji ve Spotřebním materiálu` : 'podle výchozí spotřeby a nákupních cen'}</small></div>
      <div className="stat-tile"><span>Za posledních 30 dní</span><strong>{money(usedCents)}</strong><small>{data.treated30 ? `${data.treated30} ošetření podle účtenek` : 'zatím žádná ošetření s odpisem materiálu'}</small></div>
      <div className="stat-tile"><span>Skutečně na klientku</span><strong>{data.treated30 ? money(usedCents / data.treated30) : '–'}</strong><small>průměr za 30 dní</small></div>
    </section>
    {error && <div className="error" role="alert">{error}</div>}
    {status && <p className="notice" role="status">{status}</p>}
    <section className="panel">
      <div className="panel-heading"><div><h2>Každé ošetření</h2><p className="muted-inline">Výchozí spotřeba na jednu klientku. U jednotlivých ošetření ji jde upravit níž.</p></div>
        {open !== ALL_SERVICES && <button className="secondary" onClick={() => { setOpen(ALL_SERVICES); setStatus(''); }}><Pencil size={15}/> Upravit</button>}</div>
      {open === ALL_SERVICES ? <RecipeForm supplies={supplies} recipe={recipeFor(null, data.supplies)} onCancel={() => setOpen('')} onSave={items => save(ALL_SERVICES, items)}/> : <RecipeList supplies={supplies} recipe={recipeFor(null, data.supplies)}/>}
    </section>
    <section className="panel"><h2>Podle ošetření</h2>
      {!data.services.length ? <p className="muted-inline">V ceníku zatím nejsou žádná ošetření.</p> : [...groups].map(([category, list]) => <div key={category} className="recipe-group"><h3>{category}</h3><ul className="recipe-services">
        {list.map(s => { const recipe = recipeFor(s.id, data.supplies), cost = recipeCost(recipe, supplies), diff = diffText(s.id); return <li key={s.id}>
          <div className="recipe-service"><span><b>{s.name}</b><small>{diff || 'jako každé ošetření'}</small></span><span className="recipe-cost">{money(cost.cents)}{cost.missing > 0 && <small>neúplné</small>}</span>
            {open !== s.id && <button className="icon-btn" aria-label={'Upravit spotřebu ' + s.name} title="Upravit" onClick={() => { setOpen(s.id); setStatus(''); }}><Pencil size={15}/></button>}</div>
          {open === s.id && <RecipeForm supplies={supplies} recipe={recipe} onCancel={() => setOpen('')} onSave={items => save(s.id, items)}/>}
        </li>; })}</ul></div>)}
      <p className="muted-inline">Materiál se ze skladu odečte při vystavení účtenky s tímto ošetřením. Storno účtenky ho vrátí.</p>
    </section>
  </div>;
}

function RecipeList({supplies, recipe}: {supplies: StockProduct[]; recipe: Map<string, number>}) {
  if (!recipe.size) return <p className="muted-inline">Zatím nic. Klikněte na Upravit a zadejte, kolik kusů čeho použijete.</p>;
  return <table className="stats-table recipe-table"><thead><tr><th>Materiál</th><th className="num">Ks</th><th className="num">Cena</th></tr></thead><tbody>
    {supplies.filter(p => recipe.has(p.id)).map(p => { const c = pieceCost(p), q = recipe.get(p.id)!; return <tr key={p.id}><td>{p.name}</td><td className="num">{q}</td><td className="num">{c == null ? 'bez ceny' : money(c * q)}</td></tr>; })}
  </tbody></table>;
}

function RecipeForm({supplies, recipe, onSave, onCancel}: {supplies: StockProduct[]; recipe: Map<string, number>; onSave: (items: {productId: string; qty: number}[]) => void; onCancel: () => void}) {
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(supplies.map(p => [p.id, String(recipe.get(p.id) || 0)])));
  const total = supplies.reduce((s, p) => s + (pieceCost(p) || 0) * (Number(qty[p.id]) || 0), 0);
  return <form className="recipe-form" onSubmit={e => { e.preventDefault(); onSave(supplies.map(p => ({productId: p.id, qty: Number(qty[p.id]) || 0}))); }}>
    <table className="stats-table recipe-table"><thead><tr><th>Materiál</th><th className="num">Ks na klientku</th><th className="num">Cena</th></tr></thead><tbody>
      {supplies.map(p => { const c = pieceCost(p), q = Number(qty[p.id]) || 0; return <tr key={p.id} className={q ? '' : 'unused'}><td>{p.name}<small>{c == null ? ' · bez ceny' : ` · ${money(c)} za kus`}</small></td>
        <td className="num"><input type="number" min={0} max={999} aria-label={'Kusů ' + p.name} value={qty[p.id]} onChange={e => setQty(x => ({...x, [p.id]: e.target.value}))}/></td><td className="num">{q && c != null ? money(c * q) : ''}</td></tr>; })}
      <tr className="total"><td colSpan={2}>Celkem na klientku</td><td className="num">{money(total)}</td></tr>
    </tbody></table>
    <div className="form-actions"><button type="button" className="secondary" onClick={onCancel}><X size={15}/> Zrušit</button><button className="primary">Uložit spotřebu</button></div>
  </form>;
}
