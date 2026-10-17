'use client';
// Podklady pro účetní: souhrn měsíce, kniha účtenek, stažení CSV a tisk (nebo uložení jako PDF).
import {useEffect, useState} from 'react';
import {ChevronLeft, Download, Printer} from 'lucide-react';
import {formatRevenue} from '../lib/revenue';
import {METHOD_TEXT, type AccountingDeposit, type AccountingReceipt, type AccountingSummary} from '../lib/accounting';

type Data = {month: string; salon: {name: string; businessId: string; owner: string; address: string}; receipts: AccountingReceipt[]; deposits: AccountingDeposit[]; summary: AccountingSummary};
const dateText = (s: string) => s.slice(0, 10).split('-').reverse().map(Number).join('. ');
const monthText = (m: string) => new Date(m + '-15T12:00:00').toLocaleDateString('cs-CZ', {month: 'long', year: 'numeric'});
const plural = (n: number, one: string, few: string, many: string) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
const previousMonth = (m: string) => { const [y, n] = m.split('-').map(Number); return n === 1 ? `${y - 1}-12` : `${y}-${String(n - 1).padStart(2, '0')}`; };

export default function Accounting({month: initial, onBack}: {month: string; onBack: () => void}) {
  // Účetní obvykle chce minulý měsíc; z Účtenek se ale převezme právě vybraný měsíc.
  const [month, setMonth] = useState(initial), [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    setData(null);
    fetch('/api/accounting?month=' + month, {cache: 'no-store'}).then(async r => { const d = await r.json() as Data & {error?: string}; if (!r.ok) throw new Error(d.error); setData(d); setError(''); })
      .catch(e => setError((e as Error).message || 'Podklady se nepodařilo načíst.'));
  }, [month]);
  async function download() {
    setBusy(true); setError('');
    try {
      const r = await fetch(`/api/accounting?month=${month}&format=csv`, {cache: 'no-store'});
      if (!r.ok) throw new Error('Soubor se nepodařilo připravit.');
      const url = URL.createObjectURL(await r.blob()), a = document.createElement('a');
      a.href = url; a.download = `podklady-ucetni-${month}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const s = data?.summary;
  return <div className="accounting">
    <button className="pb-back" onClick={onBack}><ChevronLeft size={16}/> Účtenky</button>
    <div className="heading"><div><p className="eyebrow">ÚČTENKY</p><h1>Podklady pro účetní</h1><p>Souhrn tržeb za měsíc a seznam účtenek. Jména klientek v podkladech nejsou.</p></div>
      <div className="heading-actions"><button className="secondary" disabled={!data} onClick={() => window.print()}><Printer size={17}/> Vytisknout / PDF</button>
        <button className="primary" disabled={!data || busy} onClick={download}><Download size={17}/> Stáhnout CSV</button></div></div>
    <div className="voucher-tools"><label className="field inline-field"><span>Měsíc</span><input type="month" value={month} required onChange={e => { if (e.target.value) setMonth(e.target.value); }}/></label>
      <button type="button" className="link-button" onClick={() => setMonth(previousMonth(month))}>Předchozí měsíc</button></div>
    {error && <div className="error" role="alert">{error}</div>}
    {!data || !s ? !error && <p className="muted">Načítám…</p> : <div className="accounting-print">
      <div className="accounting-head"><h2>Podklady pro účetní: {monthText(data.month)}</h2>
        <p>{[data.salon.name, data.salon.owner, data.salon.businessId && 'IČO ' + data.salon.businessId, data.salon.address].filter(Boolean).join(' · ')}</p></div>
      <div className="accounting-grid">
        <section className="panel"><h3>Tržby podle platby</h3><table className="stats-table accounting-sum"><tbody>
          <tr><th scope="row">Hotově</th><td>{formatRevenue(s.byMethod.cash)}</td></tr>
          <tr><th scope="row">Kartou</th><td>{formatRevenue(s.byMethod.card)}</td></tr>
          <tr><th scope="row">QR platba / převod</th><td>{formatRevenue(s.byMethod.qr)}</td></tr>
          {s.byMethod.prepaid > 0 && <tr><th scope="row">Kauce zaplacené předem převodem</th><td>{formatRevenue(s.byMethod.prepaid)}</td></tr>}
          <tr className="total"><th scope="row">Tržby celkem</th><td>{formatRevenue(s.receivedCents)}</td></tr>
        </tbody></table>
          {s.voucherCoveredCents > 0 && <p className="muted-inline">Navíc {formatRevenue(s.voucherCoveredCents)} uhrazeno dárkovými poukazy. Tržba z nich se počítá už v měsíci prodeje poukazu.</p>}</section>
        <section className="panel"><h3>Tržby podle druhu</h3><table className="stats-table accounting-sum"><tbody>
          <tr><th scope="row">Ošetření</th><td>{formatRevenue(s.byKind.services)}</td></tr>
          <tr><th scope="row">Produkty</th><td>{formatRevenue(s.byKind.products)}</td></tr>
          <tr><th scope="row">Prodej dárkových poukazů</th><td>{formatRevenue(s.byKind.vouchers)}</td></tr>
          {s.byKind.other > 0 && <tr><th scope="row">Ostatní</th><td>{formatRevenue(s.byKind.other)}</td></tr>}
          <tr className="total"><th scope="row">Celkem</th><td>{formatRevenue(s.receivedCents)}</td></tr>
        </tbody></table>
          <p className="muted-inline">{plural(s.count, 'účtenka', 'účtenky', 'účtenek')}{s.cancelled > 0 && `, stornované: ${s.cancelled}`}{s.discountCents > 0 && `, slevy ${formatRevenue(s.discountCents)}`}.</p></section>
      </div>
      {(s.unpaid.count > 0 || data.deposits.length > 0) && <section className="panel accounting-notes"><h3>Na vědomí</h3><ul>
        {s.unpaid.count > 0 && <li>Zatím nezaplacené QR účtenky: {s.unpaid.count}, celkem {formatRevenue(s.unpaid.cents)}. V tržbách výše jsou započtené.</li>}
        {data.deposits.length > 0 && <li>Propadlé kauce (klientka nepřišla), příjem bez účtenky: {formatRevenue(s.forfeitedCents)} ({data.deposits.map(d => dateText(d.date)).join(', ')}).</li>}
      </ul></section>}
      <section className="panel"><h3>Účtenky</h3>{!data.receipts.length ? <p className="muted-inline">V tomto měsíci nejsou žádné účtenky.</p> : <div className="table-scroll"><table className="stats-table accounting-table">
        <thead><tr><th>Číslo</th><th>Datum</th><th>Platba</th><th className="num">Celkem</th><th className="num">Poukazem</th><th className="num">Kauce</th><th className="num">K úhradě</th></tr></thead>
        <tbody>{data.receipts.map(r => <tr key={r.number} className={r.status !== 'issued' ? 'cancelled' : ''}>
          <td>{r.number}</td><td>{dateText(r.issued)}</td><td>{r.status !== 'issued' ? 'storno' : (METHOD_TEXT[r.method] || r.method) + (!r.paid && r.dueCents > 0 ? ', nezaplaceno' : '')}</td>
          <td className="num">{formatRevenue(r.totalCents)}</td><td className="num">{r.voucherCents ? formatRevenue(r.voucherCents) : ''}</td><td className="num">{r.prepaidCents ? formatRevenue(r.prepaidCents) : ''}</td><td className="num">{formatRevenue(r.dueCents)}</td></tr>)}</tbody>
      </table></div>}</section>
    </div>}
  </div>;
}
