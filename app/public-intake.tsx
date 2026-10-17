'use client';
// Vstupní dotazník pro klientku přes tajný odkaz (/dotaznik?t=…): zdravotní otázky, souhlas a podpis prstem.
import {useEffect, useImperativeHandle, useRef, useState} from 'react';
import {ClipboardCheck, Eraser} from 'lucide-react';
import {logoSrc} from './logo';
import {TRUTH_CONFIRMATION, type IntakeQuestion} from '../lib/intake';

type Salon = {name: string; phone: string; logoVersion: number};
type Data = {done?: boolean; salon: Salon; person?: {name: string; phone: string; email: string}; questions?: IntakeQuestion[]; consentText?: string; photoConsent?: string};
type Answer = {yes?: boolean; detail: string};

export default function PublicIntake({token}: {token: string}) {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [sent, setSent] = useState(false), [busy, setBusy] = useState(false);
  const [person, setPerson] = useState({name: '', phone: '', email: '', birthDate: ''}), [answers, setAnswers] = useState<Record<string, Answer>>({}), [other, setOther] = useState('');
  const [consentHealth, setConsentHealth] = useState(false), [consentPhotos, setConsentPhotos] = useState(false), [truth, setTruth] = useState(false), [signedName, setSignedName] = useState('');
  const pad = useRef<SignaturePadHandle>(null);
  useEffect(() => {
    fetch('/api/public?intake=' + encodeURIComponent(token), {cache: 'no-store'}).then(async r => {
      const d = await r.json() as Data & {error?: string};
      if (!r.ok) throw new Error(d.error || 'Dotazník se nepodařilo načíst.');
      setData(d); if (d.person) { setPerson(p => ({...p, ...d.person})); setSignedName(d.person.name); }
    }).catch(e => setError((e as Error).message));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const missing = data?.questions?.find(q => answers[q.id]?.yes === undefined);
    if (missing) { setError('Odpovězte prosím na všechny otázky (ano nebo ne).'); document.getElementById('q-' + missing.id)?.scrollIntoView({block: 'center', behavior: 'smooth'}); return; }
    const signature = pad.current?.image();
    if (!signature) { setError('Podepište se prosím prstem nebo myší do rámečku.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/public', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'intake', token, ...person,
        answers: {...answers, other: {yes: !!other.trim(), detail: other}}, consentHealth, consentPhotos, truth, signedName, signature})});
      const d = await r.json() as {error?: string};
      if (!r.ok) throw new Error(d.error || 'Dotazník se nepodařilo odeslat.');
      setSent(true); window.scrollTo(0, 0);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  const salon = data?.salon;
  return <div className="public-booking">
    <header className="pb-header"><img className="brand-logo" src={logoSrc(salon?.logoVersion)} alt="" width={56} height={56}/><div><b>{salon?.name.toLocaleUpperCase('cs') || ' '}</b><span>VSTUPNÍ DOTAZNÍK</span></div></header>
    <main className="pb-main">
      {sent || data?.done ? <section className="pb-done"><ClipboardCheck size={44} strokeWidth={1.4}/><h1>{sent ? 'Děkujeme, dotazník je odeslaný' : 'Dotazník už je vyplněný'}</h1>
        <p className="pb-muted">Údaje máme uložené ve Vaší kartě. Pokud se Váš zdravotní stav změní, řekněte nám to prosím před dalším ošetřením.</p></section>
      : !data ? (error ? <p className="error" role="alert">{error}</p> : <p className="pb-muted">Načítám dotazník…</p>)
      : <form className="intake-form" onSubmit={submit}>
        <p className="pb-muted">Aby bylo ošetření bezpečné, potřebujeme vědět pár věcí o Vašem zdraví. Vyplnění zabere asi 3 minuty. Odpovědi uvidí jen kosmetička ve Vaší kartě.</p>
        <section className="intake-block"><h2>Vaše údaje</h2>
          <div className="field-grid">
            <label className="field"><span>Jméno a příjmení</span><input required maxLength={120} autoComplete="name" value={person.name} onChange={e => setPerson({...person, name: e.target.value})}/></label>
            <label className="field"><span>Datum narození</span><input type="date" max={new Date().toISOString().slice(0, 10)} value={person.birthDate} onChange={e => setPerson({...person, birthDate: e.target.value})}/></label>
            <label className="field"><span>Telefon</span><input type="tel" maxLength={40} autoComplete="tel" value={person.phone} onChange={e => setPerson({...person, phone: e.target.value})}/></label>
            <label className="field"><span>E-mail</span><input type="email" maxLength={200} autoComplete="email" value={person.email} onChange={e => setPerson({...person, email: e.target.value})}/></label>
          </div>
        </section>
        <section className="intake-block"><h2>Zdravotní stav</h2>
          {data.questions!.map(q => { const a = answers[q.id]; return <fieldset key={q.id} id={'q-' + q.id} className={'intake-q' + (a?.yes ? ' yes' : '')}>
            <legend>{q.text}</legend>
            <div className="intake-yesno">
              <label><input type="radio" name={q.id} checked={a?.yes === false} onChange={() => setAnswers({...answers, [q.id]: {yes: false, detail: ''}})}/> Ne</label>
              <label><input type="radio" name={q.id} checked={a?.yes === true} onChange={() => setAnswers({...answers, [q.id]: {yes: true, detail: a?.detail || ''}})}/> Ano</label>
            </div>
            {a?.yes && q.detail && <input aria-label={q.detail} placeholder={q.detail} maxLength={500} value={a.detail} onChange={e => setAnswers({...answers, [q.id]: {yes: true, detail: e.target.value}})}/>}
          </fieldset>; })}
          <label className="field"><span>Ještě něco, co je dobré vědět? (nepovinné)</span><textarea rows={2} maxLength={1000} value={other} onChange={e => setOther(e.target.value)}/></label>
        </section>
        <section className="intake-block"><h2>Souhlas se zpracováním údajů</h2>
          <div className="intake-consent">{data.consentText!.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}</div>
          <label className="check"><input type="checkbox" checked={consentHealth} onChange={e => setConsentHealth(e.target.checked)}/> Souhlasím se zpracováním svých osobních údajů a údajů o zdraví podle textu výše.</label>
          <label className="check"><input type="checkbox" checked={consentPhotos} onChange={e => setConsentPhotos(e.target.checked)}/> {data.photoConsent} (nepovinné)</label>
          <label className="check"><input type="checkbox" checked={truth} onChange={e => setTruth(e.target.checked)}/> {TRUTH_CONFIRMATION}</label>
        </section>
        <section className="intake-block"><h2>Podpis</h2>
          <SignaturePad ref={pad}/>
          <label className="field"><span>Jméno pod podpis</span><input required maxLength={120} value={signedName} onChange={e => setSignedName(e.target.value)}/></label>
        </section>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="pb-actions"><button className="primary" disabled={busy || !consentHealth || !truth}>{busy ? 'Odesílám…' : 'Odeslat dotazník'}</button></div>
        {!consentHealth && <p className="pb-muted">Bez souhlasu se zpracováním údajů dotazník odeslat nejde. Pokud nesouhlasíte, domluvíme se osobně v salonu{salon?.phone ? ` (tel. ${salon.phone})` : ''}.</p>}
      </form>}
    </main>
  </div>;
}

