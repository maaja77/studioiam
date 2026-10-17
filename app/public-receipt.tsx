'use client';
// Účtenka pro klientku přes odkaz z e-mailu nebo SMS: QR platba a platební údaje ke zkopírování.
import {useEffect, useState} from 'react';
import {Copy, Printer} from 'lucide-react';
import {DEFAULT_SETTINGS, type BookingSettings} from '../lib/booking';
import {formatRevenue} from '../lib/revenue';
import {ReceiptPaper, type Receipt} from './receipts';

export default function PublicReceipt({token}: {token: string}) {
  const [data, setData] = useState<{receipt: Receipt; settings: BookingSettings} | null>(null), [error, setError] = useState(''), [copied, setCopied] = useState('');
  useEffect(() => {
    fetch('/api/public?receipt=' + encodeURIComponent(token), {cache: 'no-store'}).then(async r => {
      const d = await r.json() as {receipt?: Receipt; settings?: Partial<BookingSettings>; error?: string};
      if (!r.ok || !d.receipt) throw new Error(d.error || 'Účtenku se nepodařilo načíst.');
      setData({receipt: d.receipt, settings: {...DEFAULT_SETTINGS, ...d.settings}});
    }).catch(e => setError((e as Error).message));
  }, [token]);
  const copy = (label: string, value: string) => navigator.clipboard?.writeText(value).then(() => setCopied(label), () => {});
  const r = data?.receipt, toPay = !!r && r.status === 'issued' && r.dueCents > 0 && !r.paid;
  return <main className="public-receipt">
    {error ? <p className="error" role="alert">{error}</p> : !data || !r ? <p className="muted">Načítám účtenku…</p> : <>
      {toPay && <section className="pay-box">
        <h1>K zaplacení {formatRevenue(r.dueCents)}</h1>
        <p>Naskenujte QR kód na účtence v bankovní aplikaci, nebo zadejte platbu ručně:</p>
        <dl>
          <div><dt>Účet</dt><dd>{data.settings.account}</dd><button type="button" className="secondary" onClick={() => copy('účet', data.settings.account)}><Copy size={15}/> Kopírovat</button></div>
          <div><dt>Variabilní symbol</dt><dd>{r.vs}</dd><button type="button" className="secondary" onClick={() => copy('VS', r.vs)}><Copy size={15}/> Kopírovat</button></div>
          <div><dt>Částka</dt><dd>{formatRevenue(r.dueCents)}</dd><button type="button" className="secondary" onClick={() => copy('částka', String(r.dueCents / 100).replace('.', ','))}><Copy size={15}/> Kopírovat</button></div>
        </dl>
        {copied && <p className="notice" role="status">Zkopírováno: {copied}</p>}
      </section>}
      <ReceiptPaper receipt={r} settings={data.settings}/>
      <p className="public-receipt-actions"><button type="button" className="secondary" onClick={() => window.print()}><Printer size={16}/> Vytisknout / uložit PDF</button></p>
    </>}
  </main>;
}
