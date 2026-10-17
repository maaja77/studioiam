'use client';
// Dárkový poukaz k tisku nebo uložení do PDF; používá ho administrace i stránka pro kupující.
import {formatRevenue} from '../lib/revenue';
import {salonName, type BookingSettings} from '../lib/booking';
import type {Voucher} from '../lib/vouchers';
import {logoSrc} from './logo';

const dateText = (s: string) => s.split('-').reverse().map(Number).join('. ');
type CardSettings = Pick<BookingSettings, 'businessName' | 'businessAddress' | 'businessPhone' | 'logoVersion'>;

/** Poukaz k tisku nebo uložení do PDF (formát A6 na šířku). */
export function VoucherCard({voucher, settings}: {voucher: Pick<Voucher, 'kind' | 'serviceName' | 'valueCents' | 'recipientName' | 'code' | 'validUntil'>; settings: CardSettings}) {
  return <article className="voucher-card">
    <img src={logoSrc(settings.logoVersion)} alt="" width={64} height={64}/>
    <p className="voucher-salon">{salonName(settings)}</p>
    <h3>Dárkový poukaz</h3>
    <p className="voucher-value">{voucher.kind === 'service' ? <>na ošetření<br/><b>{voucher.serviceName}</b></> : <>v hodnotě <b>{formatRevenue(voucher.valueCents)}</b></>}</p>
    {voucher.recipientName && <p className="voucher-for">pro <b>{voucher.recipientName}</b></p>}
    <p className="voucher-meta"><span>Kód <b>{voucher.code}</b></span><span>Platí do <b>{dateText(voucher.validUntil)}</b></span></p>
    <p className="voucher-contact">{[settings.businessAddress, settings.businessPhone && 'tel. ' + settings.businessPhone].filter(Boolean).join(' · ')}</p>
  </article>;
}
