'use client';
// Dárkový poukaz přes web (/poukaz): výběr částky nebo ošetření, objednávka s QR platbou
// a přes tajný odkaz (/poukaz?t=…) stav objednávky, po zaplacení poukaz k tisku.
import {useEffect, useState} from 'react';
import {Gift, Printer} from 'lucide-react';
import {formatRevenue} from '../lib/revenue';
import {addMonths} from '../lib/vouchers';
import {PaymentDetails, type DepositInfo} from './qr-payment';
import {VoucherCard} from './voucher-card';
import {logoSrc} from './logo';

type Salon = {name: string; address: string; phone: string; logoVersion: number};
type Offer = {id: string; name: string; priceCents: number; category: string};
type Shop = {available: boolean; salon: Salon; amounts?: number[]; minKc?: number; services?: Offer[]; months?: number};
type Order = {state: string; kind: string; serviceName: string; valueCents: number; recipientName: string; delivery: string; salon: Salon; payment?: DepositInfo | null; code?: string; validUntil?: string};
const card = (s: Salon) => ({businessName: s.name, businessAddress: s.address, businessPhone: s.phone, logoVersion: s.logoVersion});
const monthsText = (n: number) => `${n} ${n === 1 ? 'měsíc' : n <= 4 ? 'měsíce' : 'měsíců'}`;

export default function PublicVoucher({token: initial}: {token?: string}) {
  const [token, setToken] = useState(() => initial ?? (typeof location === 'undefined' ? '' : new URLSearchParams(location.search).get('t') || ''));
  const [salon, setSalon] = useState<Salon | null>(null);
  return <div className="public-booking">
    <header className="pb-header"><img className="brand-logo" src={logoSrc(salon?.logoVersion)} alt="" width={56} height={56}/><div><b>{salon?.name.toLocaleUpperCase('cs') || ' '}</b><span>DÁRKOVÝ POUKAZ</span></div></header>
    <main className="pb-main">
      {token ? <OrderStatus token={token} onSalon={setSalon} onNew={() => { try { history.replaceState(null, '', location.pathname); } catch { /* náhled */ } setToken(''); }}/>
      : <ShopForm onSalon={setSalon} onOrdered={t => { try { history.replaceState(null, '', '?t=' + t); } catch { /* náhled */ } setToken(t); window.scrollTo(0, 0); }}/>}
    </main>
  </div>;
}

