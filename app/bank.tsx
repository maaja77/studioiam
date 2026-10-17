'use client';
// Platby z banky: nahrání výpisu pohybů (CSV z internetového bankovnictví) a automatické spárování plateb.
import {useEffect, useRef, useState} from 'react';
import {Check, ChevronLeft, EyeOff, FileUp, Link2, RotateCcw} from 'lucide-react';
import {formatRevenue} from '../lib/revenue';
import type {BankPayment, PayItem} from './api/bank/route';

type Data = {payments: BankPayment[]; open: PayItem[]; account: string; lastDate: string | null; lastImport: string | null; today: string};
type ImportResult = {added: number; known: number; matched: number; mismatch: number; unmatched: number; outgoing: number; items: {label: string; amountCents: number; status: string}[]};
type Tab = 'todo' | 'matched' | 'ignored';
const dateText = (s: string) => s.slice(0, 10).split('-').reverse().map(Number).join('. ');
const KIND_LABEL: Record<PayItem['kind'], string> = {deposit: 'Kauce', voucher: 'Poukazy z webu', receipt: 'QR účtenky'};
const plural = (n: number, one: string, few: string, many: string) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;

async function post(action: string, data: Record<string, unknown>) {
  const r = await fetch('/api/bank', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, data})});
  const d = await r.json() as {error?: string; otherAccount?: string} & Partial<ImportResult>;
  if (!r.ok) throw Object.assign(new Error(d.error || 'Změnu se nepodařilo uložit.'), {otherAccount: d.otherAccount});
  return d as ImportResult;
}

/** Banky exportují CSV v UTF-8 nebo ve starším kódování Windows-1250; zkusí se obojí. */
async function readText(file: File) {
  const bytes = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes); } catch { return new TextDecoder('windows-1250').decode(bytes); }
}

declare global { interface Window { salonDemoStatement?: (open: PayItem[], account: string) => string } }

