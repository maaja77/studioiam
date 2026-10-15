'use client';
import {useEffect, useState} from 'react';
import {Copy, Pencil, Plus, Trash2, X} from 'lucide-react';
import {DEFAULT_SETTINGS, WEEKDAYS, type BookingSettings} from '../lib/booking';
import {formatRevenue} from '../lib/revenue';
import {CATEGORY_COLORS, PRICE_LIST, serviceColor} from '../lib/price-list';
import type {Service} from './bookings';

async function post(body: unknown) {
  const r = await fetch('/api/bookings', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const d = await r.json() as {error?: string};
  if (!r.ok) throw new Error(d.error || 'Změnu se nepodařilo uložit.');
}
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function BookingSettingsView({bookingUrl}: {bookingUrl: string}) {
  const [services, setServices] = useState<Service[]>([]), [settings, setSettings] = useState<BookingSettings>(DEFAULT_SETTINGS);
  const [editing, setEditing] = useState<Partial<Service> | null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false);
  const embed = `<iframe src="${bookingUrl}" title="Rezervace Studio I AM" style="width:100%;min-height:900px;border:0" loading="lazy"></iframe>`;

  async function load() {
    try {
      const r = await fetch('/api/bookings?from=2000-01-01&to=2000-01-01', {cache: 'no-store'});
      const d = await r.json() as {error?: string; services: Service[]; settings: BookingSettings};
      if (!r.ok) throw new Error(d.error); setServices(d.services); setSettings(d.settings);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { load(); }, []);
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError('');
    try { await action(); await load(); setNotice(message); setEditing(null); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const setDay = (day: number, value: [string, string] | null) => setSettings(s => ({...s, hours: {...s.hours, [String(day)]: value}}));

  const groups = [...services.reduce((m, x) => m.set(x.category, [...(m.get(x.category) || []), x]), new Map<string, Service[]>())];
  return <div className="booking-settings">
    <div className="heading"><div><p className="eyebrow">ONLINE REZERVACE</p><h1>Nastavení</h1><p>Co si klientky mohou rezervovat a kdy.</p></div></div>
    {error && <div className="error" role="alert">{error}</div>}
    {notice && <p className="notice" role="status">{notice}<button aria-label="Zavřít oznámení" onClick={() => setNotice('')}><X size={15}/></button></p>}

    <section className="panel">
      <div className="panel-heading"><h2>Ošetření a ceník</h2><button className="primary" onClick={() => setEditing({durationMin: 60, active: 1})}><Plus size={17}/> Přidat ošetření</button></div>
      {!services.length && <div className="empty-services"><p>Zatím tu není žádné ošetření. Klientky si online nic nevyberou, dokud ho nepřidáte.</p><button className="secondary" disabled={busy} onClick={() => run(async () => { for (const [i, [category, name, durationMin, price]] of PRICE_LIST.entries()) await post({kind: 'service', action: 'save', data: {name, category, durationMin, price: String(price), color: CATEGORY_COLORS[category] || '', active: true, sort: i}}); }, 'Ceník byl vložen. Délky, ceny a popisy si zkontrolujte.')}>Vložit ceník z MyFoxu ({PRICE_LIST.length} ošetření)</button></div>}
      {groups.map(([category, list]) => <div key={category} className="service-group">
        <h3>{category || 'Bez kategorie'} <small>{list.length}</small></h3>
        <ul className="service-list">{list.map(s => <li key={s.id} className={s.active ? '' : 'inactive'}>
          <span className="color-dot" style={{background: serviceColor(s.color, s.category)}} aria-hidden="true"/>
          <div><b>{s.name}</b><small>{s.durationMin} min · {s.priceCents ? formatRevenue(s.priceCents) : 'bez ceny'}{!s.active && ' · skryté na webu'}</small>{s.description && <small className="service-desc">{s.description}</small>}</div>
          <span className="actions"><button aria-label={'Upravit ' + s.name} onClick={() => setEditing(s)}><Pencil size={16}/></button><button aria-label={'Smazat ' + s.name} disabled={busy} onClick={() => run(() => post({kind: 'service', action: 'delete', data: {id: s.id}}), 'Ošetření bylo smazáno.')}><Trash2 size={16}/></button></span>
        </li>)}</ul></div>)}
      {editing && <form className="service-form" ref={el => el?.scrollIntoView({block: "nearest", behavior: "smooth"})} onSubmit={e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); run(() => post({kind: 'service', action: 'save', data: {id: editing.id, name: f.name, category: f.category, description: f.description, color: f.color, durationMin: Number(f.durationMin), price: f.price, active: f.active === 'on', sort: editing.sort ?? services.length}}), 'Ošetření bylo uloženo.'); }}>
        <label className="field"><span>Název</span><input name="name" required maxLength={150} defaultValue={editing.name}/></label>
        <div className="field-grid"><label className="field"><span>Kategorie</span><input name="category" list="service-categories" maxLength={80} defaultValue={editing.category} placeholder="Např. Masáže"/></label>
          <label className="field"><span>Barva v kalendáři</span><input name="color" type="color" defaultValue={serviceColor(editing.color, editing.category)}/></label></div>
        <datalist id="service-categories">{[...new Set([...Object.keys(CATEGORY_COLORS), ...services.map(x => x.category)])].filter(Boolean).map(c => <option key={c} value={c}/>)}</datalist>
        <label className="field"><span>Popis pro klientky</span><textarea name="description" rows={2} maxLength={600} defaultValue={editing.description} placeholder="Krátce, co ošetření dělá a pro koho je"/></label>
        <div className="field-grid"><label className="field"><span>Délka (min)</span><input name="durationMin" type="number" min={5} max={600} step={5} required defaultValue={editing.durationMin}/></label><label className="field"><span>Cena (Kč, 0 = bez ceny)</span><input name="price" inputMode="decimal" required defaultValue={editing.priceCents != null ? String(editing.priceCents / 100).replace('.', ',') : ''}/></label></div>
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
      <div className="field-grid">
        <label className="field"><span>Číslo účtu</span><input value={settings.account} placeholder="123456789/0300" onChange={e => setSettings({...settings, account: e.target.value})}/></label>
        <label className="field"><span>Příjemce</span><input value={settings.accountName} maxLength={60} onChange={e => setSettings({...settings, accountName: e.target.value})}/></label>
      </div>
      {!settings.account && <p className="muted-inline">Bez čísla účtu se kauce nevybírá.</p>}
      <div className="form-actions"><button className="primary" disabled={busy} onClick={() => run(() => post({kind: 'settings', data: settings}), 'Nastavení kauce bylo uloženo.')}>Uložit kauce a platby</button></div>
    </section>

    <section className="panel">
      <div className="panel-heading"><h2>Rezervace na vašem webu</h2></div>
      <p>Rezervační stránka má vlastní adresu <b>{bookingUrl}</b>. Na webu stačí, aby na ni vedlo tlačítko „Objednat se“. Pokud ji chcete mít přímo uvnitř stránky na WordPressu, vložte blok <b>Vlastní HTML</b> s tímto kódem:</p>
      <pre className="embed-code">{embed}</pre>
      <div className="form-actions"><a className="secondary" href={bookingUrl} target="_blank" rel="noreferrer">Otevřít rezervační stránku</a><button className="secondary" onClick={() => navigator.clipboard.writeText(embed).then(() => setCopied(true), () => setCopied(false))}><Copy size={16}/> {copied ? 'Zkopírováno' : 'Zkopírovat kód'}</button></div>
    </section>
  </div>;
}
