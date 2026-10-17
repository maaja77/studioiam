'use client';
// Klientky, které dlouho nepřišly a nemají objednaný další termín: připomenout se jim SMS nebo telefonem.
import {useEffect, useState} from 'react';
import {ChevronLeft, Copy, MessageSquare, Phone, UserRound} from 'lucide-react';
import {DEFAULT_LAPSED_TEXT} from '../lib/booking';
import type {LapsedClient} from './api/lapsed/route';

type Tab = 'todo' | 'contacted' | 'off';
const PERIODS = [[42, '6 týdnů'], [61, '2 měsíce'], [91, '3 měsíce'], [183, 'půl roku'], [365, 'rok']] as const;
const dateText = (s: string) => s.split('-').reverse().map(Number).join('. ');
const days = (from: string, to: string) => Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000);
function agoText(n: number) {
  if (n < 60) return `před ${Math.round(n / 7)} týdny`;
  const m = Math.round(n / 30.4);
  return m < 12 ? `před ${m} měsíci` : m < 24 ? 'před více než rokem' : `před ${Math.floor(m / 12)} lety`;
}
const visitsText = (n: number) => `${n} ${n === 1 ? 'návštěva' : n <= 4 ? 'návštěvy' : 'návštěv'}`;
export const fillLapsed = (text: string, c: {name: string}, salon: string, link: string) =>
  text.replace(/\{jmeno\}/g, c.name.trim().split(/\s+/)[0] || '').replace(/\{salon\}/g, salon || 'salonu').replace(/\{odkaz\}/g, link).replace(/\s+([,.])/g, '$1').replace(/ {2,}/g, ' ').trim();

async function post(action: string, data: Record<string, unknown>) {
  const r = await fetch('/api/lapsed', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, data})});
  const d = await r.json() as {error?: string; text?: string};
  if (!r.ok) throw new Error(d.error || 'Změnu se nepodařilo uložit.');
  return d;
}

