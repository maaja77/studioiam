'use client';
import {useEffect, useState} from 'react';
import {CalendarCheck, Camera, ChevronLeft, ChevronRight, Clock, Search, X} from 'lucide-react';
import {addDays, salonNow} from '../lib/booking';
import {formatRevenue} from '../lib/revenue';
import {PaymentDetails, type DepositInfo} from './qr-payment';
import {coverSrc, logoSrc} from './logo';

type Salon = {name: string; address: string; phone: string; businessId: string; logoVersion: number; coverVersion?: number; notice?: string; forfeitHours?: number};
type Service = {id: string; name: string; durationMin: number; priceCents: number; category?: string; description?: string; depositCents?: number | null; newDepositCents?: number | null; sessions?: number; prepay?: boolean; photo?: number};
const fold = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const length = (min: number) => min % 60 === 0 ? `${min / 60} h` : min > 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
const price = (cents: number) => cents ? formatRevenue(cents) : 'cena po konzultaci';
const dayLabel = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('cs-CZ', {weekday: 'short', day: 'numeric', month: 'numeric'});
const longDate = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('cs-CZ', {weekday: 'long', day: 'numeric', month: 'long'});

export default function PublicBooking() {
  const [services, setServices] = useState<Service[] | null>(null), [horizon, setHorizon] = useState(60), [salon, setSalon] = useState<Salon | null>(null);
  const [service, setService] = useState<Service | null>(null), [reload, setReload] = useState(0);
  const [date, setDate] = useState(''), [time, setTime] = useState(''), [query, setQuery] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState<{start: string; service: string; deposit?: DepositInfo | null; token?: string; intake?: string} | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [token, setToken] = useState(() => typeof location === 'undefined' ? '' : new URLSearchParams(location.search).get('t') || '');

  useEffect(() => { fetch('/api/public', {cache: 'no-store'}).then(r => r.json() as Promise<{services?: Service[]; horizonDays?: number; salon?: Salon; error?: string}>).then(d => { if (!d.services) throw new Error(d.error); setServices(d.services); setHorizon(d.horizonDays || 60); if (d.salon) { setSalon(d.salon); document.title = 'Rezervace · ' + d.salon.name; } }).catch(() => setError('Rezervace se nepodařilo načíst. Zkuste to prosím později.')); }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!service) return;
    if (service.photo === 2 && !photos.length) { setError('U tohoto ošetření prosíme o fotku. Přidejte ji prosím.'); return; }
    setBusy(true); setError('');
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const r = await fetch('/api/public', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...f, consent: f.consent === 'on', serviceId: service.id, date, time, photos})});
      const d = await r.json() as {error?: string; start?: string; service?: string; deposit?: DepositInfo | null; token?: string; intake?: string};
      if (!r.ok) { if (r.status === 409) { setTime(''); setReload(n => n + 1); } throw new Error(d.error); }
      setDone({start: d.start || `${date}T${time}`, service: d.service || service.name, deposit: d.deposit, token: d.token, intake: d.intake}); setPhotos([]);
    } catch (err) { setError((err as Error).message || 'Rezervaci se nepodařilo odeslat.'); } finally { setBusy(false); }
  }

  const q = fold(query.trim());
  const groups = [...(services || []).filter(x => !q || fold(x.name + ' ' + (x.category || '') + ' ' + (x.description || '')).includes(q))
    .reduce((m, x) => m.set(x.category || '', [...(m.get(x.category || '') || []), x]), new Map<string, Service[]>())];
  function openManage(t: string) {
    try { history.replaceState(null, '', '?t=' + t); } catch { /* náhled bez adresy */ }
    setToken(t);
  }
  function leaveManage() {
    try { history.replaceState(null, '', location.pathname); } catch { /* náhled bez adresy */ }
    setToken(''); setDone(null); setService(null); setDate(''); setTime('');
  }

  return <div className="public-booking">
    <header className="pb-header"><img className="brand-logo" src={logoSrc(salon?.logoVersion)} alt="" width={56} height={56}/><div><b>{salon?.name.toLocaleUpperCase('cs') || '\u00a0'}</b><span>ONLINE REZERVACE</span></div></header>
    {!!salon?.coverVersion && !token && !done && <div className="pb-cover"><img src={coverSrc(salon.coverVersion)} alt={'Salon ' + salon.name}/></div>}
    <main className="pb-main">
      {!!salon?.notice && !token && !done && <p className="pb-notice" role="note">{salon.notice}</p>}
      {token ? <ManageBooking token={token} horizon={horizon} phone={salon?.phone || ''} onLeave={leaveManage}/>
      : done ? <section className="pb-done"><CalendarCheck size={44} strokeWidth={1.4}/><h1>{done.deposit ? (done.deposit.kind === 'prepay' ? 'Termín držíme, čeká na platbu' : 'Termín držíme, čeká na kauci') : 'Termín je rezervovaný'}</h1>
        <p><b>{done.service}</b><br/>{longDate(done.start.slice(0, 10))} v {done.start.slice(11)}</p>
        {done.deposit ? <>
          <p className="pb-muted">{done.deposit.kind === 'prepay' ? 'Balíčky a programy se platí předem. Zaplaťte prosím celou částku QR kódem v bankovní aplikaci nebo převodem. Pokud platba nedorazí do uvedeného času, termín se uvolní.' : 'U tohoto ošetření prosíme o kauci, která se odečte z ceny. Zaplaťte ji QR kódem v bankovní aplikaci nebo převodem. Pokud kauce nedorazí do uvedeného času, termín se uvolní.'}</p>
          <PaymentDetails deposit={done.deposit}/>
          {done.deposit.kind === 'deposit' && !!salon?.forfeitHours && <p className="pb-muted pb-forfeit">Kauce propadá, pokud termín zrušíte méně než {salon.forfeitHours} h předem nebo nepřijdete.</p>}
        </> : <p className="pb-muted">Těšíme se na vás.</p>}
        {done.token && <p className="pb-muted">Termín můžete sama zrušit nebo přesunout přes odkaz níže (pokud jste vyplnila e-mail, pošleme vám ho i tam).</p>}
        {done.intake && <div className="pb-intake"><p><b>Před první návštěvou prosím vyplňte krátký zdravotní dotazník.</b> Zabere asi 3 minuty a ošetření pak bude bezpečné a rychlejší.</p><a className="primary" href={done.intake}>Vyplnit dotazník</a></div>}
        <div className="pb-actions">{done.token && <button className={done.intake ? 'secondary' : 'primary'} onClick={() => openManage(done.token!)}>Zrušit nebo změnit termín</button>}
        <button className="secondary" onClick={() => { setDone(null); setService(null); setDate(''); setTime(''); }}>Rezervovat další termín</button></div></section>
      : <>
        <ol className="pb-steps" aria-label="Postup rezervace"><li className={!service ? 'active' : 'done'}>Ošetření</li><li className={service && !time ? 'active' : time ? 'done' : ''}>Termín</li><li className={time ? 'active' : ''}>Kontakt</li></ol>
        {error && <p className="error" role="alert">{error}</p>}
        {!service ? <section><h1>Vyberte ošetření</h1>
          {!services ? <p className="pb-muted">Načítám nabídku…</p> : !services.length ? <p className="pb-muted">Online rezervace teď není k dispozici. Zavolejte nám prosím.</p> :
          <>{services.length > 6 && <label className="pb-search"><Search size={17}/><input type="search" placeholder="Hledat ošetření" aria-label="Hledat ošetření" value={query} onChange={e => setQuery(e.target.value)}/></label>}
          {groups.length ? groups.map(([category, list]) => <div key={category} className="pb-group">
            {category && <h2>{category} <small>{list.length} {list.length === 1 ? 'položka' : list.length < 5 ? 'položky' : 'položek'}</small></h2>}
            <div className="pb-services">{list.map(s => <button key={s.id} className="pb-service" onClick={() => { setService(s); setDate(''); setError(''); }}><b>{s.name}</b>{s.description && <small className="pb-desc">{s.description}</small>}<span><Clock size={14}/> {length(s.durationMin)}</span><strong>{price(s.priceCents)}</strong>{s.sessions && s.sessions > 1 || s.prepay ? <small className="pb-deposit">{[s.sessions && s.sessions > 1 ? `balíček ${s.sessions} ošetření` : '', s.prepay ? 'platba předem' : ''].filter(Boolean).join(' · ')}</small> : s.depositCents ? <small className="pb-deposit">kauce {formatRevenue(s.depositCents)}</small> : null}</button>)}</div>
          </div>) : <p className="pb-muted">Nic jsme nenašli. Zkuste jiné slovo.</p>}</>}
        </section> : !time ? <section>
          <button className="pb-back" onClick={() => setService(null)}><ChevronLeft size={16}/> Jiné ošetření</button>
          <h1>{service.name}</h1><p className="pb-muted">{length(service.durationMin)} · {price(service.priceCents)}</p>
          <SlotPicker key={service.id + reload} query={`serviceId=${encodeURIComponent(service.id)}`} horizon={horizon} onPick={(d, t) => { setDate(d); setTime(t); }} onError={setError}/>
        </section> : <section>
          <button className="pb-back" onClick={() => setTime('')}><ChevronLeft size={16}/> Jiný termín</button>
          <h1>Vaše údaje</h1><p className="pb-summary"><b>{service.name}</b><br/>{longDate(date)} v {time} · {length(service.durationMin)} · {price(service.priceCents)}{service.prepay && service.depositCents ? <><br/>Po rezervaci zaplatíte celou částku {formatRevenue(service.depositCents)} předem.</> : service.depositCents ? <><br/>Po rezervaci zaplatíte kauci {formatRevenue(service.depositCents)}, odečte se z ceny.</> : service.newDepositCents ? <><br/>Pokud jste u nás poprvé, zaplatíte po rezervaci kauci {formatRevenue(service.newDepositCents)}, odečte se z ceny.</> : null}{!service.prepay && (service.depositCents || service.newDepositCents) && salon?.forfeitHours ? <><br/><small>Kauce propadá při zrušení méně než {salon.forfeitHours} h předem nebo když nepřijdete.</small></> : null}{service.sessions && service.sessions > 1 ? <><br/>Teď rezervujete 1. z {service.sessions} ošetření, další termíny domluvíme při návštěvě.</> : null}</p>
          <form className="pb-form" onSubmit={submit}>
            <label className="field"><span>Jméno a příjmení *</span><input name="name" required maxLength={120} autoComplete="name"/></label>
            <div className="field-grid"><label className="field"><span>Telefon *</span><input name="phone" type="tel" required maxLength={40} autoComplete="tel"/></label><label className="field"><span>E-mail</span><input name="email" type="email" maxLength={200} autoComplete="email"/></label></div>
            <label className="field"><span>Poznámka</span><textarea name="note" rows={3} maxLength={1000} placeholder="Například alergie nebo přání k ošetření"/></label>
            {!!service.photo && <PhotoPicker required={service.photo === 2} photos={photos} onChange={setPhotos} onError={setError}/>}
            <label className="pb-hidden" aria-hidden="true">Web<input name="website" tabIndex={-1} autoComplete="off"/></label>
            <label className="check"><input type="checkbox" name="consent" required/> Souhlasím se zpracováním osobních údajů pro účely rezervace.</label>
            <button className="primary" disabled={busy}>{busy ? 'Odesílám…' : 'Rezervovat termín'}</button>
          </form>
        </section>}
      </>}
    </main>
    {salon && <footer className="pb-footer">{[salon.name, salon.address, salon.phone && 'tel. ' + salon.phone, salon.businessId && 'IČO ' + salon.businessId].filter(Boolean).join(' · ')}</footer>}
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

