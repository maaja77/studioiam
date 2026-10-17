'use client';
import {useEffect, useRef, useState} from 'react';
import {Banknote, Check, Landmark, Copy, CreditCard, Gift, Mail, MessageSquare, Plus, Printer, QrCode as QrIcon, Receipt as ReceiptIcon, Share2, Trash2, X} from 'lucide-react';
import {formatRevenue, parseRevenue} from '../lib/revenue';
import {czIban, formatIban, spdPayload} from '../lib/payment';
import {DEFAULT_SETTINGS, salonName, salonNow, type BookingSettings} from '../lib/booking';
import {QrCode} from './qr-payment';
import BankPayments from './bank';
import {voucherCover, voucherState, type Voucher} from '../lib/vouchers';
import {logoSrc} from './logo';

export type ReceiptItem = {name: string; qty: number; unitCents: number; kind: 'service' | 'product' | 'voucher' | 'other'; productId?: string};
export type Receipt = {id: string; number: string; bookingId: string | null; clientId: string | null; clientName: string; issued: string; items: ReceiptItem[]; totalCents: number; prepaidCents: number; dueCents: number; method: string; paid: number; vs: string; status: string; note: string; discountCents?: number; discountLabel?: string; voucherCents?: number; voucherCode?: string | null};
export type Product = {id: string; name: string; priceCents: number; active: number; sort: number; stock?: number | null};
/** Podklad pro novou účtenku, např. z rezervace v kalendáři. */
export type ReceiptDraft = {bookingId?: string; clientId?: string | null; clientName?: string; items: ReceiptItem[]; prepaidCents?: number; prepaidLabel?: string};
type Client = {id: string; name: string};

