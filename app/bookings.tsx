'use client';
import {useEffect, useRef, useState} from 'react';
import {AlertTriangle, Ban, Camera, Check, ChevronLeft, ChevronRight, ClipboardList, Clock, ExternalLink, MessageSquare, Phone, Plane, Plus, Search, Star, Trash2, UserPlus, X} from 'lucide-react';
import {smsPhone} from '../lib/sms';
import {addDays, DEFAULT_SETTINGS, fromMinutes, salonNow, toMinutes, weekday, type BookingSettings} from '../lib/booking';
import {serviceColor} from '../lib/price-list';
import {formatRevenue} from '../lib/revenue';
import {czIban, spdPayload} from '../lib/payment';
import {PaymentDetails} from './qr-payment';
import {ReceiptDialog, type ReceiptDraft} from './receipts';
import {Receipt as ReceiptIcon} from 'lucide-react';

export type Booking = {id: string; serviceId: string | null; clientId: string | null; start: string; end: string; serviceName: string; priceCents: number | null; name: string; phone: string; email: string; note: string; status: string; source: string; depositCents?: number | null; depositStatus?: string | null; depositDue?: string | null; vs?: string | null; paymentKind?: string | null; receiptId?: string | null; color?: string | null; category?: string | null; remindedStart?: string | null; remindedAt?: string | null; intake?: string | null; photos?: number};
export type Absence = {id: string; start: string; end: string; reason: string; note: string};
export const ABSENCE_REASONS = ['Dovolená', 'Nemoc', 'Školení', 'Technické důvody', 'Jiné'];
type CalendarView = 'day' | 'work' | 'week';
const VIEW_KEY = 'salon-calendar-view';
export type Service = {id: string; name: string; durationMin: number; priceCents: number; active: number; sort: number; category: string; description: string; color: string; sessions: number; prepay: number; depositCents?: number | null; pauseMin?: number; weekdays?: string; photo?: number};
type ClientLite = {id: string; name: string; phone: string; email: string; blocked?: number; unreliable?: number; vip?: number};
const DEPOSIT_LABEL: Record<string, string> = {pending: 'čeká na zaplacení', paid: 'zaplacena', returned: 'vrácena', forfeited: 'propadla', expired: 'nezaplacena, termín uvolněn', cancelled: 'nezaplacena, termín zrušen', used: 'započtena do účtenky'};

export const STATUS_LABEL: Record<string, string> = {pending: 'Čeká na kauci', confirmed: 'Potvrzeno', done: 'Proběhlo', no_show: 'Nepřišla', cancelled: 'Zrušeno'};
const mondayOf = (date: string) => addDays(date, -((weekday(date) + 6) % 7));
const dayTitle = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('cs-CZ', {weekday: 'long', day: 'numeric', month: 'numeric'});
const HOUR = 60; // výška jedné hodiny v kalendáři (px)
/** Čitelná barva textu na barevném pozadí. */
function textOn(hex: string) { const n = parseInt(hex.slice(1), 16), l = (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; return l > 0.62 ? '#1d2b2c' : '#fff'; }
/** Překrývající se termíny dne vedle sebe: pořadí sloupce a počet sloupců ve skupině. */
function layout(list: Booking[]) {
  const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end)), result = new Map<string, {index: number; count: number}>();
  let group: Booking[] = [], lanesEnd: string[] = [], groupEnd = '';
  const flush = () => { for (const b of group) result.get(b.id)!.count = lanesEnd.length; group = []; lanesEnd = []; };
  for (const b of sorted) {
    if (group.length && b.start >= groupEnd) flush();
    let lane = lanesEnd.findIndex(end => end <= b.start); if (lane < 0) lane = lanesEnd.length;
    lanesEnd[lane] = b.end; group.push(b); groupEnd = group.length === 1 || b.end > groupEnd ? b.end : groupEnd;
    result.set(b.id, {index: lane, count: 1});
  }
  flush();
  return result;
}
/** Čas posunutý o daný počet minut, nejpozději 23:55. */
const shift = (time: string, minutes: number) => fromMinutes(Math.min(toMinutes(time) + minutes, 23 * 60 + 55));
/** 90 → „1 h 30 min“ */
const lengthText = (m: number) => (m >= 60 ? Math.floor(m / 60) + ' h' : '') + (m % 60 ? (m >= 60 ? ' ' : '') + (m % 60) + ' min' : '');
const duration = (b: Booking) => toMinutes(b.end.slice(11)) - toMinutes(b.start.slice(11)) + (b.end.slice(0, 10) > b.start.slice(0, 10) ? 1440 : 0);

