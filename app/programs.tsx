'use client';
// Programy na kartě klientky: výběr programu, panel s termínem a cenou další návštěvy a výběr programu při zápisu návštěvy.
import {useState} from 'react';
import {CalendarDays, Sparkles} from 'lucide-react';
import {programQuote, programStatus, stepDiscount, stepPrice, type Program, type ProgramVisit} from '../lib/programs';
import {formatRevenue} from '../lib/revenue';
import VisitProducts, {type CatalogItem, type VisitItem} from './visit-products';
export const programToday = () => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Prague'}).format(new Date());
const displayDate = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('cs-CZ');

export function ProgramBadge({program, visits}: {program: Program; visits: ProgramVisit[]}) {
  const status = programStatus(program, visits, programToday());
  return <small className={'program-badge ' + (status.overdue ? 'late' : '')}>{program.name} · {status.dueDate ? (status.overdue ? 'Po termínu od ' : 'do ') + displayDate(status.dueDate) : 'první návštěva'}</small>;
}

/** Ceny po krocích: „1. návštěva 1 290 Kč · 2. návštěva −5 % … · 3. a další −10 % …“. */
export function stepList(program: Program) {
  const n = Math.max(1, program.discounts.length);
  return Array.from({length: n}, (_, i) => ({label: i + 1 === n && n > 1 ? `${i + 1}. a další` : `${i + 1}. návštěva`, discount: stepDiscount(program, i + 1), priceCents: stepPrice(program, i + 1)}));
}

/** Nenápadný výběr programu; zobrazí se jen programy, ve kterých klientka ještě není. */
export function ProgramPicker({programs, busy, onAdd}: {programs: Program[]; busy: boolean; onAdd: (id: string) => void}) {
  if (!programs.length) return null;
  return <div className="program-picker"><span>Programy</span><select aria-label="Přidat klientce program" value="" disabled={busy} onChange={e => { if (e.target.value) onAdd(e.target.value); }}>
    <option value="">Přidat program…</option>{programs.map(p => <option key={p.id} value={p.id}>{p.name} ({p.treatment})</option>)}</select></div>;
}

export function ProgramPanel({program, visits, busy, onRemove}: {program: Program; visits: ProgramVisit[]; busy: boolean; onRemove: () => void}) {
  const today = programToday(), quote = programQuote(program, visits, today), status = programStatus(program, visits, today), weeks = program.intervalDays % 7 === 0 ? `${program.intervalDays / 7} ${program.intervalDays / 7 === 1 ? 'týden' : program.intervalDays / 7 < 5 ? 'týdny' : 'týdnů'}` : `${program.intervalDays} dní`;
  return <section className="program-panel enabled">
    <div className="program-heading"><div><p className="eyebrow"><Sparkles size={14}/> DOPLŇKOVÝ PROGRAM</p><h2>{program.name}</h2><p>{program.treatment} · další návštěva nejpozději za {weeks}</p></div>
      <button className="secondary" disabled={busy} onClick={onRemove}>Vypnout program</button></div>
    <div className="program-status"><div className={status.overdue ? 'program-deadline late' : 'program-deadline'}><CalendarDays size={21}/><div><span>Další návštěva nejpozději</span><strong>{status.dueDate ? displayDate(status.dueDate) : 'Zapište první návštěvu'}</strong>
      {status.daysLeft !== null && <small>{status.overdue ? `Termín překročen o ${Math.abs(status.daysLeft)} dní. Cena začíná znovu na ${formatRevenue(program.priceCents)}.` : status.daysLeft === 0 ? 'Poslední den pro návštěvu se slevou.' : status.daysLeft + ' dní do termínu.'}</small>}</div></div>
      <div className="program-next"><span>Cena při návštěvě dnes</span><strong>{formatRevenue(quote.priceCents)}</strong><small>{quote.step}. návštěva v sérii · sleva {quote.discount} %</small></div></div>
    <div className="program-prices">{stepList(program).map(s => <span key={s.label}>{s.label}{s.discount ? ` · −${s.discount} %` : ''} <b>{formatRevenue(s.priceCents)}</b></span>)}</div>
    <p className="program-rule">Při odstupu delším než {program.intervalDays} dní začíná série slev znovu. Počítají se pouze návštěvy označené programem {program.name}.</p>
  </section>;
}

