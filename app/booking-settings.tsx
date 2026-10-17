'use client';
import {useEffect, useState} from 'react';
import {Copy, ImageUp, MessageSquare, Pencil, Plus, Trash2, X} from 'lucide-react';
import {addDays, DEFAULT_SETTINGS, salonName, salonNow, WEEKDAYS, type BookingSettings} from '../lib/booking';
import {DEFAULT_SMS_TEMPLATE, renderSms, SMS_PLACEHOLDERS, smsParts} from '../lib/sms';
import {czIban} from '../lib/payment';
import {logoSrc} from './logo';
import {formatRevenue} from '../lib/revenue';
import {CATEGORY_COLORS, PRICE_LIST, serviceColor} from '../lib/price-list';
import type {Service} from './bookings';
import {ProductsPanel} from './receipts';

async function post(body: unknown) {
  const r = await fetch('/api/bookings', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const d = await r.json() as {error?: string};
  if (!r.ok) throw new Error(d.error || 'Změnu se nepodařilo uložit.');
}
const ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Zmenší obrázek na nejvýš 256 px, aby logo bylo malé a ostré na účtence i v hlavičce. */
function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 256 / Math.max(img.width, img.height)), canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url); resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Obrázek se nepodařilo načíst. Zkuste PNG nebo JPG.')); };
    img.src = url;
  });
}

