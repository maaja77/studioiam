'use client';
import {useEffect, useState} from 'react';
import {CalendarCheck, ChevronLeft, ChevronRight, Clock, Flower2} from 'lucide-react';
import {addDays, salonNow} from '../lib/booking';
import {formatRevenue} from '../lib/revenue';
import {PaymentDetails, type DepositInfo} from './qr-payment';

type Service = {id: string; name: string; durationMin: number; priceCents: number; depositCents?: number | null};
const dayLabel = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('cs-CZ', {weekday: 'short', day: 'numeric', month: 'numeric'});
const longDate = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('cs-CZ', {weekday: 'long', day: 'numeric', month: 'long'});

export default function PublicBooking() {
  const [services, setServices] = useState<Service[] | null>(null), [horizon, setHorizon] = useState(60);
  const [service, setService] = useState<Service | null>(null), [reload, setReload] = useState(0);
  const [date, setDate] = useState(''), [time, setTime] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState<{start: string; service: string; deposit?: DepositInfo | null; token?: string} | null>(null);
  const [token, setToken] = useState(() => typeof location === 'undefined' ? '' : new URLSearchParams(location.search).get('t') || '');

  useEffect(() => { fetch('/api/public', {cache: 'no-store'}).then(r => r.json() as Promise<{services?: Service[]; horizonDays?: number; error?: string}>).then(d => { if (!d.services) throw new Error(d.error); setServices(d.services); setHorizon(d.horizonDays || 60); }).catch(() => setError('Rezervace se nepodařilo načíst. Zkuste to prosím později.')); }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!service) return; setBusy(true); setError('');
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const r = await fetch('/api/public', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...f, consent: f.consent === 'on', serviceId: service.id, date, time})});
      const d = await r.json() as {error?: string; start?: string; service?: string; deposit?: DepositInfo | null; token?: string};
      if (!r.ok) { if (r.status === 409) { setTime(''); setReload(n => n + 1); } throw new Error(d.error); }
      setDone({start: d.start || `${date}T${time}`, service: d.service || service.name, deposit: d.deposit, token: d.token});
    } catch (err) { setError((err as Error).message || 'Rezervaci se nepodařilo odeslat.'); } finally { setBusy(false); }
  }

  function openManage(t: string) {
    try { history.replaceState(null, '', '?t=' + t); } catch { /* náhled bez adresy */ }
    setToken(t);
  }
  function leaveManage() {
    try { history.replaceState(null, '', location.pathname); } catch { /* náhled bez adresy */ }
    setToken(''); setDone(null); setService(null); setDate(''); setTime('');
  }

  return <div className="public-booking">
    <header className="pb-header"><span className="brand-mark"><Flower2 size={24}/></span><div><b>STUDIO I AM</b><span>ONLINE REZERVACE</span></div></header>
    <main className="pb-main">
      {token ? <ManageBooking token={token} horizon={horizon} onLeave={leaveManage}/>
      : done ? <section className="pb-done"><CalendarCheck size={44} strokeWidth={1.4}/><h1>{done.deposit ? 'Termín držíme, čeká na kauci' : 'Termín je rezervovaný'}</h1>
        <p><b>{done.service}</b><br/>{longDate(done.start.slice(0, 10))} v {done.start.slice(11)}</p>
        {done.deposit ? <>
          <p className="pb-muted">U tohoto ošetření prosíme o kauci, která se odečte z ceny. Zaplaťte ji QR kódem v bankovní aplikaci nebo převodem. Pokud kauce nedorazí do uvedeného času, termín se uvolní.</p>
          <PaymentDetails deposit={done.deposit}/>
        </> : <p className="pb-muted">Těšíme se na vás.</p>}
        {done.token && <p className="pb-muted">Termín můžete sama zrušit nebo přesunout přes odkaz níže (pokud jste vyplnila e-mail, pošleme vám ho i tam).</p>}
        <div className="pb-actions">{done.token && <button className="primary" onClick={() => openManage(done.token!)}>Zrušit nebo změnit termín</button>}
        <button className="secondary" onClick={() => { setDone(null); setService(null); setDate(''); setTime(''); }}>Rezervovat další termín</button></div></section>
      : <>
        <ol className="pb-steps" aria-label="Postup rezervace"><li className={!service ? 'active' : 'done'}>Ošetření</li><li className={service && !time ? 'active' : time ? 'done' : ''}>Termín</li><li className={time ? 'active' : ''}>Kontakt</li></ol>
        {error && <p className="error" role="alert">{error}</p>}
        {!service ? <section><h1>Vyberte ošetření</h1>
          {!services ? <p className="pb-muted">Načítám nabídku…</p> : !services.length ? <p className="pb-muted">Online rezervace teď není k dispozici. Zavolejte nám prosím.</p> :
          <div className="pb-services">{services.map(s => <button key={s.id} className="pb-service" onClick={() => { setService(s); setDate(''); setError(''); }}><b>{s.name}</b><span><Clock size={14}/> {s.durationMin} min</span><strong>{formatRevenue(s.priceCents)}</strong>{s.depositCents ? <small className="pb-deposit">kauce {formatRevenue(s.depositCents)}</small> : null}</button>)}</div>}
        </section> : !time ? <section>
          <button className="pb-back" onClick={() => setService(null)}><ChevronLeft size={16}/> Jiné ošetření</button>
          <h1>{service.name}</h1><p className="pb-muted">{service.durationMin} min · {formatRevenue(service.priceCents)}</p>
          <SlotPicker key={service.id + reload} query={`serviceId=${encodeURIComponent(service.id)}`} horizon={horizon} onPick={(d, t) => { setDate(d); setTime(t); }} onError={setError}/>
        </section> : <section>
          <button className="pb-back" onClick={() => setTime('')}><ChevronLeft size={16}/> Jiný termín</button>
          <h1>Vaše údaje</h1><p className="pb-summary"><b>{service.name}</b><br/>{longDate(date)} v {time} · {service.durationMin} min · {formatRevenue(service.priceCents)}{service.depositCents ? <><br/>Po rezervaci zaplatíte kauci {formatRevenue(service.depositCents)}, odečte se z ceny.</> : null}</p>
          <form className="pb-form" onSubmit={submit}>
            <label className="field"><span>Jméno a příjmení *</span><input name="name" required maxLength={120} autoComplete="name"/></label>
            <div className="field-grid"><label className="field"><span>Telefon *</span><input name="phone" type="tel" required maxLength={40} autoComplete="tel"/></label><label className="field"><span>E-mail</span><input name="email" type="email" maxLength={200} autoComplete="email"/></label></div>
            <label className="field"><span>Poznámka</span><textarea name="note" rows={3} maxLength={1000} placeholder="Například alergie nebo přání k ošetření"/></label>
            <label className="pb-hidden" aria-hidden="true">Web<input name="website" tabIndex={-1} autoComplete="off"/></label>
            <label className="check"><input type="checkbox" name="consent" required/> Souhlasím se zpracováním osobních údajů pro účely rezervace.</label>
            <button className="primary" disabled={busy}>{busy ? 'Odesílám…' : 'Rezervovat termín'}</button>
          </form>
        </section>}
      </>}
    </main>
    <footer className="pb-footer">Studio I AM · Nerudova 884/11, Hradec Králové · tel. 775 963 462</footer>
  </div>;
}