type SignaturePadHandle = {image: () => string | null};
/** Rámeček na podpis prstem, stylusem nebo myší; vrací PNG, nebo null, když je prázdný. */
function SignaturePad({ref}: {ref: React.Ref<SignaturePadHandle>}) {
  const canvas = useRef<HTMLCanvasElement>(null), drawn = useRef(0), last = useRef<{x: number; y: number} | null>(null);
  useEffect(() => {
    const c = canvas.current!, ratio = window.devicePixelRatio || 1, box = c.getBoundingClientRect();
    c.width = box.width * ratio; c.height = box.height * ratio;
    const g = c.getContext('2d')!; g.scale(ratio, ratio); g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#1d2a3a';
  }, []);
  const point = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; };
  const clear = () => { const c = canvas.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); drawn.current = 0; };
  useImperativeHandle(ref, () => ({image: () => drawn.current > 20 ? canvas.current!.toDataURL('image/png') : null}), []);
  return <div className="signature">
    <canvas ref={canvas} aria-label="Rámeček na podpis" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); last.current = point(e); }}
      onPointerMove={e => { if (!last.current) return; const p = point(e), g = canvas.current!.getContext('2d')!; g.beginPath(); g.moveTo(last.current.x, last.current.y); g.lineTo(p.x, p.y); g.stroke(); drawn.current += Math.hypot(p.x - last.current.x, p.y - last.current.y); last.current = p; }}
      onPointerUp={() => { last.current = null; }} onPointerCancel={() => { last.current = null; }}/>
    <button type="button" className="secondary" onClick={clear}><Eraser size={15}/> Smazat podpis</button>
  </div>;
}
