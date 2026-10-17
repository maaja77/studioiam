'use client';
// Nastavení → Programy: série ošetření se slevou (název, ošetření, cena, slevy po návštěvách, max. odstup), přidání, úprava, vypnutí a smazání.
import {useEffect, useState} from 'react';
import {Pencil, Plus, Sparkles, Trash2, X} from 'lucide-react';
import {stepPrice, type Program} from '../lib/programs';
import {formatRevenue} from '../lib/revenue';

type Row = Program & {clients: number; visits: number};
type Service = {name: string; priceCents: number};

async function post(action: string, data: Record<string, unknown>) {
  const r = await fetch('/api/programs', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, data})});
  const d = await r.json() as {error?: string};
  if (!r.ok) throw new Error(d.error || 'Program se nepodařilo uložit.');
}
const ladder = (p: Pick<Program, 'priceCents' | 'discounts'>) => (p.discounts.length ? p.discounts : [0]).map((d, i, a) => `${i + 1}.${i === a.length - 1 && a.length > 1 ? ' a další' : ''} ${formatRevenue(stepPrice(p, i + 1))}${d ? ` (−${d} %)` : ''}`).join(' · ');

export default function ProgramSettings({services, onSaved}: {services: Service[]; onSaved?: () => void}) {
  const [rows, setRows] = useState<Row[] | null>(null), [editing, setEditing] = useState<Partial<Row> | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  async function load() { try { const r = await fetch('/api/programs', {cache: 'no-store'}); const d = await r.json() as {programs?: Row[]; error?: string}; if (!r.ok || !d.programs) throw new Error(d.error); setRows(d.programs); } catch (e) { setError((e as Error).message || 'Programy se nepodařilo načíst.'); } }
  useEffect(() => { load(); }, []);
  async function run(action: string, data: Record<string, unknown>, message: string) {
    setBusy(true); setError(''); setNotice('');
    try { await post(action, data); setEditing(null); await load(); onSaved?.(); setNotice(message); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="panel program-settings">
    <div className="panel-heading"><h2>Programy</h2><button className="primary" disabled={busy} onClick={() => { setNotice(''); setEditing({discounts: [0, 5, 10], intervalDays: 28, active: 1}); }}><Plus size={17}/> Přidat program</button></div>
    <p className="muted-inline">Série jednoho ošetření se slevou podle pořadí návštěvy. Klientku do programu zařadíte na její kartě, cena se pak při zápisu návštěvy vyplní sama.</p>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    {editing && <ProgramForm program={editing} services={services} busy={busy} onCancel={() => setEditing(null)} onSave={data => run('save', data, 'Program byl uložen.')}/>}
    {!rows ? <p className="muted">Načítám…</p> : !rows.length ? <p className="muted-inline">Zatím žádný program. Přidejte třeba sérii ošetření, na kterou klientky chodí pravidelně.</p>
      : <ul className="program-list">{rows.map(p => <li key={p.id} className={p.active ? '' : 'inactive'}>
        <div><b><Sparkles size={14}/> {p.name}{!p.active && <span className="muted-inline"> · vypnutý</span>}</b><small>{p.treatment} · odstup nejvýš {p.intervalDays} dní · {p.clients} {p.clients === 1 ? 'klientka' : p.clients >= 2 && p.clients <= 4 ? 'klientky' : 'klientek'}</small><small>{ladder(p)}</small></div>
        <span className="program-list-actions">
          <button className="icon-btn" aria-label={'Upravit ' + p.name} title="Upravit" disabled={busy} onClick={() => { setNotice(''); setEditing(p); }}><Pencil size={16}/></button>
          {p.visits ? <button className="link-button" disabled={busy} onClick={() => run('save', {...form(p), active: !p.active}, p.active ? 'Program je vypnutý, nové klientky do něj nepřidáte.' : 'Program je znovu zapnutý.')}>{p.active ? 'Vypnout' : 'Zapnout'}</button>
            : <button className="icon-btn" aria-label={'Smazat ' + p.name} title="Smazat" disabled={busy} onClick={() => { if (window.confirm(`Smazat program ${p.name}?`)) run('delete', {id: p.id}, 'Program byl smazán.'); }}><Trash2 size={16}/></button>}
        </span></li>)}</ul>}
  </section>;
}

const form = (p: Partial<Row>) => ({id: p.id, name: p.name, treatment: p.treatment, price: p.priceCents != null ? String(p.priceCents / 100) : '', discounts: (p.discounts || [0]).join(', '), intervalDays: p.intervalDays ?? 28, active: p.active !== 0});

function ProgramForm({program, services, busy, onSave, onCancel}: {program: Partial<Row>; services: Service[]; busy: boolean; onSave: (data: Record<string, unknown>) => void; onCancel: () => void}) {
  const [f, setF] = useState(form(program));
  const preview = (() => { const price = Number(String(f.price).replace(/\s/g, '').replace(',', '.')), discounts = String(f.discounts).split(/[,;\s]+/).filter(Boolean).map(Number); return price > 0 && discounts.every(n => Number.isInteger(n) && n >= 0 && n <= 90) ? ladder({priceCents: Math.round(price * 100), discounts}) : ''; })();
  return <form className="program-form-panel" onSubmit={e => { e.preventDefault(); onSave(f); }}>
    <div className="panel-heading"><h3>{program.id ? 'Upravit program' : 'Nový program'}</h3><button type="button" className="icon-btn" aria-label="Zavřít" onClick={onCancel}><X size={18}/></button></div>
    <div className="field-grid">
      <label className="field"><span>Název programu</span><input required maxLength={80} value={f.name || ''} onChange={e => setF({...f, name: e.target.value})} placeholder="Např. Hydratovaná pleť"/></label>
      <label className="field"><span>Ošetření</span><input required maxLength={150} list="program-services" value={f.treatment || ''} onChange={e => { const s = services.find(x => x.name === e.target.value); setF({...f, treatment: e.target.value, price: !f.price && s?.priceCents ? String(s.priceCents / 100) : f.price}); }}/>
        <datalist id="program-services">{services.map(s => <option key={s.name} value={s.name}/>)}</datalist></label>
      <label className="field"><span>Cena ošetření (Kč)</span><input required inputMode="decimal" value={f.price} onChange={e => setF({...f, price: e.target.value})}/></label>
      <label className="field"><span>Slevy po návštěvách (%)</span><input value={f.discounts} onChange={e => setF({...f, discounts: e.target.value})} placeholder="0, 5, 10"/><small>1. návštěva, 2. návštěva… Poslední sleva platí pro všechny další.</small></label>
      <label className="field"><span>Nejdelší odstup návštěv (dní)</span><input type="number" min={7} max={365} required value={f.intervalDays} onChange={e => setF({...f, intervalDays: Number(e.target.value)})}/><small>Po delší pauze začíná série znovu od plné ceny.</small></label>
    </div>
    {preview && <p className="muted-inline">Ceny: {preview}</p>}
    <label className="check"><input type="checkbox" checked={f.active} onChange={e => setF({...f, active: e.target.checked})}/> Program je zapnutý (jde do něj přidávat klientky)</label>
    <div className="form-actions"><button type="button" className="secondary" onClick={onCancel}>Zrušit</button><button className="primary" disabled={busy}>Uložit program</button></div>
  </form>;
}
