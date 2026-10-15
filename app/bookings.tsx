'use client';
import {useEffect, useRef, useState} from 'react';
import {Ban, Check, ChevronLeft, ChevronRight, Clock, ExternalLink, Phone, Plus, UserPlus, X} from 'lucide-react';
import {addDays, DEFAULT_SETTINGS, salonNow, toMinutes, weekday, type BookingSettings} from '../lib/booking';
import {formatRevenue} from '../lib/revenue';
import {czIban, spdPayload} from '../lib/payment';
import {PaymentDetails} from './qr-payment';

export type Booking = {id: string; serviceId: string | null; clientId: string | null; start: string; end: string; serviceName: string; priceCents: number | null; name: string; phone: string; email: string; note: string; status: string; source: string; depositCents?: number | null; depositStatus?: string | null; depositDue?: string | null; vs?: string | null};
export type Service = {id: string; name: string; durationMin: number; priceCents: number; active: number; sort: number};
type ClientLite = {id: string; name: string; phone: string; email: string; blocked?: number};
const DEPOSIT_LABEL: Record<string, string> = {pending: 'čeká na zaplacení', paid: 'zaplacena', returned: 'vrácena', forfeited: 'propadla', expired: 'nezaplacena, termín uvolněn', cancelled: 'nezaplacena, termín zrušen'};

export const STATUS_LABEL: Record<string, string> = {pending: 'Čeká na kauci', confirmed: 'Potvrzeno', done: 'Proběhlo', no_show: 'Nepřišla', cancelled: 'Zrušeno'};
const mondayOf = (date: string) => addDays(date, -((weekday(date) + 6) % 7));
const dayTitle = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('cs-CZ', {weekday: 'long', day: 'numeric', month: 'numeric'});
const duration = (b: Booking) => toMinutes(b.end.slice(11)) - toMinutes(b.start.slice(11)) + (b.end.slice(0, 10) > b.start.slice(0, 10) ? 1440 : 0);