function ShopForm({onSalon, onOrdered}: {onSalon: (s: Salon) => void; onOrdered: (token: string) => void}) {
  const [shop, setShop] = useState<Shop | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<'value' | 'service'>('value'), [amount, setAmount] = useState(''), [serviceId, setServiceId] = useState(''), [recipient, setRecipient] = useState('');
  const [delivery, setDelivery] = useState<'email' | 'pickup'>('email');
  useEffect(() => {
    fetch('/api/public?voucherShop=1', {cache: 'no-store'}).then(async r => {
      const d = await r.json() as Shop & {error?: string};
      if (!r.ok) throw new Error(d.error); setShop(d); onSalon(d.salon); document.title = 'Dárkový poukaz · ' + d.salon.name;
      if (d.amounts?.length) setAmount(String(d.amounts[Math.min(1, d.amounts.length - 1)])); else if (!d.minKc && d.services?.length) setKind('service');
    }).catch(() => setError('Nabídku poukazů se nepodařilo načíst. Zkuste to prosím později.'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shop) return error ? <p className="error" role="alert">{error}</p> : <p className="pb-muted">Načítám nabídku…</p>;
  if (!shop.available) return <section className="pb-done"><Gift size={44} strokeWidth={1.4}/><h1>Poukazy teď online neprodáváme</h1><p className="pb-muted">Dárkový poukaz rádi připravíme v salonu{shop.salon.phone ? `, zavolejte nám prosím na ${shop.salon.phone}` : ''}.</p></section>;
  const services = shop.services || [], canValue = !!shop.amounts?.length || !!shop.minKc, service = services.find(x => x.id === serviceId);
  const kc = Number(amount.replace(/\s/g, '').replace(',', '.')), valueCents = kind === 'service' ? service?.priceCents || 0 : Number.isInteger(kc) && kc > 0 ? kc * 100 : 0;
  const today = new Date().toLocaleDateString('sv-SE', {timeZone: 'Europe/Prague'});
  const groups = [...services.reduce((m, x) => m.set(x.category || '', [...(m.get(x.category || '') || []), x]), new Map<string, Offer[]>())];

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError('');
    if (kind === 'service' && !service) return setError('Vyberte prosím ošetření.');
    if (kind === 'value' && !valueCents) return setError('Vyberte nebo zadejte prosím částku.');
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      const r = await fetch('/api/public', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...f, action: 'voucher', consent: f.consent === 'on', kind, amount, serviceId, recipientName: recipient, delivery})});
      const d = await r.json() as {error?: string; token?: string};
      if (!r.ok || !d.token) throw new Error(d.error || 'Objednávku se nepodařilo odeslat.');
      onOrdered(d.token);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return <form className="pb-form voucher-shop" onSubmit={submit}>
    <section><h1>Darujte péči</h1><p className="pb-muted">Vyberte poukaz, zaplaťte QR kódem v bankovní aplikaci a poukaz Vám pošleme e-mailem k vytištění. Platí {monthsText(shop.months || 6)} od zaplacení.</p></section>
    {canValue && services.length > 0 && <span className="segmented-mini voucher-kind" role="radiogroup" aria-label="Druh poukazu">{([['value', 'Na částku'], ['service', 'Na ošetření']] as const).map(([k, l]) => <button type="button" key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>{l}</button>)}</span>}
    {kind === 'value' ? <div className="field"><span>Hodnota poukazu</span>
      <div className="voucher-amounts">{shop.amounts?.map(n => <button type="button" key={n} className={'secondary' + (amount === String(n) ? ' active' : '')} aria-pressed={amount === String(n)} onClick={() => setAmount(String(n))}>{formatRevenue(n * 100)}</button>)}
        {!!shop.minKc && <label className="voucher-own"><input inputMode="numeric" aria-label="Jiná částka v Kč" placeholder={`Jiná částka (od ${shop.minKc} Kč)`} value={shop.amounts?.includes(kc) ? '' : amount} onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ''))}/> Kč</label>}</div>
    </div> : <label className="field"><span>Ošetření</span><select value={serviceId} onChange={e => setServiceId(e.target.value)}><option value="">Vyberte ošetření…</option>
      {groups.map(([category, list]) => { const options = list.map(x => <option key={x.id} value={x.id}>{x.name} · {formatRevenue(x.priceCents)}</option>); return category ? <optgroup key={category} label={category}>{options}</optgroup> : options; })}</select></label>}
    <label className="field"><span>Pro koho (jméno na poukazu, nepovinné)</span><input maxLength={60} value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Např. Jana"/></label>
    {valueCents > 0 && <div className="voucher-preview"><p className="pb-muted">Takhle bude poukaz vypadat:</p>
      <VoucherCard voucher={{kind, serviceName: service?.name || '', valueCents, recipientName: recipient.trim(), code: '••••-••••', validUntil: addMonths(today, shop.months || 6)}} settings={card(shop.salon)}/></div>}
    <section className="voucher-buyer"><h2>Vaše údaje</h2>
      <div className="field-grid">
        <label className="field"><span>Jméno a příjmení</span><input name="buyerName" required maxLength={120} autoComplete="name"/></label>
        <label className="field"><span>E-mail</span><input name="email" type="email" required maxLength={200} autoComplete="email"/></label>
        <label className="field"><span>Telefon (nepovinné)</span><input name="phone" type="tel" maxLength={40} autoComplete="tel"/></label>
      </div>
      <fieldset className="method"><legend>Jak poukaz předáme</legend>
        <label className={delivery === 'email' ? 'active' : ''}><input type="radio" name="delivery-choice" checked={delivery === 'email'} onChange={() => setDelivery('email')}/> E-mailem k vytištění</label>
        <label className={delivery === 'pickup' ? 'active' : ''}><input type="radio" name="delivery-choice" checked={delivery === 'pickup'} onChange={() => setDelivery('pickup')}/> Tištěný si vyzvednu v salonu</label>
      </fieldset>
      <label className="field"><span>Poznámka (nepovinné)</span><input name="note" maxLength={300}/></label>
      <label className="pb-hidden" aria-hidden="true">Web<input name="website" tabIndex={-1} autoComplete="off"/></label>
      <label className="check"><input type="checkbox" name="consent" required/> Souhlasím se zpracováním jména a kontaktu pro vyřízení objednávky.</label>
    </section>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="pb-actions"><button className="primary" disabled={busy}>{busy ? 'Odesílám…' : valueCents ? `Objednat za ${formatRevenue(valueCents)}` : 'Objednat poukaz'}</button></div>
  </form>;
}