/** Výběr dne a času po týdnech; `query` určuje ošetření nebo přesouvanou rezervaci. */
function SlotPicker({query, horizon, onPick, onError}: {query: string; horizon: number; onPick: (date: string, time: string) => void; onError: (message: string) => void}) {
  const today = salonNow().slice(0, 10);
  const [from, setFrom] = useState(today), [days, setDays] = useState<Record<string, string[]> | null>(null), [date, setDate] = useState('');
  useEffect(() => {
    setDays(null);
    fetch(`/api/public?${query}&from=${from}&days=7`, {cache: 'no-store'}).then(r => r.json() as Promise<{days?: Record<string, string[]>; error?: string}>).then(d => {
      if (!d.days) throw new Error(d.error); setDays(d.days);
      setDate(current => d.days![current] ? current : Object.keys(d.days!).find(k => d.days![k].length) || Object.keys(d.days!)[0]);
    }).catch(e => onError((e as Error).message || 'Termíny se nepodařilo načíst.'));
  }, [query, from]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>
    <div className="pb-week"><button className="secondary" aria-label="Předchozí týden" disabled={from <= today} onClick={() => setFrom(addDays(from, -7))}><ChevronLeft size={18}/></button>
      <div className="pb-days">{days ? Object.entries(days).map(([d, slots]) => <button key={d} className={'pb-day ' + (d === date ? 'active' : '')} disabled={!slots.length} onClick={() => setDate(d)}><span>{dayLabel(d)}</span><small>{slots.length ? `${slots.length} volných` : 'plno'}</small></button>) : <p className="pb-muted">Hledám volné termíny…</p>}</div>
      <button className="secondary" aria-label="Další týden" disabled={addDays(from, 7) > addDays(today, horizon)} onClick={() => setFrom(addDays(from, 7))}><ChevronRight size={18}/></button></div>
    {days && date && <div className="pb-slots">{days[date]?.length ? days[date].map(t => <button key={t} className="pb-slot" onClick={() => onPick(date, t)}>{t}</button>) : <p className="pb-muted">Tento týden už nejsou volné termíny. Zkuste další týden.</p>}</div>}
  </>;
}

type Managed = {start: string; end: string; service: string; status: string; durationMin: number; canChange: boolean; limitHours: number; deposit: DepositInfo | null};

/** Správa vlastní rezervace přes tajný odkaz: zrušení nebo přesun nejpozději v nastavené lhůtě předem. */
function ManageBooking({token, horizon, onLeave}: {token: string; horizon: number; onLeave: () => void}) {
  const [booking, setBooking] = useState<Managed | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'view' | 'move' | 'cancel'>('view'), [picked, setPicked] = useState<{date: string; time: string} | null>(null), [message, setMessage] = useState('');
  useEffect(() => {
    fetch(`/api/public?token=${encodeURIComponent(token)}`, {cache: 'no-store'}).then(r => r.json() as Promise<{booking?: Managed; error?: string}>)
      .then(d => { if (!d.booking) throw new Error(d.error); setBooking(d.booking); }).catch(e => setError((e as Error).message || 'Rezervaci se nepodařilo načíst.'));
  }, [token]);

  async function send(action: 'cancel' | 'move') {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/public', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, token, ...picked})});
      const d = await r.json() as {booking?: Managed; error?: string};
      if (!r.ok || !d.booking) throw new Error(d.error);
      setBooking(d.booking); setMode('view'); setPicked(null);
      setMessage(action === 'cancel' ? 'Termín jsme zrušili. Děkujeme, že jste nám dala vědět.' : 'Termín jsme přesunuli. Těšíme se na vás.');
    } catch (e) { setError((e as Error).message || 'Změnu se nepodařilo uložit.'); if (action === 'move') setPicked(null); } finally { setBusy(false); }
  }

  if (!booking) return <section className="pb-done">{error ? <><p className="error" role="alert">{error}</p><button className="secondary" onClick={onLeave}>Nová rezervace</button></> : <p className="pb-muted">Načítám rezervaci…</p>}</section>;
  const cancelled = booking.status === 'cancelled';
  return <section className="pb-manage">
    <h1>{cancelled ? 'Termín je zrušený' : 'Vaše rezervace'}</h1>
    {message && <p className="pb-ok" role="status">{message}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <p className="pb-summary"><b>{booking.service}</b><br/>{longDate(booking.start.slice(0, 10))} v {booking.start.slice(11)} · {booking.durationMin} min{booking.status === 'pending' && <><br/>Termín čeká na zaplacení kauce.</>}</p>
    {booking.deposit && !cancelled && mode === 'view' && <PaymentDetails deposit={booking.deposit}/>}
    {cancelled ? <button className="primary" onClick={onLeave}>Rezervovat nový termín</button>
    : !booking.canChange ? <p className="pb-muted">Online lze termín zrušit nebo změnit nejpozději {booking.limitHours} hodin předem. Teď nám prosím zavolejte na 775 963 462.</p>
    : mode === 'cancel' ? <div className="pb-confirm"><p>Opravdu chcete termín zrušit?</p><div className="pb-actions"><button className="danger" disabled={busy} onClick={() => send('cancel')}>{busy ? 'Ruším…' : 'Ano, zrušit termín'}</button><button className="secondary" onClick={() => setMode('view')}>Ponechat termín</button></div></div>
    : mode === 'move' ? <>
      <button className="pb-back" onClick={() => { setMode('view'); setPicked(null); }}><ChevronLeft size={16}/> Zpět</button>
      {picked ? <div className="pb-confirm"><p>Přesunout na <b>{longDate(picked.date)} v {picked.time}</b>?</p><div className="pb-actions"><button className="primary" disabled={busy} onClick={() => send('move')}>{busy ? 'Ukládám…' : 'Ano, přesunout'}</button><button className="secondary" onClick={() => setPicked(null)}>Vybrat jiný čas</button></div></div>
      : <><h2>Vyberte nový termín</h2><SlotPicker query={`token=${encodeURIComponent(token)}`} horizon={horizon} onPick={(date, time) => setPicked({date, time})} onError={setError}/></>}
    </>
    : <><p className="pb-muted">Zrušit nebo změnit termín můžete nejpozději {booking.limitHours} hodin předem.</p>
      <div className="pb-actions"><button className="primary" onClick={() => { setMode('move'); setMessage(''); }}>Změnit termín</button><button className="secondary" onClick={() => { setMode('cancel'); setMessage(''); }}>Zrušit termín</button></div></>}
  </section>;
}
