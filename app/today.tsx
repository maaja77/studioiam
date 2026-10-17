'use client';
// Přehled dne: dnešní klientky s upozorněními z karty a dotazníku a co čeká na vyřízení.
import {useEffect, useState} from 'react';
import {AlertTriangle, CalendarDays, ClipboardList, Gift, Mail, Package, Phone, Receipt, UserRound, Wallet} from 'lucide-react';
import {formatRevenue} from '../lib/revenue';
import ReviewRequests from './reviews';
import Birthdays from './birthdays';
import type {TodayBooking, TodayData} from './api/today/route';

type View = 'bookings' | 'receipts' | 'vouchers' | 'stock';
const time = (s: string) => s.slice(11, 16).replace(/^0/, '');
const dateText = (s: string) => s.slice(0, 10).split('-').reverse().map(Number).join('. ');
const plural = (n: number, one: string, few: string, many: string) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;

function Flags({b}: {b: TodayBooking}) {
  const flags: [string, string][] = [];
  if (b.firstVisit) flags.push(['info', 'Nová klientka']);
  if (b.birthday) flags.push(['info', b.birthday]);
  if (b.depositStatus === 'pending') flags.push(['warn', `Kauce ${b.depositCents ? formatRevenue(b.depositCents) + ' ' : ''}nezaplacená`]);
  if (b.depositStatus === 'paid') flags.push(['ok', 'Kauce zaplacená']);
  if (b.intake === 'sent') flags.push(['warn', 'Dotazník nevyplněný']);
  else if (!b.intake) flags.push(['muted', 'Bez dotazníku']);
  if (b.receiptId || b.status === 'done') flags.push(['ok', 'Dokončeno']);
  if (b.status === 'pending') flags.push(['warn', 'Čeká na potvrzení']);
  return <span className="today-flags">{flags.map(([k, l]) => <span key={l} className={'today-flag ' + k}>{l}</span>)}</span>;
}