async function post(body: unknown) {
  const r = await fetch('/api/bookings', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const d = await r.json() as {error?: string; id?: string; clientId?: string; clash?: number; forfeited?: boolean};
  if (!r.ok) throw new Error(d.error || 'Změnu se nepodařilo uložit.');
  return d;
}

export default function Bookings({clients, onOpenClient, onClientsChanged}: {clients: ClientLite[]; onOpenClient: (id: string) => void; onClientsChanged: () => Promise<void> | void}) {
  const today = salonNow().slice(0, 10);
  const [anchor, setAnchor] = useState(today), [view, setViewState] = useState<CalendarView>(() => { try { const v = localStorage.getItem(VIEW_KEY); return v === 'day' || v === 'work' ? v : 'week'; } catch { return 'week'; } });
  const setView = (v: CalendarView) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* bez úložiště */ } };
  const week = mondayOf(anchor), [absences, setAbsences] = useState<Absence[]>([]), [absence, setAbsence] = useState<Partial<Absence> | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]), [services, setServices] = useState<Service[]>([]), [settings, setSettings] = useState<BookingSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true), [smsReady, setSmsReady] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{mode: 'view' | 'edit'; booking: Partial<Booking> & {date?: string; time?: string}} | null>(null);
  const [blockToo, setBlockToo] = useState(false), [receipt, setReceipt] = useState<{draft?: ReceiptDraft; id?: string} | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), scroller = useRef<HTMLDivElement>(null);
  // Na telefonu se kalendář posune tak, aby byl vidět dnešek.
  useEffect(() => { const el = scroller.current, todayCol = el?.querySelector<HTMLElement>('.cal-day.today'); if (el && todayCol && el.scrollWidth > el.clientWidth) el.scrollLeft = todayCol.offsetLeft - 52; }, [week, loading, view]);
  // Pohled Den, Pracovní dny (dny s otevírací dobou a dny s rezervacemi) nebo celý Týden.
  const weekDays = Array.from({length: 7}, (_, i) => addDays(week, i));
  const workDays = weekDays.filter(d => settings.hours[String(weekday(d))] || bookings.some(b => b.start.slice(0, 10) === d && b.status !== 'cancelled'));
  const days = view === 'day' ? [anchor] : view === 'work' ? (workDays.length ? workDays : weekDays.slice(0, 5)) : weekDays;
  const step = view === 'day' ? 1 : 7;
  // Rozsah mřížky: otevírací doba v týdnu, případně rozšířená o rezervace mimo ni.
  const opening = Object.values(settings.hours).filter(Boolean) as [string, string][];
  const startHour = Math.min(9, ...opening.map(h => Math.floor(toMinutes(h[0]) / 60)), ...bookings.map(b => Math.floor(toMinutes(b.start.slice(11)) / 60)));
  const endHour = Math.max(startHour + 1, ...opening.map(h => Math.ceil(toMinutes(h[1]) / 60)), ...bookings.map(b => b.end.slice(0, 10) > b.start.slice(0, 10) ? 24 : Math.ceil(toMinutes(b.end.slice(11)) / 60)));
  const now = toMinutes(salonNow().slice(11));
  const legend = [...new Map(bookings.filter(b => b.source !== 'block' && b.status !== 'cancelled').map(b => [b.category || b.serviceName, serviceColor(b.color, b.category)])).entries()];

  async function load() {
    setError('');
    try {
      const r = await fetch(`/api/bookings?from=${week}&to=${addDays(week, 6)}`, {cache: 'no-store'});
      const d = await r.json() as {error?: string; bookings: Booking[]; services: Service[]; settings: BookingSettings; absences?: Absence[]; features?: {sms?: string}};
      if (!r.ok) throw new Error(d.error);
      setBookings(d.bookings); setAbsences(d.absences || []); setServices(d.services); setSettings(d.settings); setSmsReady(!!d.features?.sms);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [week]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); setBlockToo(false); }, [open]);

  async function run(action: () => Promise<unknown>, message: string, close = true) {
    setBusy(true); setError('');
    try { await action(); if (close) setOpen(null); await load(); setNotice(message); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const clientOf = (b: Partial<Booking>) => clients.find(c => c.id === b.clientId);
  const current = open?.booking, payLabel = current?.paymentKind === 'prepay' ? 'Platba předem' : 'Kauce';

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data: Record<string, unknown> = {...Object.fromEntries(new FormData(e.currentTarget)), id: current?.id || '', source: (e.currentTarget.elements.namedItem('source') as RadioNodeList | null)?.value || current?.source, status: current?.status};
    await run(() => post({kind: 'booking', action: 'save', data: {...data, durationMin: Number(data.durationMin)}}), 'Rezervace byla uložena.');
  }

  return <div className="bookings">
    <div className="heading"><div><p className="eyebrow">ONLINE I V SALONU</p><h1>Rezervace</h1><p>Termíny z webu se potvrzují samy, upravit je můžete tady.</p></div>
      <div className="heading-actions"><button className="secondary" onClick={() => setAbsence({})}><Plane size={17}/> Nepřítomnost</button><button className="primary" onClick={() => setOpen({mode: 'edit', booking: {date: view === 'day' ? anchor : today, time: '10:00', source: 'salon'}})}><Plus size={18}/> Nová rezervace</button></div></div>
    {error && !open && <div className="error" role="alert">{error} <button onClick={load}>Zkusit znovu</button></div>}
    {notice && <p className="notice" role="status">{notice}<button aria-label="Zavřít oznámení" onClick={() => setNotice('')}><X size={15}/></button></p>}
    <div className="week-nav">
      <span className="segmented-mini" role="radiogroup" aria-label="Pohled kalendáře">{([['day', 'Den'], ['work', 'Pracovní dny'], ['week', 'Týden']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={view === k} className={view === k ? 'active' : ''} onClick={() => setView(k)}>{l}</button>)}</span>
      <button className="secondary" aria-label={view === 'day' ? 'Předchozí den' : 'Předchozí týden'} onClick={() => setAnchor(addDays(anchor, -step))}><ChevronLeft size={18}/></button>
      <b>{view === 'day' ? <span className="cap">{dayTitle(anchor)} {anchor.slice(0, 4)}</span> : <>{new Date(days[0] + 'T12:00:00').toLocaleDateString('cs-CZ', {day: 'numeric', month: 'long'})} – {new Date(days[days.length - 1] + 'T12:00:00').toLocaleDateString('cs-CZ', {day: 'numeric', month: 'long', year: 'numeric'})}</>}</b>
      <button className="secondary" aria-label={view === 'day' ? 'Další den' : 'Další týden'} onClick={() => setAnchor(addDays(anchor, step))}><ChevronRight size={18}/></button>
      {(view === 'day' ? anchor !== today : week !== mondayOf(today)) && <button className="secondary" onClick={() => setAnchor(today)}>{view === 'day' ? 'Dnes' : 'Tento týden'}</button>}
      <label className="cal-jump"><span className="sr-only">Přejít na datum</span><input type="date" value={anchor} onChange={e => { if (e.target.value) setAnchor(e.target.value); }}/></label>
    </div>
    {absences.filter(a => a.end > days[0] && a.start < addDays(days[days.length - 1], 1)).map(a => <p key={a.id} className="absence-line"><Plane size={16}/> <b>{a.reason || 'Nepřítomnost'}</b> {absenceRange(a)}{a.note && <> · {a.note}</>} · online se v tu dobu nerezervuje <button type="button" className="link-button" onClick={() => setAbsence(a)}>Upravit</button></p>)}
    {legend.length > 0 && <ul className="cal-legend" aria-label="Barvy ošetření">{legend.map(([name, color]) => <li key={name}><span style={{background: color}}/>{name}</li>)}</ul>}
    <div className="cal-scroll" ref={scroller}><div className={'cal view-' + view} style={{'--hour': HOUR + 'px', '--days': days.length} as React.CSSProperties}>
      <div className="cal-times" aria-hidden="true"><div className="cal-corner"/>{Array.from({length: endHour - startHour}, (_, i) => <span key={i} style={{top: i * HOUR}}>{startHour + i}:00</span>)}</div>
      {days.map(date => {
        const list = bookings.filter(b => b.start.slice(0, 10) === date), hours = settings.hours[String(weekday(date))], lanes = layout(list);
        const top = (t: string) => (toMinutes(t) - startHour * 60) * HOUR / 60;
        return <section key={date} className={'cal-day ' + (date === today ? 'today ' : '') + (!hours ? 'closed' : '')} aria-label={dayTitle(date)}>
          <h2><span>{new Date(date + 'T12:00:00').toLocaleDateString('cs-CZ', {weekday: 'short'})}</span> {new Date(date + 'T12:00:00').toLocaleDateString('cs-CZ', {day: 'numeric', month: 'numeric'})}<small>{hours ? `${hours[0]}–${hours[1]}` : 'Zavřeno'}</small></h2>
          <div className="cal-col" style={{height: (endHour - startHour) * HOUR}} onClick={e => {
            if (e.target !== e.currentTarget) return;
            const minutes = startHour * 60 + Math.floor(e.nativeEvent.offsetY / HOUR * 4) * 15;
            setOpen({mode: 'edit', booking: {date, time: fromMinutes(Math.min(minutes, 23 * 60 + 45)), source: 'salon'}});
          }}>
            {hours ? <><i className="cal-off" style={{top: 0, height: Math.max(0, top(hours[0]))}}/><i className="cal-off" style={{top: Math.max(0, top(hours[1])), bottom: 0}}/></> : <i className="cal-off" style={{top: 0, bottom: 0}}/>}
            {absences.filter(a => a.start < addDays(date, 1) && a.end > date).map(a => {
              const from = a.start.slice(0, 10) < date ? 0 : Math.max(0, top(a.start.slice(11))), to = a.end.slice(0, 10) > date ? (endHour - startHour) * HOUR : Math.min((endHour - startHour) * HOUR, top(a.end.slice(11)));
              return to > from ? <button type="button" key={a.id} className="cal-absence" style={{top: from, height: to - from}} title={`${a.reason || 'Nepřítomnost'} ${absenceRange(a)}`} onClick={() => setAbsence(a)}><Plane size={14}/> {a.reason || 'Nepřítomnost'}</button> : null;
            })}
            {date === today && now >= startHour * 60 && now < endHour * 60 && <i className="cal-now" style={{top: (now - startHour * 60) * HOUR / 60}}/>}
            {loading ? null : list.map(b => {
              const color = b.source === 'block' ? '#9aa7a8' : serviceColor(b.color, b.category), lane = lanes.get(b.id)!;
              const y = top(b.start.slice(11)), h = Math.max(22, duration(b) * HOUR / 60 - 2);
              return <button key={b.id} className={`cal-event status-${b.status} source-${b.source}${h < 50 ? ' compact' : ''}`} title={`${b.start.slice(11)}–${b.end.slice(11)} ${b.source === 'block' ? b.serviceName : b.name + ', ' + b.serviceName}`}
                style={{top: y, height: h, left: `calc(${lane.index / lane.count * 100}% + 2px)`, width: `calc(${100 / lane.count}% - 4px)`, background: color, color: textOn(color)}}
                onClick={() => setOpen({mode: 'view', booking: b})}>
                <b>{b.source === 'block' ? b.serviceName : b.name}</b>
                <span className="time">{b.start.slice(11)}–{b.end.slice(11)}</span>
                {b.source !== 'block' && <span>{b.serviceName}</span>}
                {(b.status !== 'confirmed' || b.source === 'online' || b.depositStatus === 'paid' || clientOf(b)?.unreliable === 1 || clientOf(b)?.vip === 1 || !!b.photos) && <span className="tags">{clientOf(b)?.vip === 1 && <em className="tag-vip" aria-label="Oblíbená klientka">★</em>}{clientOf(b)?.unreliable === 1 && <em className="tag-unreliable">Nespolehlivá</em>}{!!b.photos && <em>Fotka</em>}{b.source === 'online' && <em>Web</em>}{b.status !== 'confirmed' && <em>{STATUS_LABEL[b.status]}</em>}{b.depositStatus === 'paid' && <em>{b.paymentKind === 'prepay' ? 'Zaplaceno ✓' : 'Kauce ✓'}</em>}</span>}
              </button>;
            })}
          </div>
        </section>;
      })}
    </div></div>

    {absence && <AbsenceDialog absence={absence} bookings={bookings} onClose={() => setAbsence(null)} onSaved={async message => { setAbsence(null); await load(); setNotice(message); }}/>}
    {receipt && <ReceiptDialog draft={receipt.draft} receiptId={receipt.id} clients={clients} onClose={() => setReceipt(null)} onChanged={load}/>}
    <dialog ref={dialog} onCancel={e => { if (busy) e.preventDefault(); else setOpen(null); }}>
      {open?.mode === 'view' && current && <div>
        <div className="dialog-header"><div><p className="eyebrow">{current.source === 'block' ? 'BLOKOVANÝ ČAS' : current.source === 'online' ? 'REZERVACE Z WEBU' : 'REZERVACE'}</p><h2>{current.source === 'block' ? current.serviceName : current.name}</h2></div><button type="button" aria-label="Zavřít" onClick={() => setOpen(null)}><X size={21}/></button></div>
        <div className="fields booking-detail">
          <p><Clock size={16}/> {dayTitle(current.start!.slice(0, 10))}, {current.start!.slice(11)}–{current.end!.slice(11)}</p>
          {current.source !== 'block' && <>
            <p><b>{current.serviceName}</b>{current.priceCents != null && <> · {formatRevenue(current.priceCents)}</>}</p>
            {current.phone && <p><Phone size={16}/> {current.phone}{current.email && <> · {current.email}</>}</p>}
            {smsReady && current.status === 'confirmed' && current.start! > salonNow() && !!smsPhone(current.phone || '') && <p className="sms-line"><MessageSquare size={16}/>
              {current.remindedStart === current.start && current.remindedAt ? `SMS připomínka odeslána ${new Date(current.remindedAt).toLocaleString('cs-CZ', {day: 'numeric', month: 'numeric', hour: 'numeric', minute: '2-digit'})}` : settings.smsReminders ? 'SMS připomínka odejde den předem' : 'SMS připomínky jsou vypnuté'}
              <button type="button" className="link-button" disabled={busy} onClick={() => run(async () => { await post({kind: 'sms', action: 'remind', data: {id: current.id}}); setOpen(o => o && {...o, booking: {...o.booking, remindedStart: o.booking.start, remindedAt: new Date().toISOString()}}); }, 'SMS připomínka byla odeslána.', false)}>{current.remindedStart === current.start ? 'Poslat znovu' : 'Poslat teď'}</button></p>}
            {current.status !== 'cancelled' && <p className={'intake-line' + (current.intake === 'done' ? ' ok' : '')}><ClipboardList size={16}/> {current.intake === 'done' ? 'Vstupní dotazník vyplněný' : current.intake === 'sent' ? 'Vstupní dotazník čeká na vyplnění' : current.intake === 'withdrawn' ? 'Klientka odvolala souhlas' : 'Bez vstupního dotazníku'}{current.clientId && current.intake !== 'done' && <> · <button type="button" className="link-button" onClick={() => { setOpen(null); onOpenClient(current.clientId!); }}>na kartě</button></>}</p>}
            <p className={'status-pill status-' + current.status}>{STATUS_LABEL[current.status!]}</p>
            {current.depositCents != null && <div className="deposit-box">
              <p><b>{payLabel} {formatRevenue(current.depositCents)}</b> · {DEPOSIT_LABEL[current.depositStatus || 'pending']}{current.vs && <> · VS {current.vs}</>}</p>
              {current.depositStatus === 'pending' && current.depositDue && <p className="muted-inline">Termín se uvolní {new Date(current.depositDue + ':00').toLocaleString('cs-CZ', {day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit'})}, pokud platba nedorazí.</p>}
              {current.depositStatus === 'pending' && czIban(settings.account) && <details><summary>QR kód pro platbu</summary><PaymentDetails deposit={{amountCents: current.depositCents, due: current.depositDue || current.start!, vs: current.vs || '', iban: czIban(settings.account)!, account: settings.account, recipient: settings.accountName, qr: spdPayload({iban: czIban(settings.account)!, amountCents: current.depositCents, vs: current.vs || '', message: (current.paymentKind === 'prepay' ? '' : 'Kauce ') + current.serviceName, recipient: settings.accountName})}}/></details>}
              <div className="booking-actions">
                {!['paid', 'used'].includes(current.depositStatus || '') && <button className="primary" disabled={busy} onClick={() => run(() => post({kind: 'booking', action: 'deposit', data: {id: current.id, depositStatus: 'paid'}}), `${payLabel} je zaplacená, termín potvrzený.`)}><Check size={16}/> {payLabel} zaplacena</button>}
                {current.depositStatus === 'paid' && <><button className="secondary" disabled={busy} onClick={() => run(() => post({kind: 'booking', action: 'deposit', data: {id: current.id, depositStatus: 'returned'}}), `${payLabel} označena jako vrácená.`)}>{payLabel} vrácena</button><button className="secondary" disabled={busy} onClick={() => run(() => post({kind: 'booking', action: 'deposit', data: {id: current.id, depositStatus: 'forfeited'}}), `${payLabel} propadla.`)}>{payLabel} propadla</button></>}
              </div>
            </div>}
            {clientOf(current)?.vip === 1 && <p className="vip-line"><Star size={16}/> Oblíbená klientka.</p>}
            {clientOf(current)?.blocked === 1 && <p className="caution-line"><Ban size={16}/> Klientka má zablokované online rezervace.</p>}
            {clientOf(current)?.unreliable === 1 && <p className="caution-line"><AlertTriangle size={16}/> Nespolehlivá klientka.{current.depositCents == null && current.status !== 'cancelled' ? ' U tohoto termínu není kauce, můžete ho zrušit nebo smazat.' : current.depositStatus === 'pending' ? ' Kauce zatím nedorazila.' : ''}</p>}
          </>}
          {current.note && <p className="note">{current.note}</p>}
          {!!current.photos && current.id && <BookingPhotos key={current.id} bookingId={current.id} count={current.photos} canCopy={!!current.clientId}/>}
          {current.status !== 'cancelled' && <MoveRow key={current.id} booking={current as Booking} busy={busy} onMove={(date, time) => run(() => post({kind: 'booking', action: 'move', data: {id: current.id, date, time}}), `Termín přesunut na ${dayTitle(date)} ${time}.`)}/>}
          {current.source !== 'block' && <div className="booking-actions">
            {current.status !== 'done' && <button className="secondary" disabled={busy} onClick={() => run(() => post({kind: 'booking', action: 'status', data: {id: current.id, status: 'done'}}), 'Označeno jako proběhlé.')}><Check size={16}/> Proběhlo</button>}
            {current.status !== 'no_show' && <span className="no-show"><button className="secondary" disabled={busy} onClick={() => run(() => post({kind: 'booking', action: 'status', data: {id: current.id, status: 'no_show', block: blockToo}}).then(onClientsChanged), blockToo ? 'Označeno jako nepřišla, online rezervace zablokovány.' : 'Označeno jako nepřišla.')}><Ban size={16}/> Nepřišla</button>
              {current.clientId && <label><input type="checkbox" checked={blockToo} onChange={e => setBlockToo(e.target.checked)}/> a zablokovat online rezervace</label>}</span>}
            {current.status !== 'cancelled' && <button className="secondary" disabled={busy} onClick={() => run(() => post({kind: 'booking', action: 'status', data: {id: current.id, status: 'cancelled'}}), 'Rezervace byla zrušena, termín je znovu volný.')}><X size={16}/> Zrušit termín</button>}
            {current.status !== 'confirmed' && <button className="secondary" disabled={busy} onClick={() => run(() => post({kind: 'booking', action: 'status', data: {id: current.id, status: 'confirmed'}}), 'Rezervace je znovu potvrzená.')}>Vrátit na potvrzeno</button>}
            {!current.receiptId && <button className="secondary danger" disabled={busy} onClick={() => { if (window.confirm(`Smazat rezervaci ${current.name} úplně? Zmizí z kalendáře i z historie.${current.depositStatus === 'paid' ? ' Zaplacenou kauci vraťte nebo si ji poznamenejte zvlášť.' : ''} Klientce se nic neposílá.`)) run(() => post({kind: 'booking', action: 'delete', data: {id: current.id}}), 'Rezervace byla smazána.'); }}><Trash2 size={16}/> Smazat rezervaci</button>}
          </div>}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="dialog-footer">
          {current.source !== 'block' && (current.clientId
            ? <button className="secondary" onClick={() => { setOpen(null); onOpenClient(current.clientId!); }}><ExternalLink size={16}/> Otevřít kartu</button>
            : <button className="secondary" disabled={busy} onClick={() => run(async () => { const d = await post({kind: 'booking', action: 'createClient', data: {id: current.id}}); await onClientsChanged(); onOpenClient(d.clientId!); }, 'Karta klientky byla založena.')}><UserPlus size={16}/> Založit kartu</button>)}
          {current.source !== 'block' && current.status !== 'cancelled' && (current.receiptId
            ? <button className="secondary" onClick={() => { setReceipt({id: current.receiptId!}); setOpen(null); }}><ReceiptIcon size={16}/> Účtenka</button>
            : <button className="primary" onClick={() => { setReceipt({draft: {bookingId: current.id, clientId: current.clientId, clientName: current.name, items: [{name: current.serviceName!, qty: 1, unitCents: current.priceCents || 0, kind: 'service'}], prepaidCents: current.depositStatus === 'paid' ? current.depositCents || 0 : 0, prepaidLabel: current.paymentKind === 'prepay' ? 'Zaplaceno předem' : 'Zaplacená kauce'}}); setOpen(null); }}><Check size={16}/> Dokončit</button>)}
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
  const [clientId, setClientId] = useState(booking.clientId || ''), [newName, setNewName] = useState(booking.name || '');
  const [serviceId, setServiceId] = useState(booking.serviceId || '');
  const [date, setDate] = useState(booking.date || salonNow().slice(0, 10));
  const [from, setFrom] = useState(booking.time || '10:00');
  const [to, setTo] = useState(() => shift(booking.time || '10:00', booking.start ? duration(booking as Booking) : 60));
  const length = toMinutes(to) - toMinutes(from), toInput = useRef<HTMLInputElement>(null);
  useEffect(() => { toInput.current?.setCustomValidity(length >= 5 ? '' : 'Konec musí být alespoň 5 minut po začátku.'); }, [length]);
  const isBlock = source === 'block', client = clients.find(c => c.id === clientId);
  return <form onSubmit={onSubmit}>
    <div className="dialog-header"><div><p className="eyebrow">KALENDÁŘ</p><h2>{booking.id ? 'Upravit' : 'Nový záznam'}</h2></div><button type="button" disabled={busy} aria-label="Zavřít formulář" onClick={onClose}><X size={21}/></button></div>
    <div className="fields">
      {!booking.id && <div className="segmented" role="radiogroup" aria-label="Typ záznamu">
        <label><input type="radio" name="source" value="salon" checked={!isBlock} onChange={() => setSource('salon')}/> Rezervace</label>
        <label><input type="radio" name="source" value="block" checked={isBlock} onChange={() => setSource('block')}/> Blokovat čas (volno, pauza)</label>
      </div>}
      {isBlock ? <label className="field"><span>Popis</span><input name="serviceName" defaultValue={booking.serviceName || 'Volno'} maxLength={150}/></label> : <>
        <ClientPicker clients={clients} value={clientId} onChange={(id, typed) => { setClientId(id); if (typed) setNewName(typed); }}/>
        {!client && <div className="field-grid"><label className="field"><span>Jméno *</span><input name="name" value={newName} onChange={e => setNewName(e.target.value)} required maxLength={120}/></label><label className="field"><span>Telefon</span><input name="phone" type="tel" defaultValue={booking.phone} maxLength={40}/></label></div>}
        <label className="field"><span>Ošetření *</span><select name="serviceId" required value={serviceId} onChange={e => { setServiceId(e.target.value); const s = services.find(x => x.id === e.target.value); if (s) setTo(shift(from, s.durationMin)); }}><option value="" disabled>Vyberte ošetření</option>{services.map(s => <option key={s.id} value={s.id}>{s.name} · {s.durationMin} min · {formatRevenue(s.priceCents)}</option>)}</select></label>
      </>}
      <fieldset className="term"><legend><span>Termín</span><b>{length >= 5 ? lengthText(length) : 'konec musí být po začátku'}</b></legend>
        <label className="field"><span>Datum · {dayTitle(date)}</span><input type="date" name="date" required value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }}/></label>
        <div className="date-shift" role="group" aria-label="Posunout datum">
          <button type="button" className="secondary" onClick={() => setDate(addDays(date, -1))}>−1 den</button>
          <button type="button" className="secondary" onClick={() => setDate(addDays(date, 1))}>+1 den</button>
          <button type="button" className="secondary" onClick={() => setDate(addDays(date, 7))}>+1 týden</button>
        </div>
        <div className="field-grid two-col"><label className="field"><span>Začátek</span><input type="time" name="time" required step={300} value={from} onChange={e => { const v = e.target.value; if (v) { setFrom(v); setTo(shift(v, length)); } }}/></label><label className="field"><span>Konec</span><input ref={toInput} type="time" required step={300} value={to} onChange={e => setTo(e.target.value)}/></label></div>
        <input type="hidden" name="durationMin" value={length}/>
      </fieldset>
      <label className="field"><span>Poznámka</span><textarea name="note" rows={2} maxLength={1000} defaultValue={booking.note}/></label>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="dialog-footer"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Zrušit</button><button className="primary" disabled={busy}>{busy ? 'Ukládám…' : 'Uložit'}</button></div>
  </form>;
}


/** Přesun termínu přímo z detailu: jiný den nebo čas, délka zůstane stejná. */
function MoveRow({booking, busy, onMove}: {booking: Booking; busy: boolean; onMove: (date: string, time: string) => void}) {
  const [date, setDate] = useState(booking.start.slice(0, 10)), [time, setTime] = useState(booking.start.slice(11));
  const changed = date !== booking.start.slice(0, 10) || time !== booking.start.slice(11);
  return <form className="move-row" onSubmit={e => { e.preventDefault(); if (changed) onMove(date, time); }}>
    <b>Přesunout na</b>
    <input type="date" aria-label="Nové datum" required value={date} onChange={e => setDate(e.target.value)}/>
    <input type="time" aria-label="Nový začátek" required step={300} value={time} onChange={e => setTime(e.target.value)}/>
    <span className="move-quick"><button type="button" className="secondary" onClick={() => setDate(addDays(date, -1))}>−1 den</button><button type="button" className="secondary" onClick={() => setDate(addDays(date, 1))}>+1 den</button><button type="button" className="secondary" onClick={() => setDate(addDays(date, 7))}>+1 týden</button></span>
    <button className="primary" disabled={busy || !changed}>Přesunout</button>
  </form>;
}

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('cs');
const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();

/** Výběr klientky z kartotéky s hledáním podle jména, telefonu nebo e-mailu (jako v MyFoxu). */
function ClientPicker({clients, value, onChange}: {clients: ClientLite[]; value: string; onChange: (id: string, typed?: string) => void}) {
  const [query, setQuery] = useState(''), [open, setOpen] = useState(!value);
  const selected = clients.find(c => c.id === value);
  const q = fold(query.trim()), digits = query.replace(/\D/g, '');
  const matches = clients.filter(c => !q || fold(c.name + ' ' + c.email).includes(q) || (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits)))
    .sort((a, b) => a.name.localeCompare(b.name, 'cs')).slice(0, 30);
  return <div className="field client-picker">
    <span>Klientka</span>
    <input type="hidden" name="clientId" value={value}/>
    {selected && !open ? <div className="picked">
      <span className="avatar">{initials(selected.name)}</span>
      <span><b>{selected.name}</b><small>{[selected.phone, selected.email].filter(Boolean).join(' · ') || 'Bez kontaktu'}</small>{selected.blocked === 1 && <small className="blocked-badge"><Ban size={12}/> Blokovaná online</small>}</span>
      <button type="button" className="secondary" onClick={() => { setOpen(true); setQuery(''); }}>Změnit</button>
    </div> : <>
      <label className="search"><Search size={18}/><input autoFocus={!value} aria-label="Hledat klientku" placeholder="Hledat jméno, telefon nebo e-mail…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (matches[0]) { onChange(matches[0].id); setOpen(false); } } }}/></label>
      <div className="picker-list" role="listbox" aria-label="Klientky">
        <button type="button" role="option" aria-selected={!value} className="picker-row new" onClick={() => { onChange('', /\d{3}|@/.test(query) ? '' : query.trim()); setOpen(false); }}><Plus size={18}/> {query.trim() && !/\d{3}|@/.test(query) ? `Nová klientka „${query.trim()}“` : 'Nová klientka / bez karty'}</button>
        {matches.map(c => <button type="button" role="option" aria-selected={c.id === value} key={c.id} className="picker-row" onClick={() => { onChange(c.id); setOpen(false); }}>
          <span className="avatar">{initials(c.name)}</span><span><b>{c.name}</b><small>{[c.phone, c.email].filter(Boolean).join(' · ')}</small></span>
        </button>)}
        {!matches.length && <p className="muted">Nikoho takového v kartotéce nemáte.</p>}
      </div>
    </>}
  </div>;
}

/** „1. 8. 9:00 – 14. 8. 18:00“, u celých dnů jen data. */
function absenceRange(a: Pick<Absence, 'start' | 'end'>) {
  const d = (x: string) => new Date(x.slice(0, 10) + 'T12:00:00').toLocaleDateString('cs-CZ', {day: 'numeric', month: 'numeric'});
  const whole = a.start.slice(11) === '00:00' && a.end.slice(11) === '23:59';
  if (whole) return a.start.slice(0, 10) === a.end.slice(0, 10) ? d(a.start) : `${d(a.start)} – ${d(a.end)}`;
  return a.start.slice(0, 10) === a.end.slice(0, 10) ? `${d(a.start)} ${a.start.slice(11)}–${a.end.slice(11)}` : `${d(a.start)} ${a.start.slice(11)} – ${d(a.end)} ${a.end.slice(11)}`;
}

/** Nepřítomnost salonu na více dní (dovolená, nemoc…): online rezervace se v tu dobu nenabízí. */
function AbsenceDialog({absence, bookings, onClose, onSaved}: {absence: Partial<Absence>; bookings: Booking[]; onClose: () => void; onSaved: (message: string) => void}) {
  const ref = useRef<HTMLDialogElement>(null), today = salonNow().slice(0, 10);
  const [wholeDays, setWholeDays] = useState(!absence.id || (absence.start?.slice(11) === '00:00' && absence.end?.slice(11) === '23:59'));
  const [from, setFrom] = useState(absence.start?.slice(0, 10) || today), [to, setTo] = useState(absence.end?.slice(0, 10) || today);
  const [fromTime, setFromTime] = useState(absence.start && !wholeDays ? absence.start.slice(11) : '09:00'), [toTime, setToTime] = useState(absence.end && !wholeDays ? absence.end.slice(11) : '17:00');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { ref.current?.showModal(); }, []);
  const start = from + 'T' + (wholeDays ? '00:00' : fromTime), end = to + 'T' + (wholeDays ? '23:59' : toTime);
  const clash = bookings.filter(b => b.source !== 'block' && ['confirmed', 'pending'].includes(b.status) && b.start < end && b.end > start);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('');
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const d = await post({kind: 'absence', action: 'save', data: {id: absence.id || '', reason: f.reason, note: f.note, fromDate: from, toDate: to, fromTime: wholeDays ? '00:00' : fromTime, toTime: wholeDays ? '23:59' : toTime}});
      onSaved(d.clash ? `Nepřítomnost je uložená. V tomto období ${d.clash === 1 ? 'zůstala 1 rezervace' : d.clash < 5 ? `zůstaly ${d.clash} rezervace` : `zůstalo ${d.clash} rezervací`}, přesuňte ${d.clash === 1 ? 'ji' : 'je'} nebo zrušte.` : 'Nepřítomnost je uložená, online se v tu dobu nerezervuje.');
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError('');
    try { await post({kind: 'absence', action: 'delete', data: {id: absence.id}}); onSaved('Nepřítomnost byla odstraněna.'); } catch (err) { setError((err as Error).message); setBusy(false); }
  }
  return <dialog ref={ref} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}><form onSubmit={save}>
    <div className="dialog-header"><div><p className="eyebrow">KALENDÁŘ</p><h2>{absence.id ? 'Upravit nepřítomnost' : 'Nastavit nepřítomnost'}</h2></div><button type="button" disabled={busy} aria-label="Zavřít" onClick={onClose}><X size={21}/></button></div>
    <div className="fields">
      <label className="field"><span>Důvod</span><select name="reason" defaultValue={absence.reason || ABSENCE_REASONS[0]}>{ABSENCE_REASONS.map(r => <option key={r}>{r}</option>)}</select></label>
      <label className="check"><input type="checkbox" checked={wholeDays} onChange={e => setWholeDays(e.target.checked)}/> Celé dny</label>
      <div className="field-grid two-col">
        <label className="field"><span>Od</span><input type="date" required value={from} onChange={e => { if (e.target.value) { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); } }}/></label>
        <label className="field"><span>Do</span><input type="date" required min={from} value={to} onChange={e => { if (e.target.value) setTo(e.target.value); }}/></label>
        {!wholeDays && <><label className="field"><span>Od (čas)</span><input type="time" required step={300} value={fromTime} onChange={e => setFromTime(e.target.value)}/></label>
          <label className="field"><span>Do (čas)</span><input type="time" required step={300} value={toTime} onChange={e => setToTime(e.target.value)}/></label></>}
      </div>
      <label className="field"><span>Poznámka (jen pro vás)</span><input name="note" maxLength={300} defaultValue={absence.note}/></label>
      <p className="muted-inline">Po celou dobu se na webu nenabídnou žádné volné termíny. Rezervace, které už v tomto období máte, zůstanou a je potřeba je přesunout.</p>
      {clash.length > 0 && <div className="caution-box" role="note"><AlertTriangle size={16}/> <span>V tomto období {clash.length === 1 ? 'je 1 rezervace' : clash.length < 5 ? `jsou ${clash.length} rezervace` : `je ${clash.length} rezervací`} (z tohoto týdne): {clash.slice(0, 4).map(b => `${b.name} ${new Date(b.start.slice(0, 10) + 'T12:00:00').toLocaleDateString('cs-CZ', {day: 'numeric', month: 'numeric'})} ${b.start.slice(11)}`).join(', ')}{clash.length > 4 ? '…' : ''}</span></div>}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="dialog-footer">{absence.id && <button type="button" className="secondary danger" disabled={busy} onClick={remove}><Trash2 size={16}/> Odstranit</button>}<button type="button" className="secondary" disabled={busy} onClick={onClose}>Zrušit</button><button className="primary" disabled={busy || end <= start}>{busy ? 'Ukládám…' : 'Uložit'}</button></div>
  </form></dialog>;
}