type Managed = {start: string; end: string; service: string; status: string; durationMin: number; canChange: boolean; limitHours: number; forfeitHours?: number; deposit: DepositInfo | null};

/** Správa vlastní rezervace přes tajný odkaz: zrušení nebo přesun nejpozději v nastavené lhůtě předem. */
function ManageBooking({token, horizon, phone, onLeave}: {token: string; horizon: number; phone: string; onLeave: () => void}) {
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
    <p className="pb-summary"><b>{booking.service}</b><br/>{longDate(booking.start.slice(0, 10))} v {booking.start.slice(11)} · {booking.durationMin} min{booking.status === 'pending' && <><br/>{booking.deposit?.kind === 'prepay' ? 'Termín čeká na zaplacení.' : 'Termín čeká na zaplacení kauce.'}</>}</p>
    {booking.deposit && !cancelled && mode === 'view' && <PaymentDetails deposit={booking.deposit}/>}
    {cancelled ? <button className="primary" onClick={onLeave}>Rezervovat nový termín</button>
    : !booking.canChange ? <p className="pb-muted">Online lze termín zrušit nebo změnit nejpozději {booking.limitHours} hodin předem. {phone ? `Teď nám prosím zavolejte na ${phone}.` : 'Teď se nám prosím ozvěte telefonicky.'}</p>
    : mode === 'cancel' ? <div className="pb-confirm"><p>Opravdu chcete termín zrušit?{!!booking.forfeitHours && new Date(booking.start + ':00').getTime() - Date.now() < booking.forfeitHours * 3600000 ? ` Do termínu zbývá méně než ${booking.forfeitHours} h, zaplacená kauce proto propadne.` : ''}</p><div className="pb-actions"><button className="danger" disabled={busy} onClick={() => send('cancel')}>{busy ? 'Ruším…' : 'Ano, zrušit termín'}</button><button className="secondary" onClick={() => setMode('view')}>Ponechat termín</button></div></div>
    : mode === 'move' ? <>
      <button className="pb-back" onClick={() => { setMode('view'); setPicked(null); }}><ChevronLeft size={16}/> Zpět</button>
      {picked ? <div className="pb-confirm"><p>Přesunout na <b>{longDate(picked.date)} v {picked.time}</b>?</p><div className="pb-actions"><button className="primary" disabled={busy} onClick={() => send('move')}>{busy ? 'Ukládám…' : 'Ano, přesunout'}</button><button className="secondary" onClick={() => setPicked(null)}>Vybrat jiný čas</button></div></div>
      : <><h2>Vyberte nový termín</h2><SlotPicker query={`token=${encodeURIComponent(token)}`} horizon={horizon} onPick={(date, time) => setPicked({date, time})} onError={setError}/></>}
    </>
    : <><p className="pb-muted">Zrušit nebo změnit termín můžete nejpozději {booking.limitHours} hodin předem.</p>
      <div className="pb-actions"><button className="primary" onClick={() => { setMode('move'); setMessage(''); }}>Změnit termín</button><button className="secondary" onClick={() => { setMode('cancel'); setMessage(''); }}>Zrušit termín</button></div></>}
  </section>;
}