export default function Today({onOpenClient, onGo}: {onOpenClient: (id: string) => void; onGo: (view: View) => void}) {
  const [data, setData] = useState<TodayData | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function load() {
    try { const r = await fetch('/api/today', {cache: 'no-store'}); const d = await r.json() as TodayData & {error?: string}; if (!r.ok) throw new Error(d.error); setData(d); setError(''); }
    catch (e) { setError((e as Error).message || 'Přehled se nepodařilo načíst.'); }
  }
  useEffect(() => { load(); const t = setInterval(load, 5 * 60_000); return () => clearInterval(t); }, []);
  async function toggleMail(on: boolean) {
    setBusy(true);
    try { const r = await fetch('/api/today', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'mail', data: {on}})}); const d = await r.json() as {error?: string}; if (!r.ok) throw new Error(d.error); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!data) return error ? <p className="error" role="alert">{error}</p> : <p className="muted">Načítám…</p>;

  const day = new Date(data.today + 'T12:00:00').toLocaleDateString('cs-CZ', {weekday: 'long', day: 'numeric', month: 'long'});
  // Probíhající nebo nejbližší další termín se zvýrazní.
  const current = data.bookings.find(b => b.end > data.now && !b.receiptId && b.status !== 'done')?.id;
  const t = data.todo, todo = [
    t.pendingDeposits.length > 0 && {icon: <Wallet size={18}/>, label: plural(t.pendingDeposits.length, 'nezaplacená kauce', 'nezaplacené kauce', 'nezaplacených kaucí'), detail: t.pendingDeposits.slice(0, 3).map(d => `${d.name} ${dateText(d.start)}`).join(', '), go: 'bookings' as View},
    t.notFinished > 0 && {icon: <ClipboardList size={18}/>, label: plural(t.notFinished, 'proběhlý termín bez účtenky', 'proběhlé termíny bez účtenky', 'proběhlých termínů bez účtenky'), detail: 'Dokončete je v kalendáři.', go: 'bookings' as View},
    t.unpaidReceipts.count > 0 && {icon: <Receipt size={18}/>, label: plural(t.unpaidReceipts.count, 'nezaplacená účtenka', 'nezaplacené účtenky', 'nezaplacených účtenek'), detail: formatRevenue(t.unpaidReceipts.cents), go: 'receipts' as View},
    t.vouchersPending > 0 && {icon: <Gift size={18}/>, label: plural(t.vouchersPending, 'poukaz z webu čeká', 'poukazy z webu čekají', 'poukazů z webu čeká'), detail: 'na zaplacení', go: 'vouchers' as View},
    t.stockLow.length > 0 && {icon: <Package size={18}/>, label: `Dochází ${plural(t.stockLow.length, 'produkt', 'produkty', 'produktů')}`, detail: t.stockLow.slice(0, 3).join(', '), go: 'stock' as View},
  ].filter(Boolean) as {icon: React.ReactNode; label: string; detail: string; go: View}[];

  return <div className="today">
    <div className="heading"><div><p className="eyebrow">PŘEHLED DNE</p><h1>{day.charAt(0).toUpperCase() + day.slice(1)}</h1>
      <p>{data.bookings.length ? `${plural(data.bookings.length, 'termín', 'termíny', 'termínů')}, první v ${time(data.bookings[0].start)}, poslední končí v ${time(data.bookings[data.bookings.length - 1].end)}.` : 'Dnes nemáte žádné objednané termíny.'}
        {t.tomorrow > 0 && ` Zítra ${plural(t.tomorrow, 'termín', 'termíny', 'termínů')}.`}</p></div></div>
    {error && <div className="error" role="alert">{error}</div>}
    <div className="today-layout">
      <section className="panel today-list" aria-label="Dnešní termíny">
        {!data.bookings.length && !data.blocks.length ? <p className="muted">Volný den. Můžete se podívat na klientky, které dlouho nebyly.</p> : <ol>
          {[...data.bookings.map(b => ({at: b.start, b})), ...data.blocks.map(x => ({at: x.start, x}))].sort((a, c) => a.at.localeCompare(c.at)).map(item => 'x' in item && item.x
            ? <li key={'x' + item.at} className="today-block"><span className="today-time">{time(item.x.start)}<small>{time(item.x.end)}</small></span><div><b>{item.x.serviceName || 'Blokováno'}</b><small>Blokovaný čas</small></div></li>
            : (() => { const b = (item as {b: TodayBooking}).b, warn = [b.cautions.trim(), ...b.warnings].filter(Boolean); return <li key={b.id} className={b.id === current ? 'current' : b.receiptId || b.status === 'done' ? 'done' : ''}>
              <span className="today-time">{time(b.start)}<small>{time(b.end)}</small></span>
              <div className="today-main">
                <b>{b.name || 'Bez jména'}</b><span className="today-service">{b.serviceName}</span>
                <Flags b={b}/>
                {warn.length > 0 && <div className="today-warn" role="note"><AlertTriangle size={16}/><div>{warn.map((w, i) => <p key={i}>{w}</p>)}</div></div>}
                <small className="today-last">{b.lastVisit ? `Naposledy ${dateText(b.lastVisit)}${b.lastTreatment ? ' · ' + b.lastTreatment : ''}` : b.firstVisit ? 'První návštěva' : ''}{b.note && ` · Poznámka: ${b.note}`}</small>
              </div>
              <div className="today-actions">
                {b.clientId && <button className="secondary" onClick={() => onOpenClient(b.clientId!)}><UserRound size={15}/> Karta</button>}
                {b.phone && <a className="secondary" href={'tel:' + b.phone.replace(/[^\d+]/g, '')}><Phone size={15}/> Volat</a>}
              </div>
            </li>; })())}
        </ol>}
        <button className="link-button today-calendar" onClick={() => onGo('bookings')}><CalendarDays size={14}/> Otevřít kalendář</button>
      </section>
      <aside className="today-side">
        <section className="panel"><h2>Čeká na vyřízení</h2>
          {!todo.length ? <p className="muted-inline">Nic, všechno je vyřízené.</p> : <ul className="today-todo">{todo.map(x => <li key={x.label}><button onClick={() => onGo(x.go)}>{x.icon}<span><b>{x.label}</b><small>{x.detail}</small></span></button></li>)}</ul>}
        </section>
        <Birthdays onOpenClient={onOpenClient}/>
        <ReviewRequests/>
        <section className="panel today-mail"><label className="check"><input type="checkbox" checked={data.morningMail} disabled={busy} onChange={e => toggleMail(e.target.checked)}/> <span><Mail size={15}/> Posílat mi tento přehled každé ráno v 7:00 e-mailem</span></label>
          <small className="muted-inline">{data.mail ? 'E-mail obsahuje jen časy, ošetření a jména. Upozornění a zdravotní údaje zůstávají jen tady v aplikaci.' : 'E-maily zatím nejsou na serveru nastavené, přehled se pošle, až je správce zapne.'}</small></section>
      </aside>
    </div>
  </div>;
}
