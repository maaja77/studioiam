'use client';
// Prosba o hodnocení na Googlu: klientky z posledních dní, každá se žádá jen jednou. SMS se otevře v telefonu salonu.
import {useEffect, useState} from 'react';
import {Copy, Mail, MessageSquare, Star} from 'lucide-react';
import {DEFAULT_REVIEW_TEXT} from '../lib/booking';
import {fillReview} from '../lib/reviews';
import type {ReviewData} from './api/reviews/route';

const dateText = (s: string) => s.split('-').reverse().map(Number).join('. ');
async function post(action: string, data: Record<string, unknown>) {
  const r = await fetch('/api/reviews', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, data})});
  const d = await r.json() as {error?: string; url?: string; text?: string};
  if (!r.ok) throw new Error(d.error || 'Změnu se nepodařilo uložit.');
  return d;
}

export default function ReviewRequests() {
  const [data, setData] = useState<ReviewData | null>(null), [error, setError] = useState(''), [status, setStatus] = useState<{text: string; undo?: string} | null>(null);
  const [url, setUrl] = useState(''), [text, setText] = useState(''), [edit, setEdit] = useState(false), [busy, setBusy] = useState(false);
  async function load() {
    try { const r = await fetch('/api/reviews', {cache: 'no-store'}); const d = await r.json() as ReviewData & {error?: string}; if (!r.ok) throw new Error(d.error); setData(d); setUrl(d.url); setText(d.text); }
    catch (e) { setError((e as Error).message || 'Seznam se nepodařilo načíst.'); }
  }
  useEffect(() => { load(); }, []);
  async function run(action: string, data: Record<string, unknown>, done?: string) {
    setBusy(true); setError('');
    try { await post(action, data); await load(); setStatus(done ? {text: done, undo: typeof data.id === 'string' ? data.id : undefined} : null); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function saveSettings() {
    setBusy(true); setError('');
    try { const d = await post('settings', {url, text}); setUrl(d.url || ''); setText(d.text || ''); await load(); setEdit(false); setStatus({text: 'Uloženo.'}); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!data) return error ? <section className="panel"><p className="error" role="alert">{error}</p></section> : null;

  const setup = !data.url || edit;
  return <section className="panel reviews" aria-label="Požádat o hodnocení">
    <h2><Star size={17}/> Požádat o hodnocení</h2>
    {!setup && <p className="muted-inline">Klientky z posledních 7 dní. Každou požádáte jen jednou.{data.askedMonth > 0 && ` Tento měsíc požádáno: ${data.askedMonth}.`}</p>}
    {setup ? <div className="reviews-setup">
      {!data.url && <p className="muted-inline">Vložte odkaz na hodnocení salonu na Googlu. Najdete ho v Google profilu firmy pod tlačítkem „Požádat o recenze“ (nebo „Získat další recenze“), kde ho zkopírujete.</p>}
      <label className="field"><span>Odkaz na hodnocení</span><input type="url" inputMode="url" placeholder="https://g.page/r/…/review" value={url} onChange={e => setUrl(e.target.value)}/></label>
      <label className="field"><span>Text zprávy</span><textarea rows={5} maxLength={480} value={text} onChange={e => setText(e.target.value)}/>
        <small className="muted-inline">Doplní se {'{jmeno}'}, {'{salon}'} a {'{odkaz}'}. Nechte v textu možnost další zprávy odmítnout.</small></label>
      <div className="form-actions">
        <button type="button" className="link-button" disabled={busy} onClick={() => setText(DEFAULT_REVIEW_TEXT)}>Výchozí text</button>
        {data.url && <button type="button" className="secondary" disabled={busy} onClick={() => { setEdit(false); setUrl(data.url); setText(data.text); }}>Zrušit</button>}
        <button type="button" className="primary" disabled={busy || !url.trim()} onClick={saveSettings}>Uložit</button>
      </div>
    </div> : !data.clients.length ? <p className="muted-inline">Teď není koho požádat.</p> : <ul className="reviews-list">{data.clients.map(c => {
      const msg = fillReview(data.text, c.name, data.salon, data.url), phone = c.phone.replace(/[^\d+]/g, '');
      return <li key={c.id}>
        <div><b>{c.name}</b><small>{dateText(c.lastVisit)}{c.lastTreatment && ` · ${c.lastTreatment}`}</small></div>
        <div className="reviews-actions">
          {phone && <a className="secondary" href={`sms:${phone}?&body=${encodeURIComponent(msg)}`} onClick={() => run('sent', {id: c.id, via: 'sms'}, `${c.name}: SMS se otevřela v telefonu.`)}><MessageSquare size={15}/> SMS</a>}
          {c.email && data.mail && <button type="button" className="secondary" disabled={busy} onClick={() => run('email', {id: c.id}, `${c.name}: e-mail odeslán.`)}><Mail size={15}/> E-mail</button>}
          <button type="button" className="secondary" disabled={busy} aria-label={`Kopírovat text pro ${c.name}`} onClick={() => navigator.clipboard?.writeText(msg).then(() => run('sent', {id: c.id, via: 'copy'}, `${c.name}: text je zkopírovaný.`), () => setError('Text se nepodařilo zkopírovat.'))}><Copy size={15}/></button>
          <button type="button" className="link-button" disabled={busy} onClick={() => run('skip', {id: c.id}, `${c.name}: nebude se žádat.`)}>Nežádat</button>
        </div>
      </li>; })}</ul>}
    {status && <p className="notice" role="status">{status.text}{status.undo && <> <button type="button" className="link-button" disabled={busy} onClick={() => run('undo', {id: status.undo})}>Vrátit</button></>}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {!setup && <button type="button" className="link-button" onClick={() => setEdit(true)}>Upravit odkaz a text</button>}
  </section>;
}