function OrderStatus({token, onSalon, onNew}: {token: string; onSalon: (s: Salon) => void; onNew: () => void}) {
  const [order, setOrder] = useState<Order | null>(null), [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/public?voucher=' + encodeURIComponent(token), {cache: 'no-store'}).then(async r => {
      const d = await r.json() as {order?: Order; error?: string};
      if (!r.ok || !d.order) throw new Error(d.error || 'Objednávku se nepodařilo načíst.');
      setOrder(d.order); onSalon(d.order.salon); document.title = 'Dárkový poukaz · ' + d.order.salon.name;
    }).catch(e => setError((e as Error).message));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!order) return error ? <p className="error" role="alert">{error}</p> : <p className="pb-muted">Načítám…</p>;
  const what = order.kind === 'service' ? `na ošetření ${order.serviceName}` : `v hodnotě ${formatRevenue(order.valueCents)}`;
  if (order.state === 'cancelled') return <section className="pb-done"><Gift size={44} strokeWidth={1.4}/><h1>Objednávka je zrušená</h1><p className="pb-muted">Platba za poukaz nedorazila včas. Pokud už platba odešla, ozvěte se nám prosím{order.salon.phone ? ` na ${order.salon.phone}` : ''}.</p><div className="pb-actions"><button className="secondary" onClick={onNew}>Objednat nový poukaz</button></div></section>;
  if (order.state === 'pending') return <section className="pb-done"><Gift size={44} strokeWidth={1.4}/><h1>Objednávka přijata, čeká na platbu</h1>
    <p><b>Dárkový poukaz {what}</b>{order.recipientName && <><br/>pro {order.recipientName}</>}</p>
    <p className="pb-muted">Zaplaťte prosím QR kódem v bankovní aplikaci nebo převodem. Jakmile platba dorazí, pošleme Vám poukaz e-mailem{order.delivery === 'pickup' ? ' a tištěný připravíme v salonu' : ''}. Platební údaje máte i v e-mailu.</p>
    {order.payment && <PaymentDetails deposit={order.payment}/>}</section>;
  return <section className="pb-done voucher-ready">
    <h1>{order.state === 'used' ? 'Poukaz je vyčerpaný' : order.state === 'expired' ? 'Platnost poukazu skončila' : 'Dárkový poukaz'}</h1>
    {order.state !== 'used' && order.state !== 'expired' && <p className="pb-muted">Poukaz si vytiskněte nebo uložte jako PDF. Při objednání stačí nahlásit kód nebo poukaz přinést s sebou.</p>}
    <VoucherCard voucher={{kind: order.kind as 'value' | 'service', serviceName: order.serviceName, valueCents: order.valueCents, recipientName: order.recipientName, code: order.code!, validUntil: order.validUntil!}} settings={card(order.salon)}/>
    <div className="pb-actions"><button className="primary" onClick={() => window.print()}><Printer size={16}/> Vytisknout / uložit PDF</button></div>
  </section>;
}