export const METHOD_LABEL: Record<string, string> = {cash: 'Hotově', card: 'Kartou', qr: 'QR platba / převod'};
const dateText = (s: string) => s.split('-').reverse().map(Number).join('. ');
const issuedText = (s: string) => new Date(s + ':00').toLocaleString('cs-CZ', {day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'});

async function post(body: unknown) {
  const r = await fetch('/api/receipts', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const d = await r.json() as {error?: string; id?: string};
  if (!r.ok) throw new Error(d.error || 'Změnu se nepodařilo uložit.');
  return d;
}

/** Účtenka k tisku: údaje salonu, položky, odečtená záloha a QR kód na doplatek. */
export function ReceiptPaper({receipt, settings}: {receipt: Receipt; settings: BookingSettings}) {
  const iban = czIban(settings.account);
  const qr = iban && receipt.dueCents > 0 && !receipt.paid && receipt.status === 'issued'
    ? spdPayload({iban, amountCents: receipt.dueCents, vs: receipt.vs, message: 'Uctenka ' + receipt.number, recipient: settings.accountName}) : '';
  return <article className={'receipt-paper' + (receipt.status === 'cancelled' ? ' cancelled' : '')}>
    <header>
      <img src={logoSrc(settings.logoVersion)} alt="" width={64} height={64}/>
      <b>{salonName(settings)}</b>
      {settings.businessOwner && <span>{settings.businessOwner}</span>}
      {settings.businessAddress && <span>{settings.businessAddress}</span>}
      {settings.businessId && <span>IČO {settings.businessId} · neplátce DPH</span>}
    </header>
    <h3>Účtenka č. {receipt.number}{receipt.status === 'cancelled' && ' – STORNO'}</h3>
    <p className="receipt-meta">{issuedText(receipt.issued)}{receipt.clientName && <> · {receipt.clientName}</>}</p>
    <table>
      <tbody>{receipt.items.map((x, i) => <tr key={i}><td>{x.name}{x.qty > 1 && <small> {x.qty} × {formatRevenue(x.unitCents)}</small>}</td><td>{formatRevenue(x.qty * x.unitCents)}</td></tr>)}</tbody>
      <tfoot>
        {!!receipt.discountCents && <><tr><td>Mezisoučet</td><td>{formatRevenue(receipt.totalCents + receipt.discountCents)}</td></tr><tr><td>Sleva{receipt.discountLabel && ' ' + receipt.discountLabel}</td><td>−{formatRevenue(receipt.discountCents)}</td></tr></>}
        <tr><th>Celkem</th><th>{formatRevenue(receipt.totalCents)}</th></tr>
        {receipt.prepaidCents > 0 && <tr><td>Zaplaceno předem (kauce / platba předem)</td><td>−{formatRevenue(receipt.prepaidCents)}</td></tr>}
        {!!receipt.voucherCents && <tr><td>Uhrazeno dárkovým poukazem {receipt.voucherCode}</td><td>−{formatRevenue(receipt.voucherCents)}</td></tr>}
        {(receipt.prepaidCents > 0 || !!receipt.voucherCents) && <tr><th>Doplatek</th><th>{formatRevenue(receipt.dueCents)}</th></tr>}
      </tfoot>
    </table>
    <p className="receipt-meta">Platba: {METHOD_LABEL[receipt.method] || receipt.method}{receipt.dueCents > 0 && (receipt.paid ? ' · zaplaceno' : ' · čeká na zaplacení')}</p>
    {qr && <div className="receipt-qr"><QrCode payload={qr} size={170} label={`QR platba ${formatRevenue(receipt.dueCents)}`}/><span>Účet {settings.account}<br/>{formatIban(iban!)}<br/>VS {receipt.vs}<br/><b>{formatRevenue(receipt.dueCents)}</b></span></div>}
    {receipt.note && <p className="receipt-meta">{receipt.note}</p>}
    <footer>Děkujeme za návštěvu.</footer>
  </article>;
}

function ReceiptForm({draft, products, clients, busy, onSubmit, onCancel}: {draft: ReceiptDraft; products: Product[]; clients: Client[]; busy: boolean; onSubmit: (data: Record<string, unknown>) => void; onCancel: () => void}) {
  const [items, setItems] = useState<(ReceiptItem & {price: string})[]>(() => draft.items.map(x => ({...x, price: String(x.unitCents / 100).replace('.', ',')})));
  const [method, setMethod] = useState('qr'), [error, setError] = useState('');
  const [discount, setDiscount] = useState(''), [discountKind, setDiscountKind] = useState<'%' | 'Kč'>('%');
  const [clientId, setClientId] = useState(draft.clientId || ''), [clientName, setClientName] = useState(draft.clientName || '');
  const priced = items.map(x => { try { return parseRevenue(x.price) ?? 0; } catch { return NaN; } });
  const subtotal = items.reduce((sum, x, i) => sum + x.qty * (priced[i] || 0), 0);
  const discountNumber = Number(discount.replace(',', '.').replace(/\s/g, '')) || 0;
  const discountCents = Math.max(0, Math.min(subtotal, Math.round(discountKind === '%' ? subtotal * Math.min(discountNumber, 100) / 100 : discountNumber * 100)));
  const discountLabel = discountCents ? (discountKind === '%' ? `${discountNumber.toLocaleString('cs-CZ')} %` : '') : '';
  const total = subtotal - discountCents, prepaid = Math.min(draft.prepaidCents || 0, total);
  const [voucherInput, setVoucherInput] = useState(''), [voucher, setVoucher] = useState<{v: Voucher; today: string} | null>(null), [voucherError, setVoucherError] = useState('');
  const voucherProblem = voucher ? ({pending: 'ještě není zaplacený', cancelled: 'je stornovaný', used: 'je už vyčerpaný', expired: `prošel ${dateText(voucher.v.validUntil)}`} as Record<string, string>)[voucherState(voucher.v, voucher.today)] : '';
  const covered = voucher && !voucherProblem ? voucherCover(voucher.v, items.map((x, i) => ({name: x.name, qty: x.qty, unitCents: priced[i] || 0})), total - prepaid) : 0;
  async function findVoucher() {
    setVoucherError(''); setVoucher(null);
    if (!voucherInput.trim()) return;
    try {
      const r = await fetch('/api/vouchers?code=' + encodeURIComponent(voucherInput.trim()), {cache: 'no-store'});
      const d = await r.json() as {voucher?: Voucher; today?: string; error?: string};
      if (!d.voucher) throw new Error(d.error); setVoucher({v: d.voucher, today: d.today!}); setVoucherInput(d.voucher.code);
    } catch (e) { setVoucherError((e as Error).message || 'Poukaz se nepodařilo najít.'); }
  }
  const update = (i: number, patch: Partial<ReceiptItem & {price: string}>) => setItems(items.map((x, j) => j === i ? {...x, ...patch} : x));

  function submit(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (!items.length) return setError('Přidejte alespoň jednu položku.');
    if (priced.some(p => Number.isNaN(p))) return setError('Zkontrolujte ceny položek (např. 590 nebo 590,50).');
    if (voucherInput.trim() && !voucher) return setError('Poukaz nejdřív ověřte tlačítkem Použít, nebo kód smažte.');
    if (voucherProblem) return setError(`Poukaz ${voucher!.v.code} ${voucherProblem}. Smažte kód, nebo poukazu prodlužte platnost v části Poukazy.`);
    onSubmit({bookingId: draft.bookingId, clientId: clientId || null, clientName, method, discountCents, discountLabel, voucherCode: covered ? voucher!.v.code : '', items: items.map((x, i) => ({name: x.name, qty: x.qty, unitCents: priced[i], kind: x.kind, productId: x.productId}))});
  }

  return <form onSubmit={submit}>
    <div className="fields receipt-form">
      {!draft.bookingId && <div className="field-grid">
        <label className="field"><span>Klientka z kartotéky</span><select value={clientId} onChange={e => { setClientId(e.target.value); setClientName(clients.find(c => c.id === e.target.value)?.name || ''); }}><option value="">Bez karty</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field"><span>Jméno na účtence</span><input value={clientName} maxLength={120} onChange={e => setClientName(e.target.value)} placeholder="Nepovinné"/></label>
      </div>}
      <div className="receipt-items">
        {items.map((x, i) => <div key={i} className="receipt-item">
          <input aria-label="Položka" value={x.name} required maxLength={150} onChange={e => update(i, {name: e.target.value})}/>
          <input aria-label="Počet" type="number" min={1} max={99} value={x.qty} onChange={e => update(i, {qty: Math.max(1, Math.min(99, Number(e.target.value) || 1))})}/>
          <input aria-label="Cena za kus v Kč" inputMode="decimal" value={x.price} required onChange={e => update(i, {price: e.target.value})}/>
          <button type="button" aria-label={'Odebrat ' + x.name} onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={16}/></button>
          {(() => { const stock = products.find(p => p.id === x.productId)?.stock; return stock != null && x.qty > stock ? <small className="stock-warn">Na skladě {stock <= 0 ? 'nic není' : `jen ${stock} ks`}, účtenka sklad pošle do minusu.</small> : null; })()}
        </div>)}
      </div>
      <div className="receipt-add">
        <select aria-label="Přidat produkt" value="" onChange={e => { const p = products.find(x => x.id === e.target.value); if (p) setItems([...items, {name: p.name, qty: 1, unitCents: p.priceCents, price: String(p.priceCents / 100).replace('.', ','), kind: 'product', productId: p.id}]); }}>
          <option value="">+ Přidat produkt…</option>{products.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name} · {formatRevenue(p.priceCents)}{p.stock != null && ` · skladem ${p.stock} ks`}</option>)}
        </select>
        <button type="button" className="secondary" onClick={() => setItems([...items, {name: '', qty: 1, unitCents: 0, price: '', kind: 'other'}])}><Plus size={16}/> Vlastní položka</button>
      </div>
      <div className="discount-row">
        <span>Sleva</span>
        <input aria-label="Sleva" inputMode="decimal" placeholder="0" value={discount} onChange={e => setDiscount(e.target.value)}/>
        <span className="segmented-mini" role="radiogroup" aria-label="Sleva v">{(['%', 'Kč'] as const).map(k => <button type="button" key={k} role="radio" aria-checked={discountKind === k} className={discountKind === k ? 'active' : ''} onClick={() => setDiscountKind(k)}>{k}</button>)}</span>
        <span className="discount-quick">{[5, 10, 15, 20].map(p => <button type="button" key={p} className="secondary" onClick={() => { setDiscountKind('%'); setDiscount(String(p)); }}>{p} %</button>)}</span>
      </div>
      <div className="voucher-row">
        <span><Gift size={16}/> Dárkový poukaz</span>
        <input aria-label="Kód dárkového poukazu" placeholder="Kód, např. ABCD-EF23" value={voucherInput} maxLength={20} autoCapitalize="characters" onChange={e => { setVoucherInput(e.target.value); setVoucher(null); setVoucherError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); findVoucher(); } }}/>
        <button type="button" className="secondary" disabled={!voucherInput.trim()} onClick={findVoucher}>Použít</button>
        {voucher && <button type="button" className="link-button" onClick={() => { setVoucher(null); setVoucherInput(''); }}>Nepoužít</button>}
        {voucherError && <small className="voucher-msg bad">{voucherError}</small>}
        {voucher && <small className={'voucher-msg' + (voucherProblem ? ' bad' : '')}>{voucher.v.kind === 'service' ? `Na ošetření ${voucher.v.serviceName}` : `Zůstatek ${formatRevenue(voucher.v.balanceCents)}`} · platí do {dateText(voucher.v.validUntil)}{voucher.v.recipientName && ` · pro ${voucher.v.recipientName}`}{voucherProblem && ` · poukaz ${voucherProblem}`}</small>}
      </div>
      <div className="receipt-sum">
        {discountCents > 0 && <span>Mezisoučet {formatRevenue(subtotal)} · sleva −{formatRevenue(discountCents)}</span>}
        <span>Celkem <b>{formatRevenue(total)}</b></span>
        {prepaid > 0 && <span>{draft.prepaidLabel || 'Zaplaceno předem'} −{formatRevenue(prepaid)}{!covered && <> · doplatek <b>{formatRevenue(total - prepaid)}</b></>}</span>}
        {covered > 0 && <span>Dárkový poukaz −{formatRevenue(covered)} · doplatek <b>{formatRevenue(total - prepaid - covered)}</b></span>}
      </div>
      <fieldset className="method"><legend>Platba</legend>
        {([['cash', Banknote], ['card', CreditCard], ['qr', QrIcon]] as const).map(([k, Icon]) => <label key={k} className={method === k ? 'active' : ''}><input type="radio" name="method" value={k} checked={method === k} onChange={() => setMethod(k)}/><Icon size={16}/> {METHOD_LABEL[k]}</label>)}
      </fieldset>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="dialog-footer"><button type="button" className="secondary" onClick={onCancel}>Zrušit</button><button className="primary" disabled={busy}>{draft.bookingId ? <Check size={16}/> : <ReceiptIcon size={16}/>} {busy ? 'Ukládám…' : draft.bookingId ? 'Dokončit' : 'Vystavit účtenku'}</button></div>
  </form>;
}

