'use client';
// Faktury za zboží: zápis faktury od dodavatele, uložení PDF nebo fotky a naskladnění položek do Skladu.
import {useEffect, useState} from 'react';
import {Check, ChevronLeft, FileText, Paperclip, Plus, Trash2, Upload, X} from 'lucide-react';
import {formatRevenue, parseRevenue} from '../lib/revenue';
import {parseIsdoc} from '../lib/isdoc';
import type {StockProduct} from '../lib/stock';
import type {Invoice} from './api/invoices/route';

type Row = {key: string; product: string; name: string; qty: string; cost: string; price: string}; // product: id, 'new' nebo '' (jen zapsat)
const NEW = 'new';
const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const dateText = (s: string) => s.split('-').reverse().map(Number).join('. ');
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const moneyInput = (cents: number | null | undefined) => cents != null ? String(cents / 100).replace('.', ',') : '';
const cents = (v: string) => { try { return parseRevenue(v) ?? 0; } catch { return NaN; } };
const emptyRow = (): Row => ({key: crypto.randomUUID(), product: '', name: '', qty: '1', cost: '', price: ''});
const itemsText = (n: number) => `${n} ${n === 1 ? 'položka' : n >= 2 && n <= 4 ? 'položky' : 'položek'}`;

/** Produkt ze Skladu se stejným (nebo obsaženým) názvem, ať se položky z ISDOC nemusí párovat ručně. */
function matchProduct(name: string, products: StockProduct[]) {
  const n = fold(name);
  return products.find(p => fold(p.name) === n) || products.find(p => fold(p.name).length > 3 && n.includes(fold(p.name)));
}

async function send(action: string, data: Record<string, unknown>, file?: File | null) {
  let r: Response;
  if (file) { const form = new FormData(); form.append('data', JSON.stringify({action, data})); form.append('file', file); r = await fetch('/api/invoices', {method: 'POST', body: form}); }
  else r = await fetch('/api/invoices', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, data})});
  const d = await r.json() as {error?: string; stocked?: number; returned?: number};
  if (!r.ok) throw new Error(d.error || 'Fakturu se nepodařilo uložit.');
  return d;
}