export default function BankPayments({onBack}: {onBack: () => void}) {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null), [tab, setTab] = useState<Tab>('todo'), [assign, setAssign] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  async function load() {
    try { const r = await fetch('/api/bank', {cache: 'no-store'}); const d = await r.json() as Data & {error?: string}; if (!r.ok) throw new Error(d.error); setData(d); }
    catch (e) { setError((e as Error).message || 'Platby se nepodařilo načíst.'); }
  }
  useEffect(() => { load(); }, []);

  async function upload(text: string) {
    setBusy(true); setError(''); setResult(null);
    try {
      let res: ImportResult;
      try { res = await post('import', {text}); }
      catch (e) {
        const other = (e as {otherAccount?: string}).otherAccount;
        if (!other || !confirm(`${(e as Error).message} Opravdu nahrát výpis z jiného účtu?`)) throw e;
        res = await post('import', {text, otherAccount: true});
      }
      setResult(res); setTab('todo'); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  async function run(action: string, payload: Record<string, unknown>) {
    setBusy(true); setError('');
    try { await post(action, payload); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!data) return error ? <p className="error" role="alert">{error}</p> : <p className="muted">Načítám…</p>;

  const todo = data.payments.filter(p => p.status === 'unmatched' || p.status === 'mismatch');
  const groups: Record<Tab, BankPayment[]> = {todo, matched: data.payments.filter(p => p.status === 'matched'), ignored: data.payments.filter(p => p.status === 'ignored')};
  const shown = groups[tab];
  // Nabídka k ručnímu přiřazení: nahoře položky se stejnou částkou.
  const options = (p: BankPayment) => [...data.open].sort((a, b) => Number(b.amountCents === p.amountCents) - Number(a.amountCents === p.amountCents));

  return <div className="bank">
    <button className="pb-back" onClick={onBack}><ChevronLeft size={16}/> Účtenky</button>
    <div className="heading"><div><p className="eyebrow">PLATBY PŘEVODEM</p><h1>Platby z banky</h1><p>Nahrajte výpis pohybů z internetového bankovnictví. Kauce, poukazy z webu a QR účtenky se podle variabilního symbolu a částky označí jako zaplacené.</p></div></div>
    {error && <div className="error" role="alert">{error}</div>}

    <section className="panel bank-upload">
      <div className="bank-upload-row">
        <label className={'primary' + (busy ? ' disabled' : '')}><FileUp size={18}/> {busy ? 'Zpracovávám…' : 'Nahrát výpis (CSV)'}
          <input ref={input} type="file" accept=".csv,text/csv,text/plain" className="sr-only" disabled={busy} onChange={async e => { const f = e.target.files?.[0]; if (f) upload(await readText(f)); }}/></label>
        {typeof window !== 'undefined' && window.salonDemoStatement && <button className="secondary" disabled={busy} onClick={() => upload(window.salonDemoStatement!(data.open, data.account))}>Vyzkoušet na ukázkovém výpisu</button>}
        <small className="muted-inline">{data.lastDate ? `Nahrané platby jsou do ${dateText(data.lastDate)}.` : 'Zatím nebyl nahrán žádný výpis.'}</small>
      </div>
      <details className="bank-how"><summary>Jak výpis stáhnout z ČSOB</summary>
        <ol><li>V internetovém bankovnictví ČSOB otevřete <b>Pohyby na účtu</b> u účtu salonu{data.account ? ` (${data.account})` : ''}.</li>
          <li>Vyberte období, například posledních 14 dní. Stačí, aby navazovalo na minulý výpis, platby se při opakovaném nahrání nezdvojí.</li>
          <li>Klikněte na <b>Export</b>, zvolte formát <b>CSV</b> a stažený soubor nahrajte sem.</li></ol></details>
      {result && <div className="bank-result" role="status">
        <p><b>{result.added ? `Nahráno ${plural(result.added, 'nová příchozí platba', 'nové příchozí platby', 'nových příchozích plateb')}.` : 'Žádné nové příchozí platby.'}</b>
          {result.known > 0 && ` ${plural(result.known, 'platba už byla nahraná', 'platby už byly nahrané', 'plateb už bylo nahráno')} dříve.`}</p>
        {result.added > 0 && <p>Spárováno: {result.matched}{result.mismatch > 0 && `, nesedí částka: ${result.mismatch}`}{result.unmatched > 0 && `, bez shody: ${result.unmatched}`}.</p>}
        {result.items.length > 0 && <ul>{result.items.map((x, i) => <li key={i} className={x.status}>{x.status === 'matched' ? <Check size={15}/> : '!'} {formatRevenue(x.amountCents)} · {x.label}</li>)}</ul>}
      </div>}
    </section>

    <section className="panel">
      <h2>Čeká na platbu převodem</h2>
      {!data.open.length ? <p className="muted-inline">Nic nečeká, všechno je zaplacené.</p> : <ul className="lapsed-list">{data.open.map(i => <li key={i.kind + i.id}>
        <div className="lapsed-who"><b>{i.label}</b><small>{KIND_LABEL[i.kind]} · VS {i.vs || 'bez symbolu'}</small></div><b>{formatRevenue(i.amountCents)}</b></li>)}</ul>}
    </section>

    <div className="voucher-tools">
      <span className="segmented-mini" role="radiogroup" aria-label="Zobrazit platby">{([['todo', `K vyřízení (${todo.length})`], ['matched', 'Spárované'], ['ignored', 'Skryté']] as const).map(([k, l]) =>
        <button type="button" key={k} role="radio" aria-checked={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}</span>
      {tab === 'todo' && todo.some(p => p.status === 'unmatched') && <button className="secondary" disabled={busy} onClick={() => { if (confirm('Skrýt všechny příchozí platby, které se k ničemu nespárovaly (např. platby kartou nebo platby mimo aplikaci)?')) run('ignoreAll', {}); }}><EyeOff size={16}/> Skrýt všechny bez shody</button>}
    </div>
    <div className="panel"><ul className="lapsed-list bank-list">{!shown.length ? <li className="muted">{tab === 'todo' ? 'Nic k vyřízení.' : tab === 'matched' ? 'Zatím žádné spárované platby.' : 'Žádné skryté platby.'}</li>
      : shown.map(p => <li key={p.id} className={p.status}>
        <div className="lapsed-who"><b>{formatRevenue(p.amountCents)} · {p.name || 'Neznámý plátce'}</b>
          <small>{dateText(p.date)} · VS {p.vs || 'bez symbolu'}{p.message && ` · ${p.message}`}{p.operation && ` · ${p.operation}`}</small>
          {p.matchLabel && <small className={p.status === 'mismatch' ? 'bank-warn' : 'lapsed-note'}>{p.status === 'mismatch' ? 'Nesedí částka: ' : ''}{p.matchLabel}</small>}</div>
        {p.status !== 'matched' && <div className="lapsed-actions">
          {p.status !== 'ignored' && data.open.length > 0 && <>
            <select aria-label="Přiřadit platbu k" value={assign[p.id] ?? (p.status === 'mismatch' && p.matchKind ? p.matchKind + ':' + p.matchId : '')} onChange={e => setAssign(a => ({...a, [p.id]: e.target.value}))}>
              <option value="">Přiřadit k…</option>{options(p).map(i => <option key={i.kind + i.id} value={i.kind + ':' + i.id}>{formatRevenue(i.amountCents)} · {i.label}</option>)}</select>
            <button className="secondary" disabled={busy || !(assign[p.id] ?? (p.status === 'mismatch' ? p.matchId : ''))} onClick={() => {
              const [kind, itemId] = (assign[p.id] || (p.matchKind + ':' + p.matchId)).split(':'); run('assign', {id: p.id, kind, itemId});
            }}><Link2 size={15}/> Přiřadit</button></>}
          {p.status === 'ignored' ? <button className="secondary" disabled={busy} onClick={() => run('ignore', {id: p.id, undo: true})}><RotateCcw size={15}/> Vrátit</button>
            : <button className="secondary" disabled={busy} onClick={() => run('ignore', {id: p.id})}><EyeOff size={15}/> Skrýt</button>}
        </div>}
      </li>)}</ul></div>
  </div>;
}