export default function BookingSettingsView({bookingUrl, onSaved}: {bookingUrl: string; onSaved?: () => void}) {
  const [services, setServices] = useState<Service[]>([]), [settings, setSettings] = useState<BookingSettings>(DEFAULT_SETTINGS);
  const [editing, setEditing] = useState<Partial<Service> | null>(null), [features, setFeatures] = useState<{studioPriceList: boolean; sms?: string}>({studioPriceList: false});
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false);
  const embed = `<iframe src="${bookingUrl}" title="Rezervace – ${salonName(settings).replace(/"/g, '')}" style="width:100%;min-height:900px;border:0" loading="lazy"></iframe>`;

  async function load() {
    try {
      const r = await fetch('/api/bookings?from=2000-01-01&to=2000-01-01', {cache: 'no-store'});
      const d = await r.json() as {error?: string; services: Service[]; settings: BookingSettings; features?: {studioPriceList: boolean; sms?: string}};
      if (!r.ok) throw new Error(d.error); setServices(d.services); setSettings(d.settings); if (d.features) setFeatures(d.features);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { load(); }, []);
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError('');
    try { await action(); await load(); onSaved?.(); setNotice(message); setEditing(null); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const setDay = (day: number, value: [string, string] | null) => setSettings(s => ({...s, hours: {...s.hours, [String(day)]: value}}));

  const groups = [...services.reduce((m, x) => m.set(x.category, [...(m.get(x.category) || []), x]), new Map<string, Service[]>())];
  return <div className="booking-settings">
    <div className="heading"><div><p className="eyebrow">ONLINE REZERVACE</p><h1>Nastavení</h1><p>Co si klientky mohou rezervovat a kdy.</p></div></div>
    {error && <div className="error" role="alert">{error}</div>}
    {notice && <p className="notice" role="status">{notice}<button aria-label="Zavřít oznámení" onClick={() => setNotice('')}><X size={15}/></button></p>}

    <section className="panel">
      <div className="panel-heading"><h2>Ošetření a ceník</h2><button className="primary" onClick={() => setEditing({durationMin: 60, active: 1})}><Plus size={17}/> Přidat ošetření</button></div>
      {!services.length && <div className="empty-services"><p>Zatím tu není žádné ošetření. Klientky si online nic nevyberou, dokud ho nepřidáte tlačítkem Přidat ošetření.</p>{features.studioPriceList && <button className="secondary" disabled={busy} onClick={() => run(async () => { for (const [i, [category, name, durationMin, price, extra]] of PRICE_LIST.entries()) await post({kind: 'service', action: 'save', data: {name, category, durationMin, price: String(price), sessions: extra?.sessions ?? 1, prepay: !!extra?.prepay, color: CATEGORY_COLORS[category] || '', active: true, sort: i}}); }, 'Ceník byl vložen. Délky, ceny a popisy si zkontrolujte.')}>Vložit ceník z MyFoxu ({PRICE_LIST.length} ošetření)</button>}</div>}
      {groups.map(([category, list]) => <div key={category} className="service-group">
        <h3>{category || 'Bez kategorie'} <small>{list.length}</small></h3>
        <ul className="service-list">{list.map(s => <li key={s.id} className={s.active ? '' : 'inactive'}>
          <span className="color-dot" style={{background: serviceColor(s.color, s.category)}} aria-hidden="true"/>
          <div><b>{s.name}</b><small>{s.durationMin} min · {s.priceCents ? formatRevenue(s.priceCents) : 'bez ceny'}{s.sessions > 1 && ` · balíček ${s.sessions}×`}{!!s.prepay && ' · platba předem'}{!s.active && ' · skryté na webu'}</small>{s.description && <small className="service-desc">{s.description}</small>}</div>
          <span className="actions"><button aria-label={'Upravit ' + s.name} onClick={() => setEditing(s)}><Pencil size={16}/></button><button aria-label={'Smazat ' + s.name} disabled={busy} onClick={() => run(() => post({kind: 'service', action: 'delete', data: {id: s.id}}), 'Ošetření bylo smazáno.')}><Trash2 size={16}/></button></span>
        </li>)}</ul></div>)}
      {editing && <form className="service-form" ref={el => el?.scrollIntoView({block: "nearest", behavior: "smooth"})} onSubmit={e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); run(() => post({kind: 'service', action: 'save', data: {id: editing.id, name: f.name, category: f.category, sessions: Number(f.sessions), prepay: f.prepay === 'on', description: f.description, color: f.color, durationMin: Number(f.durationMin), price: f.price, active: f.active === 'on', sort: editing.sort ?? services.length}}), 'Ošetření bylo uloženo.'); }}>
        <label className="field"><span>Název</span><input name="name" required maxLength={150} defaultValue={editing.name}/></label>
        <div className="field-grid"><label className="field"><span>Kategorie</span><input name="category" list="service-categories" maxLength={80} defaultValue={editing.category} placeholder="Např. Masáže"/></label>
          <label className="field"><span>Barva v kalendáři</span><input name="color" type="color" defaultValue={serviceColor(editing.color, editing.category)}/></label></div>
        <datalist id="service-categories">{[...new Set([...Object.keys(CATEGORY_COLORS), ...services.map(x => x.category)])].filter(Boolean).map(c => <option key={c} value={c}/>)}</datalist>
        <label className="field"><span>Popis pro klientky</span><textarea name="description" rows={2} maxLength={600} defaultValue={editing.description} placeholder="Krátce, co ošetření dělá a pro koho je"/></label>
        <div className="field-grid"><label className="field"><span>Délka (min)</span><input name="durationMin" type="number" min={5} max={600} step={5} required defaultValue={editing.durationMin}/></label><label className="field"><span>Cena (Kč, 0 = bez ceny)</span><input name="price" inputMode="decimal" required defaultValue={editing.priceCents != null ? String(editing.priceCents / 100).replace('.', ',') : ''}/></label></div>
        <div className="field-grid"><label className="field"><span>Počet ošetření (balíček)</span><input name="sessions" type="number" min={1} max={50} required defaultValue={editing.sessions ?? 1}/></label>
          <label className="check prepay-check"><input type="checkbox" name="prepay" defaultChecked={!!editing.prepay}/> Platí se celé předem (QR platba po rezervaci)</label></div>
        <label className="check"><input type="checkbox" name="active" defaultChecked={editing.active !== 0}/> Nabízet v online rezervaci</label>
        <div className="form-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>Zrušit</button><button className="primary" disabled={busy}>Uložit ošetření</button></div>
      </form>}
    </section>

    <section className="panel">
      <div className="panel-heading"><h2>Otevírací doba a pravidla</h2></div>
      <div className="hours">{ORDER.map(day => { const h = settings.hours[String(day)]; return <div key={day} className="hours-row">
        <label className="check"><input type="checkbox" checked={!!h} onChange={e => setDay(day, e.target.checked ? ['09:00', '17:00'] : null)}/> {WEEKDAYS[day]}</label>
        {h ? <span className="hours-times"><input type="time" aria-label={WEEKDAYS[day] + ' od'} value={h[0]} step={900} onChange={e => setDay(day, [e.target.value, h[1]])}/>–<input type="time" aria-label={WEEKDAYS[day] + ' do'} value={h[1]} step={900} onChange={e => setDay(day, [h[0], e.target.value])}/></span> : <span className="muted-inline">Zavřeno</span>}
      </div>; })}</div>
      <div className="field-grid three">
        <label className="field"><span>Nejdřív za (hodin)</span><input type="number" min={0} max={168} value={settings.leadHours} onChange={e => setSettings({...settings, leadHours: Number(e.target.value)})}/></label>
        <label className="field"><span>Nejdál dopředu (dní)</span><input type="number" min={1} max={365} value={settings.horizonDays} onChange={e => setSettings({...settings, horizonDays: Number(e.target.value)})}/></label>
        <label className="field"><span>Nabízet časy po</span><select value={settings.stepMinutes} onChange={e => setSettings({...settings, stepMinutes: Number(e.target.value)})}><option value={15}>15 minutách</option><option value={30}>30 minutách</option><option value={60}>hodině</option></select></label>
      </div>
      <label className="field narrow"><span>Klientka může zrušit nebo přesunout termín nejpozději (hodin předem)</span><input type="number" min={0} max={336} value={settings.changeLimitHours} onChange={e => setSettings({...settings, changeLimitHours: Number(e.target.value)})}/></label>
      <div className="form-actions"><button className="primary" disabled={busy} onClick={() => run(() => post({kind: 'settings', data: settings}), 'Nastavení bylo uloženo.')}>Uložit otevírací dobu</button></div>
    </section>

    <section className="panel">
      <div className="panel-heading"><h2>Kauce a platby</h2></div>
      <p className="muted-inline">Kauci zaplatí klientka QR platbou hned po online rezervaci. Do té doby termín čeká a po lhůtě se sám uvolní. U jednotlivých klientek můžete kauci zapnout na jejich kartě.</p>
      <div className="field-grid three">
        <label className="field"><span>Kauce od ceny (Kč)</span><input type="number" min={0} step={100} value={settings.depositFromKc} onChange={e => setSettings({...settings, depositFromKc: Number(e.target.value)})}/></label>
        <label className="field"><span>Výše kauce (%)</span><input type="number" min={1} max={100} value={settings.depositPercent} onChange={e => setSettings({...settings, depositPercent: Number(e.target.value)})}/></label>
        <label className="field"><span>Zaplatit do (hodin)</span><input type="number" min={1} max={168} value={settings.depositHoldHours} onChange={e => setSettings({...settings, depositHoldHours: Number(e.target.value)})}/></label>
      </div>
      {!czIban(settings.account) && <p className="setup-hint inline" role="note">Vyplňte číslo účtu salonu. Bez něj se nevytvoří QR platby a kauce ani platby předem se po klientkách nebudou vyžadovat.</p>}
      <div className="field-grid">
        <label className="field"><span>Číslo účtu</span><input value={settings.account} placeholder="123456789/0300" onChange={e => setSettings({...settings, account: e.target.value})}/></label>
        <label className="field"><span>Příjemce</span><input value={settings.accountName} maxLength={60} onChange={e => setSettings({...settings, accountName: e.target.value})}/></label>
      </div>
      <p className="muted-inline">Na tento účet chodí kauce, platby předem za balíčky a QR platby z účtenek.</p>
      <label className="field narrow"><span>Dárkové poukazy platí (měsíců od prodeje)</span><input type="number" min={1} max={60} value={settings.voucherMonths} onChange={e => setSettings({...settings, voucherMonths: Number(e.target.value)})}/></label>
      <div className="form-actions"><button className="primary" disabled={busy} onClick={() => run(() => post({kind: 'settings', data: settings}), 'Nastavení kauce bylo uloženo.')}>Uložit kauce a platby</button></div>
    </section>

    <section className="panel">
      <div className="panel-heading"><h2>Údaje salonu</h2></div>
      <p className="muted-inline">Zobrazí se v administraci, na rezervační stránce, v e-mailech klientkám a na účtenkách.</p>
      <LogoPicker version={settings.logoVersion} busy={busy} onPick={image => run(() => post({kind: 'logo', data: {image}}), image ? 'Logo bylo nahráno.' : 'Logo bylo odebráno.')} onError={setError}/>
      <div className="field-grid">
        <label className="field"><span>Název provozovny</span><input value={settings.businessName} maxLength={80} onChange={e => setSettings({...settings, businessName: e.target.value})}/></label>
        <label className="field"><span>Provozovatel (jméno podnikatelky)</span><input value={settings.businessOwner} maxLength={80} onChange={e => setSettings({...settings, businessOwner: e.target.value})}/></label>
        <label className="field"><span>Adresa</span><input value={settings.businessAddress} maxLength={160} onChange={e => setSettings({...settings, businessAddress: e.target.value})}/></label>
        <label className="field"><span>IČO</span><input value={settings.businessId} inputMode="numeric" maxLength={8} onChange={e => setSettings({...settings, businessId: e.target.value})}/></label>
        <label className="field"><span>Telefon pro klientky</span><input value={settings.businessPhone} type="tel" maxLength={30} placeholder="777 123 456" onChange={e => setSettings({...settings, businessPhone: e.target.value})}/></label>
        <label className="field"><span>E-mail pro odpovědi klientek</span><input value={settings.businessEmail} type="email" maxLength={120} onChange={e => setSettings({...settings, businessEmail: e.target.value})}/></label>
      </div>
      <label className="check"><input type="checkbox" checked={settings.programEnabled} onChange={e => setSettings({...settings, programEnabled: e.target.checked})}/> Program Čistá pleť (série ošetření A-QS Hacker se sledováním termínů na kartě klientky)</label>
      <p className="muted-inline">Na účtence bude i „neplátce DPH“ a QR kód na účet z části Kauce a platby.</p>
      <div className="form-actions"><button className="primary" disabled={busy} onClick={() => run(() => post({kind: 'settings', data: settings}), 'Údaje salonu byly uloženy.')}>Uložit údaje</button></div>
    </section>

    <SmsPanel settings={settings} setSettings={setSettings} provider={features.sms || ''} busy={busy} run={run}/>

    <PasswordPanel/>

    <ProductsPanel/>

    <section className="panel">
      <div className="panel-heading"><h2>Rezervace na vašem webu</h2></div>
      <p>Rezervační stránka má vlastní adresu <b>{bookingUrl}</b>. Na webu stačí, aby na ni vedlo tlačítko „Objednat se“. Pokud ji chcete mít přímo uvnitř stránky na WordPressu, vložte blok <b>Vlastní HTML</b> s tímto kódem:</p>
      <pre className="embed-code">{embed}</pre>
      <div className="form-actions"><a className="secondary" href={bookingUrl} target="_blank" rel="noreferrer">Otevřít rezervační stránku</a><button className="secondary" onClick={() => navigator.clipboard.writeText(embed).then(() => setCopied(true), () => setCopied(false))}><Copy size={16}/> {copied ? 'Zkopírováno' : 'Zkopírovat kód'}</button></div>
    </section>
  </div>;
}

