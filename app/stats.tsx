'use client';
// Statistiky: kolik jakého ošetření, tržby za měsíc, rok a průběžně.
import {useEffect, useState} from 'react';
import {ChevronLeft, ChevronRight} from 'lucide-react';
import {formatRevenue} from '../lib/revenue';
import {salonNow} from '../lib/booking';

type Treatment = {name: string; category: string; color: string; count: number; revenueCents: number};
type Stats = {
  period: {year: string; month: string; all: boolean; today: string};
  revenue: {totalCents: number; receiptsCents: number; visitsCents: number; servicesCents: number; productsCents: number; otherCents: number; discountsCents: number; receipts: number};
  treatments: Treatment[]; count: number; noShows: number; cancelled: number;
  months: {month: string; revenueCents: number; treatments: number}[]; allTimeCents: number;
};
type Mode = 'month' | 'year' | 'all';

const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
const SHORT = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
const shift = (ym: string, by: number) => { const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + by, 1)); return d.toISOString().slice(0, 7); };
const plural = (n: number, one: string, few: string, many: string) => n === 1 ? one : n >= 2 && n <= 4 ? few : many;

export default function StatsView() {
  const now = salonNow().slice(0, 7);
  const [mode, setMode] = useState<Mode>('month'), [ym, setYm] = useState(now);
  const [data, setData] = useState<Stats | null>(null), [error, setError] = useState(''), [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const q = mode === 'all' ? 'period=all' : mode === 'year' ? `year=${ym.slice(0, 4)}` : `year=${ym.slice(0, 4)}&month=${ym.slice(5, 7)}`;
    setError('');
    fetch('/api/stats?' + q, {cache: 'no-store'}).then(async r => { const d = await r.json() as Stats & {error?: string}; if (!r.ok) throw new Error(d.error); setData(d); }).catch(e => setError((e as Error).message || 'Statistiky se nepodařilo načíst.'));
  }, [mode, ym]);

  const title = mode === 'all' ? 'Celá historie salonu' : mode === 'year' ? `Rok ${ym.slice(0, 4)}` : `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
  const step = (by: number) => setYm(mode === 'year' ? shift(ym, by * 12) : shift(ym, by));
  const atEnd = mode === 'year' ? ym.slice(0, 4) >= now.slice(0, 4) : ym >= now;
  const r = data?.revenue, maxCount = Math.max(1, ...(data?.treatments.map(t => t.count) || [1]));
  const ytd = data?.months.filter(m => m.month <= now).reduce((s, m) => s + m.revenueCents, 0) || 0;
  const maxMonth = Math.max(1, ...(data?.months.map(m => m.revenueCents) || [1]));

  return <div className="stats">
    <div className="heading"><div><p className="eyebrow">PŘEHLED SALONU</p><h1>Statistiky</h1><p>Ošetření podle rezervací označených jako proběhlé, tržby z účtenek a zápisů v kartách.</p></div></div>
    <div className="stats-period">
      <span className="segmented-mini" role="radiogroup" aria-label="Období">{([['month', 'Měsíc'], ['year', 'Rok'], ['all', 'Celkem']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={mode === k} className={mode === k ? 'active' : ''} onClick={() => setMode(k)}>{l}</button>)}</span>
      {mode !== 'all' && <span className="stats-step">
        <button type="button" className="secondary" aria-label="Předchozí" onClick={() => step(-1)}><ChevronLeft size={18}/></button>
        <b>{title}</b>
        <button type="button" className="secondary" aria-label="Další" disabled={atEnd} onClick={() => step(1)}><ChevronRight size={18}/></button>
        {mode === 'month' && ym !== shift(now, -1) && <button type="button" className="link-button" onClick={() => setYm(shift(now, -1))}>Minulý měsíc</button>}
      </span>}
    </div>
    {error && <div className="error" role="alert">{error}</div>}
    {!data || !r ? !error && <p className="muted">Načítám statistiky…</p> : <>
      <section className="stat-tiles" aria-label="Souhrn">
        <div className="stat-tile main"><span>Tržby · {title}</span><strong>{formatRevenue(r.totalCents)}</strong><small>{r.receipts} {plural(r.receipts, 'účtenka', 'účtenky', 'účtenek')}{r.visitsCents > 0 && ` · ${formatRevenue(r.visitsCents)} zapsáno v kartách`}</small></div>
        <div className="stat-tile"><span>Ošetření</span><strong>{data.count}</strong><small>{data.count ? `průměrně ${formatRevenue(Math.round(r.servicesCents / data.count / 100) * 100)}` : 'zatím žádné proběhlé'}</small></div>
        <div className="stat-tile"><span>Prodej produktů</span><strong>{formatRevenue(r.productsCents)}</strong><small>{r.discountsCents > 0 ? `slevy celkem ${formatRevenue(r.discountsCents)}` : 'bez slev'}</small></div>
        <div className="stat-tile"><span>Nepřišla / zrušeno</span><strong>{data.noShows} / {data.cancelled}</strong><small>rezervací v období</small></div>
      </section>

      <section className="panel stats-panel">
        <div className="panel-heading"><h2>Ošetření · {title}</h2><span className="muted-inline">{data.count} {plural(data.count, 'ošetření', 'ošetření', 'ošetření')}</span></div>
        {!data.treatments.length ? <p className="muted-inline">V tomto období zatím nejsou žádná ošetření označená jako proběhlá. Ošetření se započítá po kliknutí na Dokončit nebo Proběhlo u rezervace.</p>
        : <table className="stats-table">
          <thead><tr><th>Ošetření</th><th className="num">Počet</th><th className="bar-cell" aria-hidden="true"></th><th className="num">Tržba</th></tr></thead>
          <tbody>{data.treatments.map(t => <tr key={t.name}>
            <td><div className="t-name"><span className="dot" style={{background: t.color}} aria-hidden="true"/><span><b>{t.name}</b>{t.category && <small>{t.category}</small>}</span></div></td>
            <td className="num"><b>{t.count}×</b></td>
            <td className="bar-cell" aria-hidden="true"><span className="bar" style={{width: `${t.count / maxCount * 100}%`}}/></td>
            <td className="num">{t.revenueCents ? formatRevenue(t.revenueCents) : '–'}</td>
          </tr>)}</tbody>
        </table>}
      </section>

      <section className="panel stats-panel">
        <div className="panel-heading"><h2>Tržby po měsících · {data.period.year}</h2><span className="muted-inline">Průběžně od začátku roku <b>{formatRevenue(data.period.year === now.slice(0, 4) ? ytd : data.months.reduce((s, m) => s + m.revenueCents, 0))}</b> · celkem za salon <b>{formatRevenue(data.allTimeCents)}</b></span></div>
        <div className="month-chart" role="img" aria-label={`Tržby po měsících roku ${data.period.year}`} onMouseLeave={() => setHover(null)}>
          {data.months.map((m, i) => {
            const selected = mode === 'month' && m.month === ym, future = m.month > now;
            return <button type="button" key={m.month} className={'month-col' + (selected ? ' selected' : '') + (future ? ' future' : '')} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={() => { setMode('month'); setYm(m.month); }} aria-label={`${MONTHS[i]}: ${formatRevenue(m.revenueCents)}, ${m.treatments} ošetření`}>
              {hover === i && <span className="month-tip" role="tooltip"><b>{MONTHS[i]}</b>{formatRevenue(m.revenueCents)}<small>{m.treatments} ošetření</small></span>}
              <span className="month-bar-wrap"><span className="month-bar" style={{height: `${m.revenueCents / maxMonth * 100}%`}}/></span>
              <span className="month-label">{SHORT[i]}</span>
            </button>;
          })}
        </div>
        <details className="stats-table-view"><summary>Zobrazit jako tabulku</summary>
          <table className="stats-table"><thead><tr><th>Měsíc</th><th className="num">Ošetření</th><th className="num">Tržba</th></tr></thead>
            <tbody>{data.months.map((m, i) => <tr key={m.month}><td>{MONTHS[i]}</td><td className="num">{m.treatments}</td><td className="num">{formatRevenue(m.revenueCents)}</td></tr>)}</tbody></table>
        </details>
      </section>
    </>}
  </div>;
}
