'use client';
// Sklad: produkty k prodeji, stav zásob, naskladnění, spotřeba v salonu, inventura a historie pohybů.
import {useEffect, useState} from 'react';
import {AlertTriangle, History, PackagePlus, Pencil, Plus, Search, Trash2, X} from 'lucide-react';
import {formatRevenue} from '../lib/revenue';
import {isLow, type StockMove, type StockProduct} from '../lib/stock';

type Action = {id: string; kind: 'delivery' | 'use' | 'count' | 'history'};
const KIND_LABEL: Record<string, string> = {sale: 'Prodej', delivery: 'Naskladnění', use: 'Spotřeba', count: 'Inventura', start: 'Počáteční stav', return: 'Storno prodeje'};
const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pcs = (n: number) => `${n} ks`;
const moneyInput = (cents: number | null | undefined) => cents != null ? String(cents / 100).replace('.', ',') : '';

async function post(action: string, data: Record<string, unknown>) {
  const r = await fetch('/api/stock', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, data})});
  const d = await r.json() as {error?: string};
  if (!r.ok) throw new Error(d.error || 'Změnu se nepodařilo uložit.');
  return d;
}

/** Na kolik týdnů vystačí zásoba podle prodejů za posledních 90 dní. */
function lastsText(p: StockProduct, sold: number) {
  if (p.stock === null || p.stock <= 0 || sold <= 0) return '';
  const weeks = p.stock / (sold / 13);
  return weeks > 26 ? 'vystačí na víc než půl roku' : weeks >= 2 ? `vystačí asi na ${Math.round(weeks)} ${Math.round(weeks) <= 4 ? 'týdny' : 'týdnů'}` : 'vystačí asi na týden';
}

