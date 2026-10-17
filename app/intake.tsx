'use client';
// Vstupní dotazník na kartě klientky: poslat odkaz, vyplnit v salonu, zdravotní upozornění a souhlas.
import {useEffect, useState} from 'react';
import {AlertTriangle, ClipboardList, Copy, ExternalLink, Mail, MessageSquare} from 'lucide-react';
import {INTAKE_QUESTIONS, intakeWarnings, type IntakeForm} from '../lib/intake';

type Form = IntakeForm & {link: string};
const dateText = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('cs-CZ', {day: 'numeric', month: 'numeric', year: 'numeric'}) : '';

async function post(action: string, data: Record<string, unknown>) {
  const r = await fetch('/api/intake', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, data})});
  const d = await r.json() as {error?: string; link?: string};
  if (!r.ok) throw new Error(d.error || 'Změnu se nepodařilo uložit.');
  return d;
}

export default function IntakePanel({client}: {client: {id: string; name: string; phone: string; email: string}}) {
  const [forms, setForms] = useState<Form[] | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false);
  async function load() {
    try {
      const r = await fetch('/api/intake?clientId=' + encodeURIComponent(client.id), {cache: 'no-store'});
      const d = await r.json() as {forms?: Form[]; error?: string};
      if (!r.ok || !d.forms) throw new Error(d.error); setForms(d.forms);
    } catch (e) { setError((e as Error).message || 'Dotazník se nepodařilo načíst.'); }
  }
  useEffect(() => { load(); }, [client.id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function run(action: string, data: Record<string, unknown>) {
    setBusy(true); setError(''); setCopied(false);
    try { await post(action, data); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!forms) return error ? <p className="error" role="alert">{error}</p> : null;
  const current = forms[0], done = forms.find(f => f.status === 'done'), pending = current?.status === 'sent' ? current : null;
  const warnings = intakeWarnings(done?.answers ?? null), message = pending ? `Dobrý den, před ošetřením prosím vyplňte krátký zdravotní dotazník: ${pending.link}` : '';
  const phone = client.phone.replace(/[^\d+]/g, '');

  return <section className="intake-panel">
    <div className="intake-head"><h3><ClipboardList size={17}/> Vstupní dotazník a souhlas</h3>
      {done ? <span className="intake-state ok">Vyplněno {dateText(done.submittedAt)}</span> : current?.status === 'withdrawn' ? <span className="intake-state off">Souhlas odvolán {dateText(current.withdrawnAt)}</span> : <span className="intake-state">{pending ? 'Čeká na vyplnění' : 'Zatím nevyplněno'}</span>}
    </div>
    {done && <>
      {warnings.length ? <ul className="intake-warnings">{warnings.map(w => <li key={w.id}><AlertTriangle size={15}/><span>{w.text}{w.detail && <b> {w.detail}</b>}</span></li>)}</ul> : <p className="muted-inline">Bez zdravotních upozornění.</p>}
      <p className="muted-inline">{done.consentPhotos ? 'Souhlasí s fotografiemi do karty.' : 'Nesouhlasí s fotografiemi, nefoťte ji.'}{done.birthDate && ` · Narozena ${dateText(done.birthDate)}`}</p>
      <details className="intake-details"><summary>Všechny odpovědi, podpis a text souhlasu</summary>
        <ul>{INTAKE_QUESTIONS.map(q => <li key={q.id}>{q.text} <b>{done.answers?.[q.id]?.yes ? 'Ano' : 'Ne'}</b>{done.answers?.[q.id]?.detail && ` (${done.answers[q.id].detail})`}</li>)}</ul>
        {done.signature && <figure><img src={done.signature} alt={'Podpis ' + done.signedName}/><figcaption>{done.signedName}, {new Date(done.submittedAt!).toLocaleString('cs-CZ')}</figcaption></figure>}
        <div className="intake-consent">{done.consentText.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}</div>
        <button type="button" className="link-button" disabled={busy} onClick={() => { if (window.confirm('Klientka odvolala souhlas? Odpovědi o zdraví se smažou, podpis zůstane jako doklad.')) run('withdraw', {id: done.id}); }}>Klientka odvolala souhlas</button>
      </details>
    </>}
    {pending ? <div className="intake-send">
      <p className="muted-inline">Odkaz pro klientku (platí do vyplnění):</p>
      <div className="intake-actions">
        <a className="primary" href={pending.link} target="_blank" rel="noreferrer"><ExternalLink size={15}/> Vyplnit teď v salonu</a>
        {phone && <a className="secondary" href={`sms:${phone}?&body=${encodeURIComponent(message)}`}><MessageSquare size={15}/> SMS</a>}
        {client.email && <a className="secondary" href={`mailto:${client.email}?subject=${encodeURIComponent('Dotazník před ošetřením')}&body=${encodeURIComponent(message)}`}><Mail size={15}/> E-mail</a>}
        <button type="button" className="secondary" onClick={() => navigator.clipboard.writeText(pending.link).then(() => setCopied(true), () => setCopied(false))}><Copy size={15}/> {copied ? 'Zkopírováno' : 'Kopírovat odkaz'}</button>
        <button type="button" className="link-button" disabled={busy} onClick={() => run('delete', {id: pending.id})}>Zrušit odkaz</button>
      </div>
    </div> : <div className="intake-actions"><button type="button" className="secondary" disabled={busy} onClick={() => run('create', {clientId: client.id})}>{done ? 'Nový dotazník (aktualizace)' : 'Připravit dotazník'}</button></div>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