async function post(body: unknown) {
  const r = await fetch('/api/bookings', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const d = await r.json() as {error?: string; id?: string; clientId?: string};
  if (!r.ok) throw new Error(d.error || 'Změnu se nepodařilo uložit.');
  return d;
}

export default function Bookings({clients, onOpenClient, onClientsChanged}: {clients: ClientLite[]; onOpenClient: (id: string) => void; onClientsChanged: () => Promise<void> | void}) {
  const today = salonNow().slice(0, 10);
  const [week, setWeek] = useState(() => mondayOf(today));
  const [bookings, setBookings] = useState<Booking[]>([]), [services, setServices] = useState<Service[]>([]), [settings, setSettings] = useState<BookingSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{mode: 'view' | 'edit'; booking: Partial<Booking> & {date?: string; time?: string}} | null>(null);
  const [blockToo, setBlockToo] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const days = Array.from({length: 7}, (_, i) => addDays(week, i));

  async function load() {
    setError('');
    try {
      const r = await fetch(`/api/bookings?from=${week}&to=${addDays(week, 6)}`, {cache: 'no-store'});
      const d = await r.json() as {error?: string; bookings: Booking[]; services: Service[]; settings: BookingSettings};
      if (!r.ok) throw new Error(d.error);
      setBookings(d.bookings); setServices(d.services); setSettings(d.settings);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [week]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); setBlockToo(false); }, [open]);

  async function run(action: () => Promise<unknown>, message: string, close = true) {
    setBusy(true); setError('');
    try { await action(); if (close) setOpen(null); await load(); setNotice(message); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const clientOf = (b: Partial<Booking>) => clients.find(c => c.id === b.clientId);
  const current = open?.booking;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data: Record<string, unknown> = {...Object.fromEntries(new FormData(e.currentTarget)), id: current?.id || '', source: (e.currentTarget.elements.namedItem('source') as RadioNodeList | null)?.value || current?.source, status: current?.status};
    await run(() => post({kind: 'booking', action: 'save', data: {...data, durationMin: Number(data.durationMin)}}), 'Rezervace byla uložena.');
  }

  return <div className="bookings">
    <div className="heading"><div><p className="eyebrow">ONLINE I V SALONU</p><h1>Rezervace</h1><p>Termíny z webu se potvrzují samy, upravit je můžete tady.</p></div>
      <button className="primary" onClick={() => setOpen({mode: 'edit', booking: {date: today, time: '10:00', source: 'salon'}})}><Plus size={18}/> Nová rezervace</button></div>
    {error && !open && <div className="error" role="alert">{error} <button onClick={load}>Zkusit znovu</button></div>}
    {notice && <p className="notice" role="status">{notice}<button aria-label="Zavřít oznámení" onClick={() => setNotice('')}><X size={15}/></button></p>}
    <div className="week-nav">
      <button className="secondary" aria-label="Předchozí týden" onClick={() => setWeek(addDays(week, -7))}><ChevronLeft size={18}/></button>
      <b>{new Date(week + 'T12:00:00').toLocaleDateString('cs-CZ', {day: 'numeric', month: 'long'})} – {new Date(addDays(week, 6) + 'T12:00:00').toLocaleDateString('cs-CZ', {day: 'numeric', month: 'long', year: 'numeric'})}</b>
      <button className="secondary" aria-label="Další týden" onClick={() => setWeek(addDays(week, 7))}><ChevronRight size={18}/></button>
      {week !== mondayOf(today) && <button className="secondary" onClick={() => setWeek(mondayOf(today))}>Tento týden</button>}
    </div>
    <div className="week">{days.map(date => {
      const list = bookings.filter(b => b.start.slice(0, 10) === date), hours = settings.hours[String(weekday(date))];
      return <section key={date} className={'day ' + (date === today ? 'today ' : '') + (!hours && !list.length ? 'closed' : '')}>
        <h2>{dayTitle(date)}</h2><small>{hours ? `${hours[0]}–${hours[1]}` : 'Zavřeno'}</small>
        {loading ? <p className="muted">Načítám…</p> : list.map(b => <button key={b.id} className={`booking-chip status-${b.status} source-${b.source}`} onClick={() => setOpen({mode: 'view', booking: b})}>
          <span className="time">{b.start.slice(11)}–{b.end.slice(11)}</span>
          <b>{b.source === 'block' ? b.serviceName : b.name}</b>
          {b.source !== 'block' && <span>{b.serviceName}</span>}
          {(b.status !== 'confirmed' || b.source === 'online' || b.depositCents != null) && <span className="tags">{b.source === 'online' && <em>Z webu</em>}{b.status !== 'confirmed' && <em>{STATUS_LABEL[b.status]}</em>}{b.depositStatus === 'paid' && <em>Kauce ✓</em>}</span>}
        </button>)}
      </section>;
    })}</div>

    <dialog ref={dialog} onCancel={e => { if (busy) e.preventDefault(); else setOpen(null); }}>
      {open?.mode === 'view' && current && <div>
        <div className="dialog-header"><div><p className="eyebrow">{current.source === 'block' ? 'BLOKOVANÝ ČAS' : current.source === 'online' ? 'REZERVACE Z WEBU' : 'REZERVACE'}</p><h2>{current.source === 'block' ? current.serviceName : current.name}</h2></div><button type="button" aria-label="Zavřít" onClick={() => setOpen(null)}><X size={21}/></button></div>
        <div className="fields booking-detail">
          <p><Clock size={16}/> {dayTitle(current.start!.slice(0, 10))}, {current.start!.slice(11)}–{current.end!.slice(11)}</p>
          {current.source !== 'block' && <>
            <p><b>{current.serviceName}</b>{current.priceCents != null && <> · {formatRevenue(current.priceCents)}</>}</p>
            {current.phone && <p><Phone size={16}/> {current.phone}{current.email && <> · {current.email}</>}</p>}
            <p className={'status-pill status-' + current.status}>{STATUS_LABEL[current.status!]}</p>
            {current.depositCents != null && <div className="deposit-box">
              <p><b>Kauce {formatRevenue(current.depositCents)}</b> · {DEPOSIT_LABEL[current.depositStatus || 'pending']}{current.vs && <> · VS {current.vs}</>}</p>
              {current.depositStatus === 'pending' && current.depositDue && <p className="muted-inline">Termín se uvolní {new Date(current.depositDue + ':00').toLocaleString('cs-CZ', {day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit'})}, pokud kauce nedorazí.</p>}
              {current.depositStatus === 'pending' && czIban(settings.account) && <details><summary>QR kód pro platbu</summary><PaymentDetails deposit={{amountCents: current.depositCents, due: current.depositDue || current.start!, vs: current.vs || '', iban: czIban(settings.account)!, account: settings.account, recipient: settings.accountName, qr: spdPayload({iban: czIban(settings.account)!, amountCents: current.depositCents, vs: current.vs || '', message: 'Kauce ' + current.serviceName, recipient: settings.accountName})}}/></details>}
              <div className="booking-actions">
                {current.depositStatus !== 'paid' && <button className="primary" disabled={busy} onClick={() => run(() => post({kind: 'booking', action: 'deposit', data: {id: current.id, depositStatus: 'paid'}}), 'Kauce je zaplacená, termín potvrzený.')}><Check size={16}/> Kauce zaplacena</button>}
                {current.depositStatus === 'paid' && <><button className="secondary" disabled={busy} onClick={() => run(() => post({kind: 'booking', action: 'deposit', data: {id: current.id, depositStatus: 'returned'}}), 'Kauce označena jako vrácená.')}>Kauce vrácena</button><button className="secondary" disabled={busy} onClick={() => run(() => post({kind: 'booking', action: 'deposit', data: {id: current.id, depositStatus: 'forfeited'}}), 'Kauce propadla.')}>Kauce propadla</button></>}
              </div>
            </div>}
            {clientOf(current)?.blocked === 1 && <p className="caution-line"><Ban size={16}/> Klientka má zablokované online rezervace.</p>}
          </>}
          {current.note && <p className="note">{current.note}</p>}
          {current.source !== 'block' && <div className="booking-actions">
            {current.status !== 'done' && <button className="secondary" disabled={busy} onClick={() => run(() => post({kind: 'booking', action: 'status', data: {id: current.id, status: 'done'}}), 'Označeno jako proběhlé.')}><Check size={16}/> Proběhlo</button>}
            {current.status !== 'no_show' && <span className="no-show"><button className="secondary" disabled={busy} onClick={() => run(() => post({kind: 'booking', action: 'status', data: {id: current.id, status: 'no_show', block: blockToo}}).then(onClientsChanged), blockToo ? 'Označeno jako nepřišla, online rezervace zablokovány.' : 'Označeno jako nepřišla.')}><Ban size={16}/> Nepřišla</button>
              {current.clientId && <label><input type="checkbox" checked={blockToo} onChange={e => setBlockToo(e.target.checked)}/> a zablokovat online rezervace</label>}</span>}
            {current.status !== 'cancelled' && <button className="secondary" disabled={busy} onClick={() => run(() => post({kind: 'booking', action: 'status', data: {id: current.id, status: 'cancelled'}}), 'Rezervace byla zrušena, termín je znovu volný.')}><X size={16}/> Zrušit termín</button>}
            {current.status !== 'confirmed' && <button className="secondary" disabled={busy} onClick={() => run(() => post({kind: 'booking', action: 'status', data: {id: current.id, status: 'confirmed'}}), 'Rezervace je znovu potvrzená.')}>Vrátit na potvrzeno</button>}
          </div>}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="dialog-footer">
          {current.source !== 'block' && (current.clientId
            ? <button className="secondary" onClick={() => { setOpen(null); onOpenClient(current.clientId!); }}><ExternalLink size={16}/> Otevřít kartu</button>
            : <button className="secondary" disabled={busy} onClick={() => run(async () => { const d = await post({kind: 'booking', action: 'createClient', data: {id: current.id}}); await onClientsChanged(); onOpenClient(d.clientId!); }, 'Karta klientky byla založena.')}><UserPlus size={16}/> Založit kartu</button>)}
          <button className="secondary" onClick={() => setOpen({mode: 'edit', booking: {...current, date: current.start!.slice(0, 10), time: current.start!.slice(11)}})}>Upravit</button>
          {current.source === 'block' && <button className="secondary" disabled={busy} onClick={() => run(() => post({kind: 'booking', action: 'delete', data: {id: current.id}}), 'Blokace byla odstraněna.')}>Odstranit</button>}
        </div>
      </div>}
      {open?.mode === 'edit' && current && <BookingForm key={current.id || 'new'} booking={current} services={services} clients={clients} busy={busy} error={error} onSubmit={save} onClose={() => setOpen(null)}/>}
    </dialog>
  </div>;
}

function BookingForm({booking, services, clients, busy, error, onSubmit, onClose}: {booking: Partial<Booking> & {date?: string; time?: string}; services: Service[]; clients: ClientLite[]; busy: boolean; error: string; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; onClose: () => void}) {
  const [source, setSource] = useState(booking.source === 'block' ? 'block' : booking.source || 'salon');
  const [clientId, setClientId] = useState(booking.clientId || '');
  const [serviceId, setServiceId] = useState(booking.serviceId || '');
  const [minutes, setMinutes] = useState(booking.start ? duration(booking as Booking) : 60);
  const isBlock = source === 'block', client = clients.find(c => c.id === clientId);
  return <form onSubmit={onSubmit}>
    <div className="dialog-header"><div><p className="eyebrow">KALENDÁŘ</p><h2>{booking.id ? 'Upravit' : 'Nový záznam'}</h2></div><button type="button" disabled={busy} aria-label="Zavřít formulář" onClick={onClose}><X size={21}/></button></div>
    <div className="fields">
      {!booking.id && <div className="segmented" role="radiogroup" aria-label="Typ záznamu">
        <label><input type="radio" name="source" value="salon" checked={!isBlock} onChange={() => setSource('salon')}/> Rezervace</label>
        <label><input type="radio" name="source" value="block" checked={isBlock} onChange={() => setSource('block')}/> Blokovat čas (volno, pauza)</label>
      </div>}
      {isBlock ? <label className="field"><span>Popis</span><input name="serviceName" defaultValue={booking.serviceName || 'Volno'} maxLength={150}/></label> : <>
        <label className="field"><span>Klientka z kartotéky</span><select name="clientId" value={clientId} onChange={e => setClientId(e.target.value)}><option value="">Nová / bez karty</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ' · ' + c.phone : ''}</option>)}</select></label>
        {!client && <div className="field-grid"><label className="field"><span>Jméno *</span><input name="name" defaultValue={booking.name} required maxLength={120}/></label><label className="field"><span>Telefon</span><input name="phone" type="tel" defaultValue={booking.phone} maxLength={40}/></label></div>}
        <label className="field"><span>Ošetření *</span><select name="serviceId" required value={serviceId} onChange={e => { setServiceId(e.target.value); const s = services.find(x => x.id === e.target.value); if (s) setMinutes(s.durationMin); }}><option value="" disabled>Vyberte ošetření</option>{services.map(s => <option key={s.id} value={s.id}>{s.name} · {s.durationMin} min · {formatRevenue(s.priceCents)}</option>)}</select></label>
      </>}
      <div className="field-grid three"><label className="field"><span>Datum</span><input type="date" name="date" required defaultValue={booking.date}/></label><label className="field"><span>Začátek</span><input type="time" name="time" required step={300} defaultValue={booking.time}/></label><label className="field"><span>Délka (min)</span><input type="number" name="durationMin" required min={5} max={720} step={5} value={minutes} onChange={e => setMinutes(Number(e.target.value))}/></label></div>
      <label className="field"><span>Poznámka</span><textarea name="note" rows={2} maxLength={1000} defaultValue={booking.note}/></label>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="dialog-footer"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Zrušit</button><button className="primary" disabled={busy}>{busy ? 'Ukládám…' : 'Uložit'}</button></div>
  </form>;
}