function LogoPicker({version, busy, onPick, onError}: {version: number; busy: boolean; onPick: (image: string | null) => void; onError: (message: string) => void}) {
  return <div className="logo-picker">
    <img src={logoSrc(version)} alt="Logo salonu" width={64} height={64}/>
    <label className={'secondary' + (busy ? ' disabled' : '')}><ImageUp size={16}/> {version ? 'Změnit logo' : 'Nahrát logo'}
      <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) shrinkImage(f).then(onPick, err => onError((err as Error).message)); }}/></label>
    {!!version && <button type="button" className="link-button" disabled={busy} onClick={() => onPick(null)}>Odebrat logo</button>}
    <small className="muted-inline">PNG, JPG nebo WebP, ideálně čtvercové.</small>
  </div>;
}

/** Změna hesla do administrace; po změně se odhlásí ostatní zařízení. */
const SMS_HINTS: Record<string, string> = {jmeno: 'křestní jméno', salon: 'název salonu', kdy: '„zítra“ nebo „dnes“', datum: 'např. pá 18.10.', cas: 'např. 9:30', osetreni: 'název ošetření', telefon: 'telefon salonu'};

/** SMS připomínky den před termínem: zapnutí, čas odeslání, text a zkušební SMS. */
function SmsPanel({settings, setSettings, provider, busy, run}: {settings: BookingSettings; setSettings: (s: BookingSettings) => void; provider: string; busy: boolean; run: (action: () => Promise<unknown>, message: string) => Promise<void>}) {
  const [phone, setPhone] = useState(''), [test, setTest] = useState<{busy?: boolean; message?: string; error?: boolean}>({});
  // Zkušební SMS neukládá nastavení, aby se rozepsaný text neztratil.
  const sendTest = async () => { setTest({busy: true}); try { await post({kind: 'sms', action: 'test', data: {phone, template: settings.smsTemplate, ascii: settings.smsAscii}}); setTest({message: 'Zkušební SMS byla odeslána.'}); } catch (e) { setTest({message: (e as Error).message, error: true}); } };
  const sample = renderSms(settings.smsTemplate, {name: 'Jana Nováková', start: addDays(salonNow().slice(0, 10), 1) + 'T09:30', serviceName: 'Hydratační ošetření'}, {name: salonName(settings), phone: settings.businessPhone || '777 123 456'}, settings.smsAscii, salonNow().slice(0, 10));
  const size = smsParts(sample);
  return <section className="panel sms-panel">
    <div className="panel-heading"><h2>SMS připomínky klientkám</h2></div>
    <p className="muted-inline">Den před termínem dostane klientka SMS. Posílá se potvrzeným rezervacím s číslem mobilu, každému termínu jednou (po přesunu znovu). Rezervace vytvořené méně než den předem se nepřipomínají.</p>
    {provider ? <p className="muted-inline">SMS odchází přes: <b>{provider}</b>.</p>
      : <p className="setup-hint inline" role="note">SMS zatím nejsou na serveru nastavené. Správce serveru doplní SMS bránu do .env.selfhost (postup v README, oddíl SMS připomínky). Text si můžete připravit už teď.</p>}
    <label className="check"><input type="checkbox" checked={settings.smsReminders} onChange={e => setSettings({...settings, smsReminders: e.target.checked})}/> Posílat SMS připomínky den před termínem</label>
    <label className="field narrow"><span>Odeslat v (čas, kdy SMS odejdou)</span><input type="time" min="07:00" max="20:00" step={900} value={settings.smsTime} onChange={e => setSettings({...settings, smsTime: e.target.value})}/></label>
    <label className="field"><span>Text zprávy</span><textarea rows={4} maxLength={480} value={settings.smsTemplate} onChange={e => setSettings({...settings, smsTemplate: e.target.value})}/></label>
    <p className="sms-placeholders">{SMS_PLACEHOLDERS.map(k => <button key={k} type="button" className="secondary" title={SMS_HINTS[k]} onClick={() => setSettings({...settings, smsTemplate: settings.smsTemplate.trimEnd() + ' {' + k + '}'})}>{'{' + k + '}'}</button>)}
      {settings.smsTemplate !== DEFAULT_SMS_TEMPLATE && <button type="button" className="link-button" onClick={() => setSettings({...settings, smsTemplate: DEFAULT_SMS_TEMPLATE})}>Vrátit původní text</button>}</p>
    <label className="check"><input type="checkbox" checked={settings.smsAscii} onChange={e => setSettings({...settings, smsAscii: e.target.checked})}/> Poslat bez háčků a čárek (do jedné SMS se vejde 160 znaků místo 70)</label>
    <div className="sms-preview"><MessageSquare size={16}/><div><p>{sample}</p><small>{size.length} znaků · {size.parts === 1 ? '1 SMS' : `${size.parts} SMS (platí se každá)`}{!settings.businessPhone && settings.smsTemplate.includes('{telefon}') && ' · vyplňte telefon v Údajích salonu'}</small></div></div>
    {test.message && <p className={test.error ? 'error' : 'notice'} role={test.error ? 'alert' : 'status'}>{test.message}</p>}
    <div className="form-actions sms-actions">
      {provider && <span className="sms-test"><input type="tel" aria-label="Číslo pro zkušební SMS" placeholder="Váš mobil" value={phone} onChange={e => setPhone(e.target.value)}/>
        <button className="secondary" disabled={busy || test.busy || !phone.trim()} onClick={sendTest}>Poslat zkušební SMS</button></span>}
      <button className="primary" disabled={busy} onClick={() => run(() => post({kind: 'settings', data: settings}), 'Nastavení SMS bylo uloženo.')}>Uložit SMS připomínky</button>
    </div>
  </section>;
}