/** Dialog: nová účtenka z podkladu, nebo zobrazení existující (tisk, zaplaceno, storno). */
export function ReceiptDialog({draft, receiptId, clients, onClose, onChanged}: {draft?: ReceiptDraft | null; receiptId?: string | null; clients: Client[]; onClose: () => void; onChanged?: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [id, setId] = useState(receiptId || ''), [receipt, setReceipt] = useState<Receipt | null>(null), [settings, setSettings] = useState<BookingSettings>(DEFAULT_SETTINGS);
  const [products, setProducts] = useState<Product[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmCancel, setConfirmCancel] = useState(false);
  const [contact, setContact] = useState({email: '', phone: ''}), [mail, setMail] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const url = id ? `/api/receipts?id=${encodeURIComponent(id)}` : '/api/receipts';
    fetch(url, {cache: 'no-store'}).then(r => r.json() as Promise<{receipt?: Receipt; products?: Product[]; settings: BookingSettings; contact?: {email: string; phone: string}; mail?: boolean; error?: string}>).then(d => {
      if (d.error) throw new Error(d.error);
      setSettings(d.settings); if (d.receipt) setReceipt(d.receipt); if (d.products) setProducts(d.products); if (d.contact) setContact(d.contact); setMail(!!d.mail);
    }).catch(e => setError((e as Error).message));
  }, [id]);

  async function act(body: unknown) {
    setBusy(true); setError('');
    try { const d = await post(body); onChanged?.(); return d; } catch (e) { setError((e as Error).message); return null; } finally { setBusy(false); }
  }
  async function create(data: Record<string, unknown>) { const d = await act({kind: 'receipt', action: 'create', data}); if (d?.id) setId(d.id); }
  async function reload() { const r = await fetch(`/api/receipts?id=${encodeURIComponent(id)}`, {cache: 'no-store'}); const d = await r.json() as {receipt?: Receipt}; if (d.receipt) setReceipt(d.receipt); }

  return <dialog ref={dialog} className="receipt-dialog" onCancel={e => { if (busy) e.preventDefault(); else onClose(); }} onClose={onClose}>
    <div className="dialog-header"><div><p className="eyebrow">{id ? 'ÚČTENKA' : 'NOVÁ ÚČTENKA'}</p><h2>{receipt ? receipt.number : draft?.clientName || 'Prodej'}</h2></div><button type="button" aria-label="Zavřít" onClick={onClose}><X size={21}/></button></div>
    {!id && draft ? <ReceiptForm draft={draft} products={products} clients={clients} busy={busy} onSubmit={create} onCancel={onClose}/>
    : receipt ? <>
      <div className="fields">{receipt.status === 'issued' && receipt.dueCents > 0 && !receipt.paid && czIban(settings.account) && <div className="pay-now">
        <QrCode payload={spdPayload({iban: czIban(settings.account)!, amountCents: receipt.dueCents, vs: receipt.vs, message: 'Uctenka ' + receipt.number, recipient: settings.accountName})} size={240} label={`QR platba ${formatRevenue(receipt.dueCents)}`}/>
        <p>Účet: {settings.account}<br/>VS: {receipt.vs}<br/><b>Částka: {formatRevenue(receipt.dueCents)}</b></p>
        <button className="primary" disabled={busy} onClick={async () => { if (await act({kind: 'receipt', action: 'paid', data: {id, paid: true}})) await reload(); }}><Check size={16}/> Zaplaceno</button>
      </div>}
        <ReceiptPaper receipt={receipt} settings={settings}/>{receipt.status === 'issued' && <SendPanel receiptId={id} contact={contact} mail={mail} toPay={receipt.dueCents > 0 && !receipt.paid}/>}</div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="dialog-footer receipt-actions">
        {receipt.status === 'issued' && (confirmCancel
          ? <><span>Opravdu stornovat?</span><button className="secondary danger-text" disabled={busy} onClick={async () => { if (await act({kind: 'receipt', action: 'cancel', data: {id}})) { setConfirmCancel(false); await reload(); } }}>Ano, stornovat</button><button className="secondary" onClick={() => setConfirmCancel(false)}>Ne</button></>
          : <button className="secondary" onClick={() => setConfirmCancel(true)}>Storno</button>)}
        {receipt.status === 'issued' && receipt.dueCents > 0 && !!receipt.paid && <button className="secondary" disabled={busy} onClick={async () => { if (await act({kind: 'receipt', action: 'paid', data: {id, paid: false}})) await reload(); }}>Označit jako nezaplacené</button>}
        <button className="secondary" onClick={() => window.print()}><Printer size={16}/> Tisk / PDF</button><button className="primary" onClick={onClose}><Check size={16}/> Hotovo</button>
      </div>
    </> : <div className="fields">{error ? <p className="error" role="alert">{error}</p> : <p className="muted">Načítám…</p>}</div>}
  </dialog>;
}

