'use client';
// Narozeniny v části Dnes: komu popřát dnes a v nejbližších dnech. SMS se otevře v telefonu salonu.
import {useEffect, useState} from 'react';
import {Cake, Check, MessageSquare, UserRound} from 'lucide-react';
import {DEFAULT_BIRTHDAY_TEXT, fillBirthday} from '../lib/birthdays';
import type {BirthdayClient} from './api/birthdays/route';

const dayText = (c: BirthdayClient) => c.days === 0 ? 'dnes' : c.days === 1 ? 'zítra' : c.days < 0 ? (c.days === -1 ? 'včera' : `před ${-c.days} dny`)
  : new Date(c.date + 'T12:00:00').toLocaleDateString('cs-CZ', {weekday: 'long', day: 'numeric', month: 'numeric'});
const ageText = (n: number) => `${n} ${n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'roky' : 'let'}`;

async function post(action: string, data: Record<string, unknown>) {
  const r = await fetch('/api/birthdays', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, data})});
  const d = await r.json() as {error?: string; text?: string};
  if (!r.ok) throw new Error(d.error || 'Změnu se nepodařilo uložit.');
  return d;
}

export default function Birthdays({onOpenClient}: {onOpenClient: (id: string) => void}) {
  const [data, setData] = useState<{clients: BirthdayClient[]; text: string; salon: string} | null>(null), [error, setError] = useState(''), [edit, setEdit] = useState(false), [text, setText] = useState('');
  async function load() {
    try { const r = await fetch('/api/birthdays', {cache: 'no-store'}); const d = await r.json() as typeof data & {error?: string}; if (!r.ok || !d) throw new Error(d?.error); setData(d); setText(d.text); }
    catch (e) { setError((e as Error).message || 'Narozeniny se nepodařilo načíst.'); }
  }
  useEffect(() => { load(); }, []);
  async function run(action: string, payload: Record<string, unknown>) { setError(''); try { const d = await post(action, payload); await load(); return d; } catch (e) { setError((e as Error).message); } }
  if (!data) return error ? <section className="panel"><p className="error" role="alert">{error}</p></section> : null;
  if (!data.clients.length && !edit) return null;

  return <section className="panel birthdays" aria-label="Narozeniny">
    <h2><Cake size={17}/> Narozeniny</h2>
    {!data.clients.length ? <p className="muted-inline">V příštích dvou týdnech nikdo.</p> : <ul className="reviews-list">{data.clients.map(c => {
      const msg = fillBirthday(data.text || DEFAULT_BIRTHDAY_TEXT, c.name, data.salon), phone = c.phone.replace(/[^\d+]/g, '');
      return <li key={c.id} className={c.days === 0 ? 'today' : ''}>
        <div><b>{c.name}</b><small>{dayText(c)} · {ageText(c.age)}{c.wished && ' · popřáno'}{c.noContact ? ' · nechce zprávy' : ''}</small></div>
        <div className="reviews-actions">
          {phone && !c.noContact && !c.wished && <a className="secondary" href={`sms:${phone}?&body=${encodeURIComponent(msg)}`} onClick={() => run('wished', {id: c.id, date: c.date})}><MessageSquare size={15}/> Popřát SMS</a>}
          {!c.wished ? <button type="button" className="link-button" onClick={() => run('wished', {id: c.id, date: c.date})}><Check size={14}/> Popřáno</button>
            : <button type="button" className="link-button" onClick={() => run('wished', {id: c.id, undo: true})}>Vrátit</button>}
          <button type="button" className="icon-btn" aria-label={'Karta ' + c.name} title="Karta" onClick={() => onOpenClient(c.id)}><UserRound size={15}/></button>
        </div>
      </li>; })}</ul>}
    {edit ? <div className="reviews-setup"><label className="field"><span>Text přání</span><textarea rows={4} maxLength={480} value={text} onChange={e => setText(e.target.value)}/>
        <small className="muted-inline">Doplní se {'{salon}'} a křestní jméno {'{jmeno}'} (v 1. pádu, proto ho výchozí text nepoužívá). Když přidáte slevu nebo dárek, nechte v textu možnost další zprávy odmítnout.</small></label>
      <div className="form-actions"><button type="button" className="link-button" onClick={() => setText(DEFAULT_BIRTHDAY_TEXT)}>Výchozí text</button>
        <button type="button" className="secondary" onClick={() => { setEdit(false); setText(data.text); }}>Zrušit</button>
        <button type="button" className="primary" onClick={async () => { if (await run('text', {text})) setEdit(false); }}>Uložit</button></div></div>
      : <button type="button" className="link-button" onClick={() => setEdit(true)}>Upravit text přání</button>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