function PasswordPanel() {
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget, f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    setError(''); setNotice('');
    if (f.password !== f.repeat) { setError('Nové heslo a jeho zopakování se neshodují.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/account', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({current: f.current, password: f.password})});
      const d = await r.json() as {error?: string};
      if (!r.ok) throw new Error(d.error || 'Heslo se nepodařilo změnit.');
      form.reset(); setNotice('Heslo bylo změněno. Ostatní zařízení se musí přihlásit znovu.');
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <section className="panel">
    <div className="panel-heading"><h2>Heslo do administrace</h2></div>
    {error && <div className="error" role="alert">{error}</div>}
    {notice && <p className="notice" role="status">{notice}</p>}
    <form className="password-form" onSubmit={submit}>
      <label className="field"><span>Současné heslo</span><input name="current" type="password" autoComplete="current-password" required/></label>
      <div className="field-grid">
        <label className="field"><span>Nové heslo (aspoň 12 znaků)</span><input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={200} required/></label>
        <label className="field"><span>Nové heslo znovu</span><input name="repeat" type="password" autoComplete="new-password" minLength={12} maxLength={200} required/></label>
      </div>
      <div className="form-actions"><button className="primary" disabled={busy}>{busy ? 'Měním…' : 'Změnit heslo'}</button></div>
    </form>
  </section>;
}