export default function Stock({onChanged}: {onChanged?: () => void}) {
  const [products, setProducts] = useState<StockProduct[] | null>(null), [sold, setSold] = useState<Record<string, number>>({});
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [query, setQuery] = useState(''), [onlyLow, setOnlyLow] = useState(false);
  const [editing, setEditing] = useState<Partial<StockProduct> | null>(null), [action, setAction] = useState<Action | null>(null);
  async function load() {
    try {
      const r = await fetch('/api/stock', {cache: 'no-store'}); const d = await r.json() as {products?: StockProduct[]; sold90?: Record<string, number>; error?: string};
      if (!r.ok || !d.products) throw new Error(d.error); setProducts(d.products); setSold(d.sold90 || {});
    } catch (e) { setError((e as Error).message || 'Sklad se nepodařilo načíst.'); }
  }
  useEffect(() => { load(); }, []);
  async function run(name: string, data: Record<string, unknown>) {
    setBusy(true); setError('');
    try { await post(name, data); setEditing(null); setAction(null); await load(); onChanged?.(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!products) return error ? <p className="error" role="alert">{error}</p> : <p className="muted">Načítám…</p>;

  const tracked = products.filter(p => p.stock !== null), low = products.filter(isLow);
  const value = tracked.reduce((s, p) => s + Math.max(0, p.stock!) * p.priceCents, 0), costValue = tracked.every(p => p.costCents != null || !p.stock) ? tracked.reduce((s, p) => s + Math.max(0, p.stock!) * (p.costCents || 0), 0) : null;
  const q = fold(query.trim()), shown = products.filter(p => (!q || fold(p.name).includes(q)) && (!onlyLow || isLow(p)));

  return <div className="stock">
    <div className="heading"><div><p className="eyebrow">PRODUKTY</p><h1>Sklad</h1><p>Produkty k prodeji a jejich zásoba. Prodej na účtence se ze skladu odečte sám.</p></div>
      <button className="primary" onClick={() => { setAction(null); setEditing({active: 1, stock: null}); }}><Plus size={18}/> Přidat produkt</button></div>
    {error && <div className="error" role="alert">{error}</div>}
    {low.length > 0 && <div className="setup-hint" role="note"><span><AlertTriangle size={16}/> Dochází: {low.map(p => p.name).join(', ')}.</span>{!onlyLow && <button className="secondary" onClick={() => setOnlyLow(true)}>Zobrazit</button>}</div>}
    {tracked.length > 0 && <section className="stat-tiles" aria-label="Souhrn skladu">
      <div className="stat-tile main"><span>Na skladě</span><strong>{tracked.reduce((s, p) => s + Math.max(0, p.stock!), 0)} ks</strong><small>{tracked.length} {tracked.length === 1 ? 'produkt' : tracked.length < 5 ? 'produkty' : 'produktů'} se sledovaným skladem</small></div>
      <div className="stat-tile"><span>Hodnota v prodejních cenách</span><strong>{formatRevenue(value)}</strong><small>{costValue !== null ? `nákupní cena ${formatRevenue(costValue)}` : 'doplňte nákupní ceny, uvidíte i nákupní hodnotu'}</small></div>
      <div className="stat-tile"><span>Dochází</span><strong>{low.length}</strong><small>na minimu nebo pod ním</small></div>
    </section>}
    {products.length > 0 && <div className="voucher-tools">
      <span className="segmented-mini" role="radiogroup" aria-label="Zobrazit">{([[false, 'Vše'], [true, `Dochází (${low.length})`]] as const).map(([k, l]) => <button type="button" key={String(k)} role="radio" aria-checked={onlyLow === k} className={onlyLow === k ? 'active' : ''} onClick={() => setOnlyLow(k)}>{l}</button>)}</span>
      {products.length > 6 && <label className="search"><Search size={16}/><input aria-label="Hledat produkt" placeholder="Hledat produkt…" value={query} onChange={e => setQuery(e.target.value)}/></label>}
    </div>}
    {editing && <ProductForm product={editing} busy={busy} sort={products.length} onCancel={() => setEditing(null)} onSave={data => run('save', data)}/>}
    <div className="panel"><ul className="stock-list">{!products.length ? <li className="muted">Zatím žádné produkty. Přidejte kosmetiku, kterou prodáváte, a na účtence ji pak jen vyberete.</li> : !shown.length ? <li className="muted">Nic tu není.</li>
    : shown.map(p => { const lowNow = isLow(p), open = action?.id === p.id ? action.kind : null; return <li key={p.id} className={p.active ? '' : 'inactive'}>
      <div className="stock-row">
        <div className="stock-name"><b>{p.name}</b><small>{formatRevenue(p.priceCents)}{p.costCents != null && ` · nákup ${formatRevenue(p.costCents)}`}{!p.active && ' · skryté na účtence'}{p.stock !== null && lastsText(p, sold[p.id] || 0) && ` · ${lastsText(p, sold[p.id] || 0)}`}</small></div>
        {p.stock !== null ? <div className={'stock-count' + (lowNow ? ' low' : '')}><strong>{pcs(p.stock)}</strong>{lowNow ? <small><AlertTriangle size={13}/> dochází{p.minStock ? ` (min. ${p.minStock})` : ''}</small> : p.minStock ? <small>min. {p.minStock}</small> : null}</div>
          : <div className="stock-count off"><small>sklad nesledován</small></div>}
        <div className="stock-actions">
          {p.stock !== null && <>
            <button className="secondary" onClick={() => setAction(open === 'delivery' ? null : {id: p.id, kind: 'delivery'})}><PackagePlus size={15}/> Naskladnit</button>
            <button className="secondary" onClick={() => setAction(open === 'use' ? null : {id: p.id, kind: 'use'})}>Spotřeba</button>
            <button className="secondary" onClick={() => setAction(open === 'count' ? null : {id: p.id, kind: 'count'})}>Inventura</button>
            <button className="icon-btn" aria-label={'Historie ' + p.name} title="Historie" onClick={() => setAction(open === 'history' ? null : {id: p.id, kind: 'history'})}><History size={16}/></button></>}
          <button className="icon-btn" aria-label={'Upravit ' + p.name} title="Upravit" onClick={() => { setAction(null); setEditing(p); }}><Pencil size={16}/></button>
          <button className="icon-btn" aria-label={'Smazat ' + p.name} title="Smazat" disabled={busy} onClick={() => { if (window.confirm(`Smazat produkt ${p.name} i jeho historii skladu? Vystavené účtenky zůstanou.`)) run('delete', {id: p.id}); }}><Trash2 size={16}/></button>
        </div>
      </div>
      {open && open !== 'history' && <MoveForm product={p} kind={open} busy={busy} onCancel={() => setAction(null)} onSave={data => run('move', {...data, id: p.id, kind: open})}/>}
      {open === 'history' && <Moves productId={p.id} onClose={() => setAction(null)}/>}
    </li>; })}</ul></div>
  </div>;
}

function ProductForm({product, busy, sort, onSave, onCancel}: {product: Partial<StockProduct>; busy: boolean; sort: number; onSave: (data: Record<string, unknown>) => void; onCancel: () => void}) {
  const [track, setTrack] = useState(product.stock != null || !product.id), started = product.stock != null;
  return <form className="panel service-form stock-form" ref={el => el?.scrollIntoView({block: 'nearest', behavior: 'smooth'})} onSubmit={e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget));
    onSave({id: product.id, name: f.name, price: f.price, cost: f.cost, active: f.active === 'on', track, stock: f.stock, minStock: f.minStock, sort: product.sort ?? sort}); }}>
    <div className="panel-heading"><h2>{product.id ? 'Upravit produkt' : 'Nový produkt'}</h2><button type="button" className="icon-btn" aria-label="Zavřít" onClick={onCancel}><X size={18}/></button></div>
    <label className="field"><span>Název produktu</span><input name="name" required maxLength={150} defaultValue={product.name}/></label>
    <div className="field-grid"><label className="field"><span>Prodejní cena (Kč)</span><input name="price" inputMode="decimal" required defaultValue={moneyInput(product.priceCents)}/></label>
      <label className="field"><span>Nákupní cena za kus (Kč, nepovinné)</span><input name="cost" inputMode="decimal" defaultValue={moneyInput(product.costCents)}/></label></div>
    <label className="check"><input type="checkbox" checked={track} onChange={e => setTrack(e.target.checked)}/> Sledovat sklad (prodej na účtence odečte kusy)</label>
    {track && <div className="field-grid">
      {!started && <label className="field"><span>Kolik kusů máte teď</span><input name="stock" type="number" min={0} max={99999} required defaultValue={0}/></label>}
      <label className="field"><span>Upozornit, když zbude (ks)</span><input name="minStock" type="number" min={0} max={9999} defaultValue={product.minStock ?? 1}/></label>
    </div>}
    {!track && started && <p className="setup-hint inline" role="note">Po vypnutí se smaže historie skladu tohoto produktu.</p>}
    <label className="check"><input type="checkbox" name="active" defaultChecked={product.active !== 0}/> Nabízet na účtence</label>
    <div className="form-actions"><button type="button" className="secondary" onClick={onCancel}>Zrušit</button><button className="primary" disabled={busy}>Uložit produkt</button></div>
  </form>;
}

