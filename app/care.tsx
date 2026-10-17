'use client';
// Dialog Domácí péče u návštěvy: text doporučení, výběr produktů ze Skladu a odeslání klientce (SMS, e-mail, odkaz).
import {useEffect, useRef, useState} from 'react';
import {Check, Copy, ExternalLink, Mail, MessageSquare, Trash2, X} from 'lucide-react';
import {formatRevenue} from '../lib/revenue';

type Data = {visit: {date: string; treatment: string}; client: {name: string; phone: string; email: string}; text: string; productIds: string[];
  products: {id: string; name: string; priceCents: number}[]; saved: boolean; sentAt: string | null; sentVia: string; link: string; sms: string; mail: boolean};
const dateText = (s: string) => s.slice(0, 10).split('-').reverse().map(Number).join('. ');
const VIA: Record<string, string> = {sms: 'SMS', email: 'e-mailem', share: 'sdílením'};

async function post(action: string, data: Record<string, unknown>) {
  const r = await fetch('/api/care', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, data})});
  const d = await r.json() as {error?: string; link?: string; sms?: string};
  if (!r.ok) throw new Error(d.error || 'Doporučení se nepodařilo uložit.');
  return d;
}

export default function CareDialog({visitId, onClose, onChanged}: {visitId: string; onClose: () => void; onChanged: () => void}) {
  const [data, setData] = useState<Data | null>(null), [text, setText] = useState(''), [ids, setIds] = useState<string[]>([]), [email, setEmail] = useState(''), [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    fetch('/api/care?visitId=' + encodeURIComponent(visitId), {cache: 'no-store'}).then(async r => {
      const d = await r.json() as Data & {error?: string};
      if (!r.ok) throw new Error(d.error);
      setData(d); setText(d.text); setIds(d.productIds); setEmail(d.client.email); setPhone(d.client.phone);
    }).catch(e => setError((e as Error).message || 'Domácí péči se nepodařilo načíst.'));
  }, [visitId]);

  async function save() { const d = await post('save', {visitId, text, productIds: ids}); setData(x => x && {...x, saved: true, link: d.link || '', sms: d.sms || ''}); return d; }
  async function run(fn: () => Promise<string>) {
    setBusy(true); setError(''); setStatus('');
    try { setStatus(await fn()); onChanged(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  // SMS se otevře v telefonu; okno se otevírá hned v obsluze kliknutí, odkaz se doplní po uložení.
  async function sms() {
    await run(async () => {
      const d = await save();
      location.href = `sms:${phone.replace(/[^\d+]/g, '')}?body=${encodeURIComponent(d.sms || '')}`;
      await post('sent', {visitId, via: 'sms'});
      return 'Zpráva se otevřela v telefonu. Odešlete ji tam.';
    });
  }

  const toggle = (id: string) => setIds(x => x.includes(id) ? x.filter(i => i !== id) : [...x, id]);
  return <dialog ref={dialog} className="care-dialog" onCancel={e => { if (busy) e.preventDefault(); else onClose(); }}>
    <div className="dialog-header"><div><p className="eyebrow">{data ? `${data.client.name} · ${dateText(data.visit.date)}` : 'NÁVŠTĚVA'}</p><h2>Domácí péče</h2></div><button type="button" disabled={busy} aria-label="Zavřít" onClick={onClose}><X size={21}/></button></div>
    {!data ? <div className="fields">{error ? <p className="error" role="alert">{error}</p> : <p className="muted">Načítám…</p>}</div> : <>
      <div className="fields">
        {data.sentAt && <p className="notice">Odesláno {dateText(data.sentAt)} {VIA[data.sentVia] || ''}. Změny se v odkazu projeví hned po uložení.</p>}
        <label className="field"><span>Doporučení po ošetření {data.visit.treatment}</span>
          <textarea rows={7} maxLength={5000} value={text} onChange={e => setText(e.target.value)} placeholder="Co dělat a čemu se vyhnout v dalších dnech…"/>
          <small className="muted-inline">Řádek začínající pomlčkou se zobrazí jako odrážka. Text se příště nabídne u stejného ošetření.</small></label>
        <fieldset className="care-pick"><legend>Doporučené přípravky ze Skladu</legend>
          {!data.products.length ? <p className="muted-inline">Ve Skladu zatím nejsou žádné produkty k prodeji.</p> : <div className="care-chips">{data.products.map(p =>
            <button type="button" key={p.id} aria-pressed={ids.includes(p.id)} className={ids.includes(p.id) ? 'active' : ''} onClick={() => toggle(p.id)}>{ids.includes(p.id) && <Check size={14}/>}{p.name} <small>{formatRevenue(p.priceCents)}</small></button>)}</div>}
        </fieldset>
        <section className="send-panel" aria-label="Poslat klientce">
          <h3>Poslat klientce</h3>
          <div className="send-row">
            <input type="tel" aria-label="Telefon klientky" placeholder="Telefon klientky" value={phone} onChange={e => setPhone(e.target.value)}/>
            <button type="button" className="secondary" disabled={busy || !phone} onClick={sms}><MessageSquare size={16}/> Poslat SMS</button>
          </div>
          <form className="send-row" onSubmit={e => { e.preventDefault(); run(async () => { await post('email', {visitId, text, productIds: ids, email}); return `Odesláno na ${email}.`; }); }}>
            <input type="email" aria-label="E-mail klientky" placeholder="E-mail klientky" required value={email} onChange={e => setEmail(e.target.value)}/>
            <button className="secondary" disabled={busy || !email || !data.mail}><Mail size={16}/> Poslat e-mailem</button>
          </form>
          {!data.mail && <p className="muted-inline">E-maily zatím nejsou na serveru nastavené. Použijte SMS nebo odkaz.</p>}
          <div className="send-row links">
            <button type="button" className="secondary" disabled={busy} onClick={() => run(async () => { const d = await save(); await navigator.clipboard?.writeText(d.link || ''); return 'Odkaz je zkopírovaný.'; })}><Copy size={16}/> Kopírovat odkaz</button>
            {data.link && <a className="secondary" href={data.link} target="_blank" rel="noopener"><ExternalLink size={16}/> Náhled pro klientku</a>}
          </div>
          {status && <p className="notice" role="status">{status}</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      </div>
      <div className="dialog-footer">
        {data.saved && <button type="button" className="link-button danger" disabled={busy} onClick={() => { if (confirm('Smazat doporučení? Odkaz pro klientku přestane fungovat.')) run(async () => { await post('delete', {visitId}); onClose(); return ''; }); }}><Trash2 size={15}/> Smazat</button>}
        <button type="button" className="secondary" disabled={busy} onClick={onClose}>Zavřít</button>
        <button type="button" className="primary" disabled={busy} onClick={() => run(async () => { await save(); return 'Uloženo. Odkaz můžete poslat klientce.'; })}>Uložit</button>
      </div>
    </>}
  </dialog>;
}
