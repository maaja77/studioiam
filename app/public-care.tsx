'use client';
// Doporučená domácí péče pro klientku přes tajný odkaz z SMS nebo e-mailu.
import {useEffect, useState} from 'react';
import {CalendarPlus, Phone, Printer} from 'lucide-react';
import {formatRevenue} from '../lib/revenue';
import {logoSrc} from './logo';

type Data = {care: {date: string; treatment: string; text: string; products: {name: string; priceCents: number | null}[]}; salon: {name: string; phone: string; address: string; logoVersion: number; bookingUrl: string}};
const dateText = (s: string) => s.split('-').reverse().map(Number).join('. ');

/** Text doporučení: řádky začínající pomlčkou jako odrážky, ostatní jako odstavce. */
export function CareText({text}: {text: string}) {
  const blocks: (string | string[])[] = [];
  for (const line of text.split('\n').map(l => l.trim()).filter(Boolean)) {
    const item = line.match(/^[-•*]\s*(.+)$/);
    if (item) { const last = blocks[blocks.length - 1]; if (Array.isArray(last)) last.push(item[1]); else blocks.push([item[1]]); } else blocks.push(line);
  }
  return <>{blocks.map((b, i) => Array.isArray(b) ? <ul key={i}>{b.map((x, j) => <li key={j}>{x}</li>)}</ul> : <p key={i}>{b}</p>)}</>;
}

export default function PublicCare({token}: {token: string}) {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/public?care=' + encodeURIComponent(token), {cache: 'no-store'}).then(async r => {
      const d = await r.json() as Partial<Data> & {error?: string};
      if (!r.ok || !d.care || !d.salon) throw new Error(d.error || 'Doporučení se nepodařilo načíst.');
      setData(d as Data);
    }).catch(e => setError((e as Error).message));
  }, [token]);
  const s = data?.salon;
  return <div className="public-care">
    <header className="pb-header"><img className="brand-logo" src={logoSrc(s?.logoVersion)} alt="" width={56} height={56}/><div><b>{s?.name.toLocaleUpperCase('cs') || ' '}</b><span>DOMÁCÍ PÉČE</span></div></header>
    <main>{error ? <p className="error" role="alert">{error}</p> : !data ? <p className="muted">Načítám…</p> : <>
      <section className="care-card">
        <p className="eyebrow">PO OŠETŘENÍ {dateText(data.care.date)}</p>
        <h1>{data.care.treatment}</h1>
        {data.care.text && <div className="care-text"><CareText text={data.care.text}/></div>}
      </section>
      {data.care.products.length > 0 && <section className="care-card">
        <h2>Doporučené přípravky</h2>
        <ul className="care-products">{data.care.products.map((p, i) => <li key={i}><span>{p.name}</span>{p.priceCents ? <b>{formatRevenue(p.priceCents)}</b> : null}</li>)}</ul>
        <p className="muted-inline">Přípravky jsou k dostání v salonu, stačí říct při další návštěvě.</p>
      </section>}
      <p className="care-actions">
        <a className="primary" href={s!.bookingUrl}><CalendarPlus size={17}/> Objednat další ošetření</a>
        {s!.phone && <a className="secondary" href={'tel:' + s!.phone.replace(/[^\d+]/g, '')}><Phone size={16}/> {s!.phone}</a>}
        <button type="button" className="secondary" onClick={() => window.print()}><Printer size={16}/> Vytisknout</button>
      </p>
    </>}</main>
  </div>;
}
