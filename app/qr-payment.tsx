'use client';
import qrcode from 'qrcode-generator';
import {formatRevenue} from '../lib/revenue';

export type DepositInfo = {amountCents: number; due: string; vs: string; iban: string; account: string; recipient: string; qr: string};

/** QR kód platby (SPD) vykreslený jako SVG, bez externích služeb. */
export function QrCode({payload, size = 200, label}: {payload: string; size?: number; label: string}) {
  const qr = qrcode(0, 'M'); qr.addData(payload); qr.make();
  const n = qr.getModuleCount(), cells: string[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) cells.push(`M${c + 4} ${r + 4}h1v1h-1z`);
  return <svg className="qr-code" role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${n + 8} ${n + 8}`} shapeRendering="crispEdges">
    <rect width={n + 8} height={n + 8} fill="#fff"/><path d={cells.join('')} fill="#000"/>
  </svg>;
}

export function PaymentDetails({deposit, title = 'Kauce'}: {deposit: DepositInfo; title?: string}) {
  return <div className="payment">
    <QrCode payload={deposit.qr} label={`QR platba ${formatRevenue(deposit.amountCents)}`}/>
    <dl>
      <div><dt>{title}</dt><dd><b>{formatRevenue(deposit.amountCents)}</b></dd></div>
      <div><dt>Účet</dt><dd>{deposit.account}</dd></div>
      <div><dt>Variabilní symbol</dt><dd>{deposit.vs}</dd></div>
      <div><dt>Zaplatit do</dt><dd>{new Date(deposit.due + ':00').toLocaleString('cs-CZ', {day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit'})}</dd></div>
    </dl>
  </div>;
}
