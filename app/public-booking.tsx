'use client';
import {useEffect, useState} from 'react';
import {CalendarCheck, ChevronLeft, ChevronRight, Clock, Flower2} from 'lucide-react';
import {addDays, salonNow} from '../lib/booking';
import {formatRevenue} from '../lib/revenue';

type Service = {id: string; name: string; durationMin: number; priceCents: number};
const dayLabel = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('cs-CZ', {weekday: 'short', day: 'numeric', month: 'numeric'});
const longDate = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('cs-CZ', {weekday: 'long', day: 'numeric', month: 'long'});

export default function PublicBooking() {
  const today = salonNow().slice(0, 10);
  const [services, setServices] = useState<Service[] | null>(null), [horizon, setHorizon] = useState(60);
  const [service, setService] = useState<Service | null>(null), [from, setFrom] = useState(today);
  const [days, setDays] = useState<Record<string, string[]> | null>(null), [date, setDate] = useState(''), [time, setTime] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState<{start: string; service: string} | null>(null);

  useEffect(() => { fetch('/api/public', {cache: 'no-store'}).then(r => r.json() as Promise<{services?: Service[]; horizonDays?: number; error?: string}>).then(d => { if (!d.services) throw new Error(d.error); setServices(d.services); setHorizon(d.horizonDays || 60); }).catch(() => setError('Rezervace se nepodařilo načíst. Zkuste to prosím později.')); }, []);
  useEffect(() => {
    if (!service) return; setDays(null);
    fetch(`/api/public?serviceId=${encodeURIComponent(service.id)}&from=${from}&days=7`, {cache: 'no-store'}).then(r => r.json() as Promise<{days?: Record<string, string[]>; error?: string}>).then(d => {
      if (!d.days) throw new Error(d.error); setDays(d.days);
      if (!date || !d.days[date]) { const first = Object.keys(d.days).find(k => d.days![k].length); setDate(first || Object.keys(d.days)[0]); setTime(''); }
    }).catch(e => setError((e as Error).message || 'Termíny se nepodařilo načíst.'));
  }, [service, from]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!service) return; setBusy(true); setError('');
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const r = await fetch('/api/public', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...f, consent: f.consent === 'on', serviceId: service.id, date, time})});
      const d = await r.json() as {error?: string; start?: string; service?: string};
      if (!r.ok) { if (r.status === 409) { setTime(''); setService({...service}); } throw new Error(d.error); }
      setDone({start: d.start || `${date}T${time}`, service: d.service || service.name});
    } catch (err) { setError((err as Error).message || 'Rezervaci se nepodařilo odeslat.'); } finally { setBusy(false); }
  }

  return <div className="public-booking">
    <header className="pb-header"><span className="brand-mark"><Flower2 size={24}/></span><div><b>STUDIO I AM</b><span>ONLINE REZERVACE</span></div></header>
    <main className="pb-main">
      {done ? <section className="pb-done"><CalendarCheck size={44} strokeWidth={1.4}/><h1>Termín je rezervovaný</h1>
        <p><b>{done.service}</b><br/>{longDate(done.start.slice(0, 10))} v {done.start.slice(11)}</p>
        <p className="pb-muted">Těšíme se na vás. Kdybyste se nemohla dostavit, dejte nám prosím včas vědět.</p>
        <button className="secondary" onClick={() => { setDone(null); setService(null); setDate(''); setTime(''); }}>Rezervovat další termín</button></section>
      : <>
        <ol className="pb-steps" aria-label="Postup rezervace"><li className={!service ? 'active' : 'done'}>Ošetření</li><li className={service && !time ? 'active' : time ? 'done' : ''}>Termín</li><li className={time ? 'active' : ''}>Kontakt</li></ol>
        {error && <p className="error" role="alert">{error}</p>}
        {!service ? <section><h1>Vyberte ošetření</h1>
          {!services ? <p className="pb-muted">Načítám nabídku…</p> : !services.length ? <p className="pb-muted">Online rezervace teď není k dispozici. Zavolejte nám prosím.</p> :
          <div className="pb-services">{services.map(s => <button key={s.id} className="pb-service" onClick={() => { setService(s); setFrom(today); setDate(''); setError(''); }}><b>{s.name}</b><span><Clock size={14}/> {s.durationMin} min</span><strong>{formatRevenue(s.priceCents)}</strong></button>)}</div>}
        </section> : !time ? <section>
          <button className="pb-back" onClick={() => setService(null)}><ChevronLeft size={16}/> Jiné ošetření</button>
          <h1>{service.name}</h1><p className="pb-muted">{service.durationMin} min · {formatRevenue(service.priceCents)}</p>
          <div className="pb-week"><button className="secondary" aria-label="Předchozí týden" disabled={from <= today} onClick={() => setFrom(addDays(from, -7))}><ChevronLeft size={18}/></button>
            <div className="pb-days">{days ? Object.entries(days).map(([d, slots]) => <button key={d} className={'pb-day ' + (d === date ? 'active' : '')} disabled={!slots.length} onClick={() => setDate(d)}><span>{dayLabel(d)}</span><small>{slots.length ? `${slots.length} volných` : 'plno'}</small></button>) : <p className="pb-muted">Hledám volné termíny…</p>}</div>
            <button className="secondary" aria-label="Další týden" disabled={addDays(from, 7) > addDays(today, horizon)} onClick={() => setFrom(addDays(from, 7))}><ChevronRight size={18}/></button></div>
          {days && date && <div className="pb-slots">{days[date]?.length ? days[date].map(t => <button key={t} className="pb-slot" onClick={() => setTime(t)}>{t}</button>) : <p className="pb-muted">Tento týden už nejsou volné termíny. Zkuste další týden.</p>}</div>}
        </section> : <section>
          <button className="pb-back" onClick={() => setTime('')}><ChevronLeft size={16}/> Jiný termín</button>
          <h1>Vaše údaje</h1><p className="pb-summary"><b>{service.name}</b><br/>{longDate(date)} v {time} · {service.durationMin} min · {formatRevenue(service.priceCents)}</p>
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