/** Fotky, které klientka přiložila k online rezervaci; načítají se přes přihlášené API. */
function BookingPhotos({bookingId, count, canCopy}: {bookingId: string; count: number; canCopy: boolean}) {
  const [urls, setUrls] = useState<string[]>([]), [big, setBig] = useState(''), [copied, setCopied] = useState<number[]>([]), [error, setError] = useState('');
  useEffect(() => {
    let alive = true; const made: string[] = [];
    Promise.all(Array.from({length: count}, (_, i) => fetch(`/api/bookings?photo=${encodeURIComponent(bookingId)}&n=${i}`, {cache: 'no-store'}).then(r => r.ok ? r.blob() : null)))
      .then(list => { for (const b of list) made.push(b ? URL.createObjectURL(b) : ''); if (alive) setUrls(made); });
    return () => { alive = false; made.forEach(u => u && URL.revokeObjectURL(u)); };
  }, [bookingId, count]);
  async function copy(n: number) {
    setError('');
    try { await post({kind: 'booking', action: 'photoToClient', data: {id: bookingId, n}}); setCopied(c => [...c, n]); } catch (e) { setError((e as Error).message); }
  }
  return <div className="booking-photos">
    <p><Camera size={16}/> <b>Fotky od klientky</b></p>
    <div className="booking-photo-row">{Array.from({length: count}, (_, i) => <figure key={i}>
      {urls[i] ? <button type="button" className="photo-thumb" onClick={() => setBig(urls[i])}><img src={urls[i]} alt={`Fotka ${i + 1} od klientky`}/></button> : <span className="photo-thumb loading"/>}
      {canCopy && <button type="button" className="link-button" disabled={copied.includes(i)} onClick={() => copy(i)}>{copied.includes(i) ? 'Uloženo na kartě' : 'Uložit na kartu'}</button>}
    </figure>)}</div>
    {error && <p className="error-inline">{error}</p>}
    {big && <button type="button" className="photo-zoom" aria-label="Zavřít fotku" onClick={() => setBig('')}><img src={big} alt="Fotka od klientky"/></button>}
  </div>;
}