export default function Invoices({products, onBack, onChanged}: {products: StockProduct[]; onBack: () => void; onChanged: () => void}) {
  const [year, setYear] = useState(today().slice(0, 4)), [data, setData] = useState<{invoices: Invoice[]; suppliers: string[]} | null>(null);
  const [error, setError] = useState(''), [status, setStatus] = useState(''), [busy, setBusy] = useState(false), [editing, setEditing] = useState<Invoice | 'new' | null>(null), [open, setOpen] = useState('');
  async function load() {
    try { const r = await fetch('/api/invoices?year=' + year, {cache: 'no-store'}); const d = await r.json() as {invoices?: Invoice[]; suppliers?: string[]; error?: string}; if (!r.ok || !d.invoices) throw new Error(d.error); setData({invoices: d.invoices, suppliers: d.suppliers || []}); }
    catch (e) { setError((e as Error).message || 'Faktury se nepodařilo načíst.'); }
  }
  useEffect(() => { load(); }, [year]); // eslint-disable-line react-hooks/exhaustive-deps
  async function run(fn: () => Promise<string>) {
    setBusy(true); setError(''); setStatus('');
    try { setStatus(await fn()); await load(); onChanged(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function showFile(id: string) {
    // Soubor se načte přes fetch, aby šel otevřít i v náhledu aplikace.
    const w = window.open('', '_blank');
    try { const r = await fetch('/api/invoices?file=' + id); if (!r.ok) throw new Error('Soubor faktury není dostupný.'); const url = URL.createObjectURL(await r.blob()); if (w) w.location.href = url; else location.href = url; }
    catch (e) { w?.close(); setError((e as Error).message); }
  }
  const list = data?.invoices || [], sum = list.reduce((s, i) => s + i.totalCents, 0), unpaid = list.filter(i => !i.paid);
  return <div className="invoices">
    <button className="pb-back" onClick={onBack}><ChevronLeft size={16}/> Sklad</button>
    <div className="heading"><div><p className="eyebrow">SKLAD</p><h1>Faktury za zboží</h1><p>Zapište fakturu od dodavatele a položky se rovnou naskladní. Fakturu si můžete uložit jako PDF nebo fotku.</p></div>
      {!editing && <button className="primary" onClick={() => { setStatus(''); setEditing('new'); }}><Plus size={18}/> Nová faktura</button>}</div>
    {error && <div className="error" role="alert">{error}</div>}
    {status && <p className="notice" role="status">{status}</p>}
    {editing && <InvoiceForm invoice={editing === 'new' ? null : editing} products={products} suppliers={data?.suppliers || []} busy={busy} onCancel={() => setEditing(null)}
      onSave={(payload, file) => run(async () => { const d = await send('save', payload, file); setEditing(null); return editing === 'new' ? (d.stocked ? `Faktura je uložená. Naskladněné položky: ${d.stocked}.` : 'Faktura je uložená.') : 'Změny jsou uložené.'; })}/>}
    <div className="voucher-tools"><label className="field inline-field"><span>Rok</span><select value={year} onChange={e => setYear(e.target.value)}>{Array.from({length: 5}, (_, i) => String(Number(today().slice(0, 4)) - i)).map(y => <option key={y}>{y}</option>)}</select></label>
      {list.length > 0 && <span className="muted-inline">{list.length} faktur za {formatRevenue(sum)}{unpaid.length > 0 && `, nezaplacené: ${unpaid.length} (${formatRevenue(unpaid.reduce((s, i) => s + i.totalCents, 0))})`}</span>}</div>
    <div className="panel"><ul className="invoice-list">{!data ? <li className="muted">Načítám…</li> : !list.length ? <li className="muted">V roce {year} zatím žádné faktury.</li> : list.map(inv => <li key={inv.id}>
      <div className="invoice-row">
        <button type="button" className="invoice-main" aria-expanded={open === inv.id} onClick={() => setOpen(open === inv.id ? '' : inv.id)}>
          <span><b>{inv.supplier}</b><small>{dateText(inv.date)}{inv.number && ` · č. ${inv.number}`} · {itemsText(inv.items.length)}{inv.due && !inv.paid && ` · splatnost ${dateText(inv.due)}`}</small></span>
          <span className="invoice-amount"><b>{formatRevenue(inv.totalCents)}</b><small className={inv.paid ? 'ok' : inv.due && inv.due < today() ? 'late' : ''}>{inv.paid ? 'zaplaceno' : inv.due && inv.due < today() ? 'po splatnosti' : 'nezaplaceno'}</small></span>
        </button>
        <div className="invoice-actions">
          {inv.fileMime && <button type="button" className="icon-btn" aria-label={'Soubor faktury ' + inv.supplier} title="Soubor faktury" onClick={() => showFile(inv.id)}><Paperclip size={16}/></button>}
          <button type="button" className="secondary" disabled={busy} onClick={() => run(async () => { await send('paid', {id: inv.id, paid: !inv.paid}); return inv.paid ? 'Faktura je označená jako nezaplacená.' : 'Faktura je označená jako zaplacená.'; })}>{inv.paid ? 'Nezaplaceno' : <><Check size={15}/> Zaplaceno</>}</button>
        </div>
      </div>
      {open === inv.id && <div className="invoice-detail">
        {!inv.items.length ? <p className="muted-inline">Bez položek.</p> : <table className="stats-table"><thead><tr><th>Položka</th><th className="num">Ks</th><th className="num">Za kus</th><th>Sklad</th></tr></thead>
          <tbody>{inv.items.map(i => <tr key={i.id}><td>{i.name}</td><td className="num">{i.qty}</td><td className="num">{i.unitCostCents != null ? formatRevenue(i.unitCostCents) : ''}</td><td>{i.stocked ? 'naskladněno' : i.productId ? 'sklad se nesleduje' : 'jen zapsáno'}</td></tr>)}</tbody></table>}
        {inv.note && <p className="muted-inline">{inv.note}</p>}
        <div className="form-actions">
          <button type="button" className="link-button danger" disabled={busy} onClick={() => { if (window.confirm(`Smazat fakturu ${inv.supplier}${inv.number ? ' č. ' + inv.number : ''}? Naskladněné kusy se ze skladu zase odečtou.`)) run(async () => { const d = await send('delete', {id: inv.id}); return d.returned ? 'Faktura je smazaná a naskladnění vrácené.' : 'Faktura je smazaná.'; }); }}><Trash2 size={15}/> Smazat</button>
          <button type="button" className="secondary" onClick={() => { setStatus(''); setEditing(inv); }}>Upravit</button>
        </div>
      </div>}
    </li>)}</ul></div>
  </div>;
}

function InvoiceForm({invoice, products, suppliers, busy, onSave, onCancel}: {invoice: Invoice | null; products: StockProduct[]; suppliers: string[]; busy: boolean; onSave: (data: Record<string, unknown>, file: File | null) => void; onCancel: () => void}) {
  const [head, setHead] = useState({supplier: invoice?.supplier || '', number: invoice?.number || '', date: invoice?.date || today(), due: invoice?.due || '', total: moneyInput(invoice?.totalCents), paid: !!invoice?.paid, note: invoice?.note || ''});
  const [rows, setRows] = useState<Row[]>(invoice ? [] : [emptyRow()]), [file, setFile] = useState<File | null>(null), [error, setError] = useState(''), [loaded, setLoaded] = useState('');
  const set = (k: keyof typeof head, v: string | boolean) => setHead(h => ({...h, [k]: v}));
  const setRow = (key: string, patch: Partial<Row>) => setRows(rs => rs.map(r => r.key === key ? {...r, ...patch} : r));
  const sum = rows.reduce((s, r) => s + (Number(r.qty) || 0) * (cents(r.cost) || 0), 0), totalCents = cents(head.total);
  const tracked = (id: string) => products.find(p => p.id === id)?.stock != null;

  async function isdoc(f: File) {
    setError(''); setLoaded('');
    try {
      const x = parseIsdoc(await f.text());
      setHead(h => ({...h, supplier: x.supplier || h.supplier, number: x.number || h.number, date: x.date || h.date, due: x.due || h.due, total: x.totalKc || h.total}));
      setRows(x.items.length ? x.items.map(i => { const p = matchProduct(i.name, products); return {...emptyRow(), product: p?.id || '', name: p ? p.name : i.name, qty: String(i.qty), cost: i.costKc}; }) : [emptyRow()]);
      setLoaded(`Načteno z ISDOC: ${itemsText(x.items.length)}. Zkontrolujte přiřazení k produktům ve Skladu.`);
    } catch (e) { setError((e as Error).message || 'Soubor se nepodařilo načíst.'); }
  }
  function submit(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const items = rows.filter(r => r.name.trim() || r.product);
    if (rows.some(r => r.product === NEW && !r.price.trim())) { setError('U nového produktu vyplňte prodejní cenu.'); return; }
    onSave({id: invoice?.id, ...head, items: items.map(r => ({productId: r.product && r.product !== NEW ? r.product : null, newProduct: r.product === NEW, name: r.name, qty: r.qty, cost: r.cost, price: r.price}))}, file);
  }
  return <form className="panel invoice-form" onSubmit={submit} ref={el => el?.scrollIntoView({block: 'nearest', behavior: 'smooth'})}>
    <div className="panel-heading"><h2>{invoice ? 'Upravit fakturu' : 'Nová faktura'}</h2><button type="button" className="icon-btn" aria-label="Zavřít" onClick={onCancel}><X size={18}/></button></div>
    {!invoice && <div className="invoice-import"><label className="secondary file-button"><Upload size={16}/> Načíst e-fakturu ISDOC<input type="file" accept=".isdoc,.xml,application/xml,text/xml" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) isdoc(f); e.target.value = ''; }}/></label>
      <small className="muted-inline">Pokud dodavatel posílá fakturu i jako soubor .isdoc, vyplní se všechno samo. Jinak položky opište z faktury.</small></div>}
    {loaded && <p className="notice" role="status">{loaded}</p>}
    <datalist id="invoice-suppliers">{suppliers.map(s => <option key={s} value={s}/>)}</datalist>
    <div className="field-grid">
      <label className="field"><span>Dodavatel *</span><input list="invoice-suppliers" required maxLength={120} value={head.supplier} onChange={e => set('supplier', e.target.value)}/></label>
      <label className="field"><span>Číslo faktury</span><input maxLength={40} value={head.number} onChange={e => set('number', e.target.value)}/></label>
      <label className="field"><span>Datum faktury *</span><input type="date" required value={head.date} onChange={e => set('date', e.target.value)}/></label>
      <label className="field"><span>Splatnost</span><input type="date" value={head.due} onChange={e => set('due', e.target.value)}/></label>
      <label className="field"><span>Částka celkem (Kč) *</span><input inputMode="decimal" required value={head.total} onChange={e => set('total', e.target.value)} placeholder={sum ? moneyInput(sum) : ''}/></label>
      <label className="field"><span>Soubor faktury (PDF nebo fotka)</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] || null)}/>
        {invoice?.fileMime && !file && <small className="muted-inline">Soubor je uložený, nový ho nahradí.</small>}</label>
    </div>
    <label className="check"><input type="checkbox" checked={head.paid} onChange={e => set('paid', e.target.checked)}/> Zaplaceno</label>
    {!invoice && <fieldset className="invoice-items"><legend>Položky</legend>
      <div className="invoice-item head" aria-hidden="true"><span>Produkt ve Skladu</span><span>Název</span><span>Ks</span><span>Cena za kus vč. DPH</span><span/></div>
      {rows.map((r, i) => <div className="invoice-item" key={r.key}>
        <label><span className="sr-only">Produkt {i + 1}</span><select value={r.product} onChange={e => { const v = e.target.value, p = products.find(x => x.id === v); setRow(r.key, {product: v, name: p ? p.name : r.name, cost: p && !r.cost ? moneyInput(p.costCents) : r.cost}); }}>
          <option value="">Jen zapsat (bez skladu)</option><option value={NEW}>+ Nový produkt do Skladu</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.stock != null ? ` (${p.stock} ks)` : ''}</option>)}</select></label>
        <label><span className="sr-only">Název {i + 1}</span><input value={r.name} maxLength={150} placeholder="Název z faktury" onChange={e => setRow(r.key, {name: e.target.value})}/></label>
        <label><span className="sr-only">Kusů {i + 1}</span><input type="number" min={1} max={99999} required value={r.qty} onChange={e => setRow(r.key, {qty: e.target.value})}/></label>
        <label><span className="sr-only">Cena za kus {i + 1}</span><input inputMode="decimal" value={r.cost} placeholder="Kč" onChange={e => setRow(r.key, {cost: e.target.value})}/></label>
        <button type="button" className="icon-btn" aria-label={`Odebrat položku ${i + 1}`} onClick={() => setRows(rs => rs.length > 1 ? rs.filter(x => x.key !== r.key) : [emptyRow()])}><X size={16}/></button>
        {r.product === NEW && <label className="invoice-new"><span>Prodejní cena nového produktu (Kč)</span><input inputMode="decimal" value={r.price} onChange={e => setRow(r.key, {price: e.target.value})}/></label>}
        {r.product && r.product !== NEW && !tracked(r.product) && <small className="invoice-hint">U tohoto produktu se sklad nesleduje, kusy se jen zapíší. Sledování zapnete v úpravě produktu.</small>}
      </div>)}
      <button type="button" className="link-button" onClick={() => setRows(rs => [...rs, emptyRow()])}><Plus size={15}/> Přidat položku</button>
      {sum > 0 && <p className="muted-inline">Součet položek {formatRevenue(sum)}{Number.isFinite(totalCents) && totalCents > 0 && totalCents !== sum && ` · rozdíl proti faktuře ${formatRevenue(totalCents - sum)} (třeba doprava, zapište ji jako položku „Jen zapsat“)`}.</p>}
    </fieldset>}
    {invoice && <p className="muted-inline">Položky a naskladnění uložené faktury se nemění. Když je potřeba opravit položky, fakturu smažte a zapište znovu.</p>}
    <label className="field"><span>Poznámka</span><input maxLength={500} value={head.note} onChange={e => set('note', e.target.value)}/></label>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="secondary" onClick={onCancel}>Zrušit</button><button className="primary" disabled={busy}><FileText size={16}/> {invoice ? 'Uložit změny' : 'Uložit a naskladnit'}</button></div>
  </form>;
}