/** Přehled účtenek za měsíc a prodej bez rezervace. */
export default function Receipts({clients}: {clients: Client[]}) {
  const [month, setMonth] = useState(() => salonNow().slice(0, 7)), [list, setList] = useState<Receipt[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [open, setOpen] = useState<{draft?: ReceiptDraft; id?: string} | null>(null), [bank, setBank] = useState(false);
  async function load() {
    try { const r = await fetch(`/api/receipts?month=${month}`, {cache: 'no-store'}); const d = await r.json() as {receipts?: Receipt[]; error?: string}; if (!d.receipts) throw new Error(d.error); setList(d.receipts); setError(''); }
    catch (e) { setError((e as Error).message || 'Účtenky se nepodařilo načíst.'); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps
  if (bank) return <BankPayments onBack={() => { setBank(false); load(); }}/>;
  const valid = list.filter(r => r.status === 'issued'), sum = valid.reduce((s, r) => s + r.totalCents, 0), unpaid = valid.filter(r => !r.paid && r.dueCents > 0);
  return <div className="receipts">
    <div className="heading"><div><p className="eyebrow">OŠETŘENÍ A PRODEJ</p><h1>Účtenky</h1><p>Účtenku vystavíte u rezervace v kalendáři, prodej produktů i tady.</p></div>
      <div className="heading-actions"><button className="secondary" onClick={() => setBank(true)}><Landmark size={17}/> Platby z banky</button>
        <button className="primary" onClick={() => setOpen({draft: {items: []}})}><Plus size={18}/> Nová účtenka</button></div></div>
    {error && <div className="error" role="alert">{error}</div>}
    <section className="revenue-overview receipts-overview">
      <div className="revenue-month"><h2>Za měsíc</h2><label><span>Vybraný měsíc</span><input type="month" value={month} required onChange={e => { if (e.target.value) setMonth(e.target.value); }}/></label></div>
      <div className="revenue-total"><span>Celkem na účtenkách</span><strong>{loading ? '…' : formatRevenue(sum)}</strong><small>{valid.length} účtenek</small></div>
      <div className="revenue-total"><span>Čeká na zaplacení</span><strong>{loading ? '…' : formatRevenue(unpaid.reduce((s, r) => s + r.dueCents, 0))}</strong><small>{unpaid.length} účtenek</small></div>
    </section>
    <div className="panel"><ul className="receipt-list">{loading ? <li className="muted">Načítám…</li> : !list.length ? <li className="muted">V tomto měsíci zatím žádné účtenky.</li> : list.map(r => <li key={r.id}>
      <button onClick={() => setOpen({id: r.id})} className={r.status === 'cancelled' ? 'cancelled' : ''}>
        <span className="receipt-no">{r.number}</span>
        <span className="receipt-who"><b>{r.clientName || 'Bez jména'}</b><small>{issuedText(r.issued)} · {r.items.map(x => x.name).join(', ')}</small></span>
        <span className="receipt-amount"><b>{formatRevenue(r.totalCents)}</b><small>{r.status === 'cancelled' ? 'storno' : r.dueCents > 0 && !r.paid ? 'nezaplaceno' : METHOD_LABEL[r.method]}</small></span>
      </button></li>)}</ul></div>
    {open && <ReceiptDialog draft={open.draft} receiptId={open.id} clients={clients} onClose={() => setOpen(null)} onChanged={load}/>}
  </div>;
}

/** Odeslání účtenky a QR platby klientce: e-mail přes server, SMS z telefonu, sdílení nebo odkaz. */
function SendPanel({receiptId, contact, mail, toPay}: {receiptId: string; contact: {email: string; phone: string}; mail: boolean; toPay: boolean}) {
  const [email, setEmail] = useState(contact.email), [phone, setPhone] = useState(contact.phone);
  const [link, setLink] = useState<{link: string; sms: string} | null>(null), [status, setStatus] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { setEmail(contact.email); setPhone(contact.phone); }, [contact]);
  useEffect(() => { post({kind: 'receipt', action: 'link', data: {id: receiptId}}).then(d => setLink(d as unknown as {link: string; sms: string})).catch(e => setError((e as Error).message)); }, [receiptId]);
  const smsHref = link ? `sms:${phone.replace(/[^\d+]/g, '')}?body=${encodeURIComponent(link.sms)}` : '';
  async function sendMail() {
    setBusy(true); setError(''); setStatus('');
    try { await post({kind: 'receipt', action: 'send', data: {id: receiptId, email}}); setStatus(`Účtenka odeslána na ${email}.`); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="send-panel" aria-label="Poslat klientce">
    <h3>Poslat klientce {toPay ? 'QR platbu a účtenku' : 'účtenku'}</h3>
    <form className="send-row" onSubmit={e => { e.preventDefault(); sendMail(); }}>
      <input type="email" aria-label="E-mail klientky" placeholder="E-mail klientky" required value={email} onChange={e => setEmail(e.target.value)}/>
      <button className="secondary" disabled={busy || !email}><Mail size={16}/> {busy ? 'Odesílám…' : 'Poslat e-mailem'}</button>
    </form>
    {!mail && <p className="muted-inline">E-maily zatím nejsou na serveru nastavené. Použijte SMS nebo sdílení.</p>}
    <div className="send-row">
      <input type="tel" aria-label="Telefon klientky" placeholder="Telefon klientky" value={phone} onChange={e => setPhone(e.target.value)}/>
      <a className={'secondary' + (link && phone ? '' : ' disabled')} aria-disabled={!link || !phone} href={link && phone ? smsHref : undefined}><MessageSquare size={16}/> Poslat SMS</a>
    </div>
    <div className="send-row links">
      {link && typeof navigator !== 'undefined' && 'share' in navigator && <button type="button" className="secondary" onClick={() => navigator.share({title: 'Účtenka', text: link.sms}).catch(() => {})}><Share2 size={16}/> Sdílet (WhatsApp, Messenger…)</button>}
      {link && <a className="secondary" href={link.link} target="_blank" rel="noopener">Zobrazit jako klientka</a>}
      {link && <button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(link.link).then(() => setStatus('Odkaz zkopírován.'), () => setStatus(link.link))}><Copy size={16}/> Kopírovat odkaz</button>}
    </div>
    <p className="muted-inline">SMS se otevře v telefonu s předvyplněným textem a odkazem na účtenku s QR kódem.</p>
    {status && <p className="notice" role="status">{status}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