function MoveForm({product, kind, busy, onSave, onCancel}: {product: StockProduct; kind: 'delivery' | 'use' | 'count'; busy: boolean; onSave: (data: Record<string, unknown>) => void; onCancel: () => void}) {
  const [qty, setQty] = useState(kind === 'count' ? String(Math.max(0, product.stock ?? 0)) : ''), [cost, setCost] = useState(moneyInput(product.costCents)), [note, setNote] = useState('');
  const n = Number(qty), after = kind === 'delivery' ? (product.stock ?? 0) + n : kind === 'use' ? (product.stock ?? 0) - n : n;
  return <form className="stock-move" onSubmit={e => { e.preventDefault(); onSave({qty, cost: kind === 'delivery' ? cost : '', note}); }}>
    <div className="field-grid three">
      <label className="field"><span>{kind === 'delivery' ? 'Přišlo kusů' : kind === 'use' ? 'Použito v salonu (ks)' : 'Skutečně na skladě (ks)'}</span><input type="number" min={kind === 'count' ? 0 : 1} max={99999} required autoFocus value={qty} onChange={e => setQty(e.target.value)}/></label>
      {kind === 'delivery' && <label className="field"><span>Nákupní cena za kus (Kč)</span><input inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder="Nepovinné"/></label>}
      <label className="field"><span>Poznámka</span><input maxLength={200} value={note} onChange={e => setNote(e.target.value)} placeholder={kind === 'delivery' ? 'Např. faktura, dodavatel' : kind === 'use' ? 'Např. tester, ošetření' : 'Nepovinné'}/></label>
    </div>
    {qty !== '' && Number.isInteger(n) && <p className="muted-inline">Na skladě bude {pcs(after)}{kind === 'count' && after !== product.stock ? ` (rozdíl ${after - (product.stock ?? 0) > 0 ? '+' : ''}${after - (product.stock ?? 0)} ks)` : ''}.</p>}
    <div className="form-actions"><button type="button" className="secondary" onClick={onCancel}>Zrušit</button><button className="primary" disabled={busy}>{kind === 'delivery' ? 'Naskladnit' : kind === 'use' ? 'Odepsat' : 'Uložit stav'}</button></div>
  </form>;
}

function Moves({productId, onClose}: {productId: string; onClose: () => void}) {
  const [moves, setMoves] = useState<StockMove[] | null>(null), [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/stock?productId=' + encodeURIComponent(productId), {cache: 'no-store'}).then(async r => { const d = await r.json() as {moves?: StockMove[]; error?: string}; if (!r.ok || !d.moves) throw new Error(d.error); setMoves(d.moves); })
      .catch(e => setError((e as Error).message || 'Historii se nepodařilo načíst.'));
  }, [productId]);
  return <div className="stock-history">
    <div className="panel-heading"><h3>Historie skladu</h3><button type="button" className="link-button" onClick={onClose}>Skrýt</button></div>
    {error ? <p className="error" role="alert">{error}</p> : !moves ? <p className="muted-inline">Načítám…</p> : !moves.length ? <p className="muted-inline">Zatím žádné pohyby.</p>
    : <table><thead><tr><th>Kdy</th><th>Co</th><th>Změna</th><th>Zůstalo</th></tr></thead><tbody>{moves.map(m => <tr key={m.id}>
      <td>{new Date(m.date.length > 10 ? m.date + ':00' : m.date + 'T12:00:00').toLocaleDateString('cs-CZ', {day: 'numeric', month: 'numeric', year: 'numeric'})}</td>
      <td>{KIND_LABEL[m.kind] || m.kind}{m.note && m.note !== KIND_LABEL[m.kind] && <small> {m.note}</small>}</td>
      <td className={m.delta < 0 ? 'minus' : 'plus'}>{m.delta > 0 ? '+' : ''}{m.delta}</td><td>{m.stockAfter ?? ''}</td></tr>)}</tbody></table>}
  </div>;
}