export default function Lapsed({onOpenClient, onBack}: {onOpenClient: (id: string) => void; onBack: () => void}) {
  const [data, setData] = useState<{clients: LapsedClient[]; today: string; text: string; salon: string; bookingUrl: string} | null>(null);
  const [error, setError] = useState(''), [period, setPeriod] = useState(91), [tab, setTab] = useState<Tab>('todo'), [text, setText] = useState(''), [saved, setSaved] = useState(''), [copied, setCopied] = useState('');
  async function load() {
    try {
      const r = await fetch('/api/lapsed', {cache: 'no-store'}); const d = await r.json() as typeof data & {error?: string};
      if (!r.ok || !d) throw new Error(d?.error); setData(d); setText(t => t || d.text);
    } catch (e) { setError((e as Error).message || 'Přehled se nepodařilo načíst.'); }
  }
  useEffect(() => { load(); }, []);
  async function run(action: string, payload: Record<string, unknown>) {
    setError(''); try { await post(action, payload); await load(); } catch (e) { setError((e as Error).message); }
  }
  if (!data) return error ? <p className="error" role="alert">{error}</p> : <p className="muted">Načítám…</p>;

  const lapsed = data.clients.filter(c => !c.nextBooking && !c.blocked && days(c.lastVisit, data.today) >= period)
    .sort((a, b) => a.lastVisit.localeCompare(b.lastVisit) * -1);
  const contacted = (c: LapsedClient) => !!c.contactedAt && c.contactedAt >= c.lastVisit;
  const groups: Record<Tab, LapsedClient[]> = {todo: lapsed.filter(c => !c.noContact && !contacted(c)), contacted: lapsed.filter(c => !c.noContact && contacted(c)), off: lapsed.filter(c => !!c.noContact)};
  const shown = groups[tab];

  return <div className="lapsed">
    <button className="pb-back" onClick={onBack}><ChevronLeft size={16}/> Karty klientů</button>
    <div className="heading"><div><p className="eyebrow">KLIENTKY</p><h1>Dlouho nebyly</h1><p>Kdo nepřišel déle než zvolenou dobu a nemá objednaný další termín. Připomeňte se jim SMS nebo telefonem.</p></div></div>
    {error && <div className="error" role="alert">{error}</div>}
    <div className="voucher-tools">
      <label className="field inline-field"><span>Naposledy před víc než</span><select value={period} onChange={e => setPeriod(Number(e.target.value))}>{PERIODS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select></label>
      <span className="segmented-mini" role="radiogroup" aria-label="Zobrazit">{([['todo', 'K oslovení'], ['contacted', 'Oslovené'], ['off', 'Nechtějí zprávy']] as const).map(([k, l]) => <button type="button" key={k} role="radio" aria-checked={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l} ({groups[k].length})</button>)}</span>
    </div>
    <div className="panel"><ul className="lapsed-list">{!shown.length ? <li className="muted">{tab === 'todo' ? (lapsed.length ? 'Všechny už jsou oslovené.' : 'Nikdo takový není, klientky chodí pravidelně.') : tab === 'contacted' ? 'Zatím nikdo není označený jako oslovený.' : 'Nikdo.'}</li>
    : shown.map(c => { const msg = fillLapsed(text || DEFAULT_LAPSED_TEXT, c, data.salon, data.bookingUrl), phone = c.phone.replace(/[^\d+]/g, ''); return <li key={c.id}>
      <div className="lapsed-who"><b>{c.name}</b><small>naposledy {dateText(c.lastVisit)} ({agoText(days(c.lastVisit, data.today))}){c.lastTreatment && ` · ${c.lastTreatment}`} · {visitsText(c.visits)}</small>
        {tab === 'contacted' && <small className="lapsed-note">osloveno {dateText(c.contactedAt!)}</small>}</div>
      <div className="lapsed-actions">
        {tab !== 'off' && phone && <a className="secondary" href={`sms:${phone}?&body=${encodeURIComponent(msg)}`} onClick={() => { if (tab === 'todo') run('contacted', {id: c.id}); }}><MessageSquare size={15}/> SMS</a>}
        {tab !== 'off' && phone && <a className="secondary" href={`tel:${phone}`}><Phone size={15}/> Zavolat</a>}
        {tab !== 'off' && <button type="button" className="secondary" onClick={() => navigator.clipboard.writeText(msg).then(() => setCopied(c.id), () => setCopied(''))}><Copy size={15}/> {copied === c.id ? 'Zkopírováno' : 'Text'}</button>}
        <button type="button" className="secondary" onClick={() => onOpenClient(c.id)}><UserRound size={15}/> Karta</button>
        {tab === 'todo' && <button type="button" className="link-button" onClick={() => run('contacted', {id: c.id})}>Označit jako oslovenou</button>}
        {tab === 'contacted' && <button type="button" className="link-button" onClick={() => run('contacted', {id: c.id, undo: true})}>Vrátit k oslovení</button>}
        {tab !== 'off' ? <button type="button" className="link-button" onClick={() => run('noContact', {id: c.id, value: true})}>Nechce zprávy</button>
        : <button type="button" className="link-button" onClick={() => run('noContact', {id: c.id, value: false})}>Zase oslovovat</button>}
      </div>
    </li>; })}</ul></div>
    <details className="panel lapsed-text"><summary>Text SMS</summary>
      <p className="muted-inline">SMS se otevře v telefonu a odešlete ji jako běžnou zprávu. Do textu se doplní {'{jmeno}'} (křestní jméno v 1. pádu), {'{salon}'} a {'{odkaz}'} (online rezervace). Kvůli zákonu o obchodních sděleních nechte v textu možnost další zprávy odmítnout.</p>
      <textarea rows={4} maxLength={480} value={text} onChange={e => { setText(e.target.value); setSaved(''); }}/>
      <div className="form-actions"><button type="button" className="secondary" onClick={() => { setText(DEFAULT_LAPSED_TEXT); setSaved(''); }}>Výchozí text</button>
        <button type="button" className="primary" onClick={() => post('text', {text}).then(d => { setText(d.text || text); setSaved('Text je uložený.'); }, e => setError((e as Error).message))}>Uložit text</button></div>
      {saved && <p className="notice" role="status">{saved}</p>}
    </details>
  </div>;
}