export type VisitData = Partial<ProgramVisit & {clientId: string; treatment: string; revenueCents: number | null; products: string; notes: string; items: VisitItem[]}>;
/** Pole formuláře návštěvy: datum, program (z programů klientky), ošetření, tržba (u programu předvyplněná), přípravky a poznámky. */
export function ProgramVisitFields({data, visits, programs, catalog = [], previous = []}: {data: VisitData; visits: ProgramVisit[]; programs: Program[]; catalog?: CatalogItem[]; previous?: VisitItem[]}) {
  const initial = data.id ? data.programId || '' : programs.length === 1 ? programs[0].id : '';
  const [date, setDate] = useState(data.date || programToday()), [programId, setProgramId] = useState(initial), [treatment, setTreatment] = useState(data.treatment || programs.find(p => p.id === initial)?.treatment || '');
  const [revenue, setRevenue] = useState(data.revenueCents == null ? '' : (data.revenueCents / 100).toFixed(2).replace('.', ',')), [autoRevenue, setAutoRevenue] = useState(!data.id && !!initial);
  const program = programs.find(p => p.id === programId) || null;
  const fresh = program ? programQuote(program, visits, date, data.id) : null;
  const quote = fresh && data.programId === programId && date === data.date && data.programPriceCents != null ? {...fresh, priceCents: data.programPriceCents, step: data.programStep || fresh.step, discount: stepDiscount(program!, data.programStep || fresh.step)} : fresh;
  const value = quote && autoRevenue ? (quote.priceCents / 100).toFixed(2).replace('.', ',') : revenue;
  function pick(id: string) { if (!id) { setRevenue(value); setAutoRevenue(false); } else { setTreatment(programs.find(p => p.id === id)?.treatment || treatment); setAutoRevenue(true); } setProgramId(id); }
  return <><label className="field"><span>Datum návštěvy *</span><input name="date" type="date" required value={date} onChange={e => setDate(e.target.value)}/></label>
    {programs.length > 0 && <div className="program-form"><label className="field"><span>Program</span><select value={programId} onChange={e => pick(e.target.value)}><option value="">Bez programu</option>{programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {quote && <p>{quote.step}. návštěva v sérii · sleva {quote.discount} % · <b>{formatRevenue(quote.priceCents)}</b>{quote.restarted && <small>Odstup je delší než {program!.intervalDays} dní. Série začíná znovu.</small>}</p>}</div>}
    <input type="hidden" name="programId" value={programId}/>
    <label className="field"><span>Ošetření *</span><input name="treatment" value={program ? program.treatment : treatment} readOnly={!!program} required placeholder="Název ošetření" onChange={e => setTreatment(e.target.value)}/></label>
    <label className="field"><span>Tržba (Kč)</span><input name="revenue" type="text" inputMode="decimal" maxLength={15} value={value} onChange={e => { setAutoRevenue(false); setRevenue(e.target.value); }} placeholder="Např. 1200 nebo 1200,50"/><small>{program ? 'Cena programu je předvyplněná. Částku můžete upravit podle skutečně přijaté tržby.' : 'Zapište přijatou částku. Nevyplněná tržba se do součtů nezapočítá.'}</small></label>
    <VisitProducts initial={data.items || []} legacy={data.products || ''} previous={previous} catalog={catalog}/>
    <label className="field"><span>Průběh a poznámky k ošetření</span><textarea name="notes" rows={3} maxLength={20000} defaultValue={data.notes || ''} placeholder="Průběh ošetření, reakce pleti, domácí péče…"/></label></>;
}