/** Zmenší fotku v prohlížeči (nejvýš 1600 px, JPEG), aby se dala rychle odeslat i z mobilu. */
function shrinkPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height)), canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url); resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Fotku se nepodařilo načíst. Zkuste prosím JPG nebo PNG.')); };
    img.src = url;
  });
}

/** Fotky k rezervaci (nejvýš 3), např. pleť před první návštěvou. */
function PhotoPicker({required, photos, onChange, onError}: {required: boolean; photos: string[]; onChange: (photos: string[]) => void; onError: (message: string) => void}) {
  const [busy, setBusy] = useState(false);
  async function add(files: FileList | null) {
    if (!files?.length) return; setBusy(true);
    try { const added = await Promise.all([...files].slice(0, 3 - photos.length).map(shrinkPhoto)); onChange([...photos, ...added].slice(0, 3)); } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="pb-photos field">
    <span>Fotka {required ? '*' : '(nepovinné)'}</span>
    <small className="pb-muted">Přiložte prosím fotku místa, které chcete ošetřit (například pleti). Pomůže nám ošetření dobře připravit. Uvidí ji jen salon.</small>
    {photos.length > 0 && <div className="pb-photo-list">{photos.map((p, i) => <span key={i}><img src={p} alt={`Fotka ${i + 1}`}/><button type="button" aria-label={`Odebrat fotku ${i + 1}`} onClick={() => onChange(photos.filter((_, j) => j !== i))}><X size={14}/></button></span>)}</div>}
    {photos.length < 3 && <label className="secondary pb-photo-add"><Camera size={16}/> {busy ? 'Načítám…' : photos.length ? 'Přidat další fotku' : 'Přidat fotku'}<input type="file" accept="image/*" multiple hidden onChange={e => { add(e.target.files); e.target.value = ''; }}/></label>}
  </div>;
}
