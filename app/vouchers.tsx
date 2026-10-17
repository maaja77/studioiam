'use client';
// Dárkové poukazy: prodej, přehled s hlídáním platnosti, čerpání, prodloužení, storno a tisk.
import {useEffect, useRef, useState} from 'react';
import {CalendarClock, Gift, Plus, Printer, Search, X} from 'lucide-react';
import {formatRevenue} from '../lib/revenue';
import {addMonths, daysLeft, voucherState, type Voucher, type VoucherState} from '../lib/vouchers';
import {DEFAULT_SETTINGS, salonName, type BookingSettings} from '../lib/booking';
import {ReceiptDialog} from './receipts';
import {logoSrc} from './logo';

type Client = {id: string; name: string};
type Use = {id: string; date: string; amountCents: number; note: string; receiptId: string | null; receiptNumber: string | null};
type Filter = 'valid' | 'expiring' | 'expired' | 'used' | 'all';
const dateText = (s: string) => s.split('-').reverse().map(Number).join('. ');
const STATE_LABEL: Record<VoucherState, string> = {active: 'Platný', expiring: 'Brzy vyprší', expired: 'Prošlý', used: 'Vyčerpaný', cancelled: 'Stornovaný'};
const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function post(body: unknown) {
  const r = await fetch('/api/vouchers', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const d = await r.json() as {error?: string; id?: string; receiptId?: string | null};
  if (!r.ok) throw new Error(d.error || 'Změnu se nepodařilo uložit.');
  return d;
}

function stateText(v: Voucher, today: string) {
  const state = voucherState(v, today), left = daysLeft(v.validUntil, today);
  if (state === 'expiring') return left === 0 ? 'vyprší dnes' : left === 1 ? 'vyprší zítra' : `vyprší za ${left} ${left <= 4 ? 'dny' : 'dní'}`;
  if (state === 'expired') return `prošel ${dateText(v.validUntil)}`;
  if (state === 'active') return `platí do ${dateText(v.validUntil)}`;
  return STATE_LABEL[state].toLowerCase();
}
const valueText = (v: Voucher) => v.kind === 'service' ? v.serviceName : formatRevenue(v.valueCents);

/** Poukaz k tisku nebo uložení do PDF (formát A6 na šířku). */
export function VoucherCard({voucher, settings}: {voucher: Voucher; settings: BookingSettings}) {
  return <article className="voucher-card">
    <img src={logoSrc(settings.logoVersion)} alt="" width={64} height={64}/>
    <p className="voucher-salon">{salonName(settings)}</p>
    <h3>Dárkový poukaz</h3>
    <p className="voucher-value">{voucher.kind === 'service' ? <>na ošetření<br/><b>{voucher.serviceName}</b></> : <>v hodnotě <b>{formatRevenue(voucher.valueCents)}</b></>}</p>
    {voucher.recipientName && <p className="voucher-for">pro <b>{voucher.recipientName}</b></p>}
    <p className="voucher-meta"><span>Kód <b>{voucher.code}</b></span><span>Platí do <b>{dateText(voucher.validUntil)}</b></span></p>
    <p className="voucher-contact">{[settings.businessAddress, settings.businessPhone && 'tel. ' + settings.businessPhone].filter(Boolean).join(' · ')}</p>
  </article>;
}

function NewVoucher({months, onCreated, onCancel}: {months: number; onCreated: (id: string, receiptId: string | null) => void; onCancel: () => void}) {
  const today = new Date().toLocaleDateString('sv-SE', {timeZone: 'Europe/Prague'});
  const [kind, setKind] = useState<'value' | 'service'>('value'), [services, setServices] = useState<{name: string; priceCents: number}[]>([]);
  const [value, setValue] = useState(''), [serviceName, setServiceName] = useState(''), [validUntil, setValidUntil] = useState(() => addMonths(today, months));
  const [receipt, setReceipt] = useState(true), [method, setMethod] = useState('qr'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { fetch('/api/bookings?from=2000-01-01&to=2000-01-01', {cache: 'no-store'}).then(r => r.json() as Promise<{services?: {name: string; priceCents: number}[]}>).then(d => setServices(d.services || [])).catch(() => {}); }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('');
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try { const d = await post({action: 'create', data: {...f, kind, serviceName, value, validUntil, receipt, method}}); onCreated(d.id!, d.receiptId ?? null); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <form onSubmit={submit}>
    <div className="fields">
      <span className="segmented-mini voucher-kind" role="radiogroup" aria-label="Druh poukazu">{([['value', 'Na částku'], ['service', 'Na ošetření']] as const).map(([k, l]) => <button type="button" key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>{l}</button>)}</span>
      {kind === 'service' ? <div className="field-grid">
        <label className="field"><span>Ošetření</span><select required value={serviceName} onChange={e => { setServiceName(e.target.value); const s = services.find(x => x.name === e.target.value); if (s?.priceCents) setValue(String(s.priceCents / 100)); }}>
          <option value="">Vyberte…</option>{services.map(s => <option key={s.name} value={s.name}>{s.name}{s.priceCents ? ` · ${formatRevenue(s.priceCents)}` : ''}</option>)}</select></label>
        <label className="field"><span>Cena poukazu (Kč)</span><input inputMode="decimal" required value={value} onChange={e => setValue(e.target.value)}/></label>
      </div> : <label className="field"><span>Hodnota (Kč)</span><span className="voucher-amounts"><input inputMode="decimal" required value={value} placeholder="např. 1500" onChange={e => setValue(e.target.value)}/>{[500, 1000, 1500, 2000].map(n => <button type="button" key={n} className="secondary" onClick={() => setValue(String(n))}>{formatRevenue(n * 100)}</button>)}</span></label>}
      <div className="field-grid">
        <label className="field"><span>Pro koho (jméno na poukazu)</span><input name="recipientName" maxLength={120} placeholder="Nepovinné"/></label>
        <label className="field"><span>Platí do</span><span className="voucher-amounts"><input type="date" required min={today} value={validUntil} onChange={e => setValidUntil(e.target.value)}/>{[6, 12].map(m => <button type="button" key={m} className="secondary" onClick={() => setValidUntil(addMonths(today, m))}>{m} měs.</button>)}</span></label>
      </div>
      <div className="field-grid">
        <label className="field"><span>Kupující</span><input name="buyerName" maxLength={120} placeholder="Kdo poukaz koupil"/></label>
        <label className="field"><span>Kontakt na kupující</span><input name="buyerContact" maxLength={120} placeholder="Telefon nebo e-mail"/></label>
      </div>
      <label className="field"><span>Poznámka</span><input name="note" maxLength={500}/></label>
      <label className="check"><input type="checkbox" checked={receipt} onChange={e => setReceipt(e.target.checked)}/> Vystavit účtenku za prodej (započítá se do tržeb)</label>
      {receipt && <fieldset className="method"><legend>Platba</legend>{([['cash', 'Hotově'], ['card', 'Kartou'], ['qr', 'QR platba / převod']] as const).map(([k, l]) => <label key={k} className={method === k ? 'active' : ''}><input type="radio" name="method-choice" checked={method === k} onChange={() => setMethod(k)}/> {l}</label>)}</fieldset>}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="dialog-footer"><button type="button" className="secondary" onClick={onCancel}>Zrušit</button><button className="primary" disabled={busy}><Gift size={16}/> {busy ? 'Ukládám…' : 'Vystavit poukaz'}</button></div>
  </form>;
}

function VoucherDetail({id, settings, onChanged, onReceipt}: {id: string; settings: BookingSettings; onChanged: () => void; onReceipt: (id: string) => void}) {
  const [data, setData] = useState<{voucher: Voucher; uses: Use[]; today: string} | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'' | 'use' | 'extend' | 'cancel'>(''), [amount, setAmount] = useState(''), [note, setNote] = useState(''), [until, setUntil] = useState('');
  async function load() { try { const r = await fetch('/api/vouchers?id=' + encodeURIComponent(id), {cache: 'no-store'}); const d = await r.json() as {voucher: Voucher; uses: Use[]; today: string; error?: string}; if (!r.ok) throw new Error(d.error); setData(d); setUntil(d.voucher.validUntil); } catch (e) { setError((e as Error).message); } }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function run(body: Record<string, unknown>) {
    setBusy(true); setError('');
    try { await post(body); setMode(''); setAmount(''); setNote(''); await load(); onChanged(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!data) return <div className="fields">{error ? <p className="error" role="alert">{error}</p> : <p className="muted">Načítám…</p>}</div>;
  const v = data.voucher, state = voucherState(v, data.today), open = state !== 'cancelled' && state !== 'used';
  return <>
    <div className="fields">
      <VoucherCard voucher={v} settings={settings}/>
      <dl className="voucher-facts">
        <div><dt>Stav</dt><dd><span className={'voucher-state ' + state}>{STATE_LABEL[state]}</span> {stateText(v, data.today)}</dd></div>
        <div><dt>Zůstatek</dt><dd>{v.kind === 'service' ? (v.balanceCents > 0 ? 'nevyčerpáno' : 'vyčerpáno') : formatRevenue(v.balanceCents) + ' z ' + formatRevenue(v.valueCents)}</dd></div>
        <div><dt>Vystaven</dt><dd>{dateText(v.issued)}{v.receiptId && <> · <button type="button" className="link-button" onClick={() => onReceipt(v.receiptId!)}>účtenka za prodej</button></>}</dd></div>
        {(v.buyerName || v.buyerContact) && <div><dt>Kupující</dt><dd>{[v.buyerName, v.buyerContact].filter(Boolean).join(', ')}</dd></div>}
        {v.note && <div><dt>Poznámka</dt><dd className="pre">{v.note}</dd></div>}
      </dl>
      {data.uses.length > 0 && <div className="voucher-uses"><h3>Čerpání</h3><ul>{data.uses.map(u => <li key={u.id}><span>{dateText(u.date)}</span><span>{u.receiptId ? <button type="button" className="link-button" onClick={() => onReceipt(u.receiptId!)}>účtenka {u.receiptNumber}</button> : u.note || 'zapsáno ručně'}</span><b>−{formatRevenue(u.amountCents)}</b></li>)}</ul></div>}
      {mode === 'use' && <form className="voucher-inline" onSubmit={e => { e.preventDefault(); run({action: 'use', data: {id, amount, note}}); }}>
        <p className="muted-inline">Poukaz se obvykle uplatní na účtence při Dokončit. Ručně zapište jen čerpání mimo účtenku.</p>
        {v.kind === 'value' && <label className="field"><span>Částka (Kč)</span><input inputMode="decimal" required value={amount} onChange={e => setAmount(e.target.value)} placeholder={String(v.balanceCents / 100)}/></label>}
        <label className="field"><span>Poznámka</span><input value={note} maxLength={200} onChange={e => setNote(e.target.value)}/></label>
        <div className="form-actions"><button type="button" className="secondary" onClick={() => setMode('')}>Zpět</button><button className="primary" disabled={busy}>{v.kind === 'service' ? 'Označit jako vyčerpaný' : 'Zapsat čerpání'}</button></div>
      </form>}
      {mode === 'extend' && <form className="voucher-inline" onSubmit={e => { e.preventDefault(); run({action: 'extend', data: {id, validUntil: until}}); }}>
        <label className="field"><span>Nová platnost do</span><span className="voucher-amounts"><input type="date" required value={until} onChange={e => setUntil(e.target.value)}/>{[1, 3, 6].map(m => <button type="button" key={m} className="secondary" onClick={() => setUntil(addMonths(v.validUntil > data.today ? v.validUntil : data.today, m))}>+{m} měs.</button>)}</span></label>
        <div className="form-actions"><button type="button" className="secondary" onClick={() => setMode('')}>Zpět</button><button className="primary" disabled={busy}>Uložit platnost</button></div>
      </form>}
      {mode === 'cancel' && <div className="voucher-inline"><p>Stornovat poukaz {v.code}? {v.receiptId && 'Stornuje se i účtenka za jeho prodej.'}</p>
        <div className="form-actions"><button type="button" className="secondary" onClick={() => setMode('')}>Ne</button><button type="button" className="secondary danger-text" disabled={busy} onClick={() => run({action: 'cancel', data: {id}})}>Ano, stornovat</button></div></div>}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {!mode && <div className="dialog-footer receipt-actions">
      {open && v.balanceCents === v.valueCents && <button className="secondary" onClick={() => setMode('cancel')}>Storno</button>}
      {state !== 'cancelled' && state !== 'used' && <button className="secondary" onClick={() => setMode('use')}>Zapsat čerpání</button>}
      {state !== 'cancelled' && state !== 'used' && <button className="secondary" onClick={() => setMode('extend')}><CalendarClock size={16}/> Prodloužit</button>}
      <button className="secondary" onClick={() => window.print()}><Printer size={16}/> Tisk / PDF</button>
    </div>}
  </>;
}

export default function Vouchers({clients, onChanged}: {clients: Client[]; onChanged?: () => void}) {
  const [list, setList] = useState<Voucher[]>([]), [today, setToday] = useState(''), [months, setMonths] = useState(12), [settings, setSettings] = useState<BookingSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [filter, setFilter] = useState<Filter>('valid'), [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<{kind: 'new'} | {kind: 'detail'; id: string} | null>(null), [receiptId, setReceiptId] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  async function load() {
    try {
      const [r, s] = await Promise.all([fetch('/api/vouchers', {cache: 'no-store'}), fetch('/api/receipts?month=2000-01', {cache: 'no-store'})]);
      const d = await r.json() as {vouchers?: Voucher[]; today?: string; months?: number; error?: string}; if (!d.vouchers) throw new Error(d.error);
      setList(d.vouchers); setToday(d.today!); setMonths(d.months || 12); setError('');
      const ds = await s.json() as {settings?: BookingSettings}; if (ds.settings) setSettings(ds.settings);
    } catch (e) { setError((e as Error).message || 'Poukazy se nepodařilo načíst.'); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (dialog) ref.current?.showModal(); else ref.current?.close(); }, [dialog]);
  const changed = () => { load(); onChanged?.(); };

  const states = list.map(v => ({v, state: voucherState(v, today)}));
  const count = (f: (s: VoucherState) => boolean) => states.filter(x => f(x.state)).length;
  const valid = states.filter(x => x.state === 'active' || x.state === 'expiring');
  const year = today.slice(0, 4), soldThisYear = list.filter(v => v.status !== 'cancelled' && v.issued.startsWith(year));
  const match: Record<Filter, (s: VoucherState) => boolean> = {valid: s => s === 'active' || s === 'expiring', expiring: s => s === 'expiring', expired: s => s === 'expired', used: s => s === 'used' || s === 'cancelled', all: () => true};
  const q = fold(query.trim());
  const shown = states.filter(x => match[filter](x.state) && (!q || fold([x.v.code, x.v.recipientName, x.v.buyerName, x.v.buyerContact, x.v.serviceName].join(' ')).includes(q)))
    .sort((a, b) => filter === 'valid' || filter === 'expiring' ? a.v.validUntil.localeCompare(b.v.validUntil) : b.v.issued.localeCompare(a.v.issued));

  return <div className="vouchers">
    <div className="heading"><div><p className="eyebrow">DÁRKOVÉ POUKAZY</p><h1>Poukazy</h1><p>Prodané poukazy, jejich zůstatek a platnost. Uplatníte je na účtence při Dokončit.</p></div>
      <button className="primary" onClick={() => setDialog({kind: 'new'})}><Plus size={18}/> Nový poukaz</button></div>
    {error && <div className="error" role="alert">{error}</div>}
    {count(s => s === 'expiring') > 0 && <div className="setup-hint" role="note"><span><CalendarClock size={16}/> {count(s => s === 'expiring')} {count(s => s === 'expiring') === 1 ? 'poukaz vyprší' : 'poukazy vyprší'} do 30 dnů. Můžete obdarované připomenout, ať se objednají, nebo platnost prodloužit.</span>{filter !== 'expiring' && <button className="secondary" onClick={() => setFilter('expiring')}>Zobrazit</button>}</div>}
    <section className="stat-tiles" aria-label="Souhrn poukazů">
      <div className="stat-tile main"><span>Platné poukazy</span><strong>{valid.length}</strong><small>nevyčerpáno {formatRevenue(valid.reduce((s, x) => s + (x.v.kind === 'service' ? x.v.valueCents : x.v.balanceCents), 0))}</small></div>
      <div className="stat-tile"><span>Vyprší do 30 dnů</span><strong>{count(s => s === 'expiring')}</strong><small>prošlé nevyčerpané: {count(s => s === 'expired')}</small></div>
      <div className="stat-tile"><span>Prodáno v roce {year}</span><strong>{soldThisYear.length}</strong><small>v hodnotě {formatRevenue(soldThisYear.reduce((s, v) => s + v.valueCents, 0))}</small></div>
    </section>
    <div className="voucher-tools">
      <span className="segmented-mini" role="radiogroup" aria-label="Zobrazit">{([['valid', 'Platné'], ['expiring', 'Brzy vyprší'], ['expired', 'Prošlé'], ['used', 'Vyčerpané'], ['all', 'Vše']] as const).map(([k, l]) => <button type="button" key={k} role="radio" aria-checked={filter === k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{l}</button>)}</span>
      <label className="search"><Search size={16}/><input aria-label="Hledat poukaz" placeholder="Kód nebo jméno…" value={query} onChange={e => setQuery(e.target.value)}/></label>
    </div>
    <div className="panel"><ul className="receipt-list voucher-list">{loading ? <li className="muted">Načítám…</li> : !shown.length ? <li className="muted">{list.length ? 'Žádný poukaz v tomto výběru.' : 'Zatím žádné poukazy. Nový vystavíte tlačítkem Nový poukaz.'}</li> : shown.map(({v, state}) => <li key={v.id}>
      <button onClick={() => setDialog({kind: 'detail', id: v.id})} className={state === 'cancelled' ? 'cancelled' : ''}>
        <span className="receipt-no">{v.code}</span>
        <span className="receipt-who"><b>{v.recipientName || v.buyerName || 'Bez jména'}</b><small>{valueText(v)}{v.buyerName && v.recipientName && ` · od ${v.buyerName}`} · vystaven {dateText(v.issued)}</small></span>
        <span className="receipt-amount"><b>{v.kind === 'service' ? (v.balanceCents > 0 ? 'ošetření' : '–') : formatRevenue(v.balanceCents)}</b><small className={'voucher-state ' + state}>{stateText(v, today)}</small></span>
      </button></li>)}</ul></div>
    <dialog ref={ref} className="receipt-dialog voucher-dialog" onCancel={() => setDialog(null)} onClose={() => setDialog(null)}>
      {dialog && <><div className="dialog-header"><div><p className="eyebrow">{dialog.kind === 'new' ? 'NOVÝ POUKAZ' : 'DÁRKOVÝ POUKAZ'}</p><h2>{dialog.kind === 'new' ? 'Prodej poukazu' : list.find(v => v.id === dialog.id)?.code}</h2></div><button type="button" aria-label="Zavřít" onClick={() => setDialog(null)}><X size={21}/></button></div>
        {dialog.kind === 'new' ? <NewVoucher months={months} onCancel={() => setDialog(null)} onCreated={(id, rid) => { changed(); setDialog({kind: 'detail', id}); if (rid) setReceiptId(rid); }}/>
        : <VoucherDetail key={dialog.id} id={dialog.id} settings={settings} onChanged={changed} onReceipt={setReceiptId}/>}</>}
    </dialog>
    {receiptId && <ReceiptDialog receiptId={receiptId} clients={clients} onClose={() => setReceiptId(null)} onChanged={changed}/>}
  </div>;
}

