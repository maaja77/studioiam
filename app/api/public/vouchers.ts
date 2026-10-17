// Prodej dárkových poukazů na webu: kupující vybere částku nebo ošetření, zaplatí QR platbou
// a po potvrzení platby salonem dostane odkaz na poukaz k vytištění. Kód poukazu se ukáže až po zaplacení.
import {database, notifyClient, notifySalon} from '../../../db/raw';
import {addDays, normalizePhone, parseSettings, salonName, salonNow, type BookingSettings} from '../../../lib/booking';
import {formatRevenue} from '../../../lib/revenue';
import {czIban, formatIban, spdPayload} from '../../../lib/payment';
import {addMonths, parseAmounts, VOUCHER_PAY_DAYS, voucherState} from '../../../lib/vouchers';
import {uniqueVoucherCode} from '../vouchers/route';
import {salonInfo} from './route';

const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
const dateText = (s: string) => s.split('-').reverse().map(Number).join('. ');
const NOT_FOUND = 'Objednávka poukazu nebyla nalezena. Zkontrolujte prosím odkaz nebo nám zavolejte.';
type Offer = {id: string; name: string; priceCents: number; category: string};

async function context() {
  const db = database();
  const s = parseSettings((await db.prepare("SELECT value FROM settings WHERE key='booking'").first<{value: string}>())?.value);
  const services = s.voucherServices ? (await db.prepare('SELECT id,name,price_cents AS priceCents,category FROM services WHERE active=1 AND price_cents>0 ORDER BY sort,name').all<Offer>()).results : [];
  return {db, s, services, open: s.voucherOnline && !!czIban(s.account)};
}

/** Nabídka poukazů pro stránku /poukaz. */
export async function shopGet() {
  const {s, services, open} = await context();
  if (!open) return json({available: false, salon: salonInfo(s)});
  return json({available: true, amounts: parseAmounts(s.voucherAmounts), minKc: s.voucherMinKc, services, months: s.voucherMonths, salon: salonInfo(s)});
}

function payment(s: BookingSettings, amountCents: number, vs: string, payDue: string) {
  const iban = czIban(s.account)!;
  return {amountCents, due: payDue + 'T23:59', vs, kind: 'prepay' as const, iban: formatIban(iban), account: s.account, recipient: s.accountName,
    qr: spdPayload({iban, amountCents, vs, message: 'Darkovy poukaz', recipient: s.accountName})};
}

type Order = {id: string; code: string; kind: string; serviceName: string; valueCents: number; balanceCents: number; recipientName: string; buyerName: string;
  validUntil: string; status: string; vs: string | null; payDue: string | null; delivery: string};

/** Stav objednávky přes tajný odkaz: před zaplacením platební údaje, po zaplacení poukaz k tisku. */
export async function orderGet(token: string) {
  if (!/^[0-9a-f]{40}$/.test(token)) return json({error: NOT_FOUND}, 404);
  const db = database(), s = parseSettings((await db.prepare("SELECT value FROM settings WHERE key='booking'").first<{value: string}>())?.value);
  const v = await db.prepare('SELECT id,code,kind,service_name AS serviceName,value_cents AS valueCents,balance_cents AS balanceCents,recipient_name AS recipientName,buyer_name AS buyerName,valid_until AS validUntil,status,vs,pay_due AS payDue,delivery FROM vouchers WHERE token=?').bind(token).first<Order>();
  if (!v) return json({error: NOT_FOUND}, 404);
  const salon = {...salonInfo(s), businessName: s.businessName}, base = {kind: v.kind, serviceName: v.serviceName, valueCents: v.valueCents, recipientName: v.recipientName, delivery: v.delivery, salon};
  if (v.status === 'cancelled') return json({order: {...base, state: 'cancelled'}});
  if (v.status === 'pending') return json({order: {...base, state: 'pending', payment: czIban(s.account) && v.vs && v.payDue ? payment(s, v.valueCents, v.vs, v.payDue) : null}});
  return json({order: {...base, state: voucherState(v, salonNow().slice(0, 10)), code: v.code, validUntil: v.validUntil}});
}

export async function orderSubmit(d: Record<string, unknown>, origin: string) {
  const text = (k: string, max: number) => typeof d[k] === 'string' ? (d[k] as string).trim().slice(0, max) : '';
  if (text('website', 200)) return json({ok: true}); // past na roboty
  const {db, s, services, open} = await context();
  if (!open) return json({error: 'Prodej poukazů přes web teď není k dispozici. Zavolejte nám prosím.'}, 403);
  const buyerName = text('buyerName', 120), email = text('email', 200), phone = text('phone', 40), recipientName = text('recipientName', 60);
  const delivery = d.delivery === 'pickup' ? 'pickup' : 'email';
  let kind: 'value' | 'service' = 'value', serviceName = '', valueCents = 0;
  if (d.kind === 'service') {
    const service = services.find(x => x.id === text('serviceId', 100));
    if (!service) return json({error: 'Vyberte prosím ošetření z nabídky.'}, 400);
    kind = 'service'; serviceName = service.name; valueCents = service.priceCents;
  } else {
    const kc = Number(text('amount', 12).replace(/\s|kč/gi, '').replace(',', '.'));
    if (!Number.isInteger(kc) || kc > 100000 || !(parseAmounts(s.voucherAmounts).includes(kc) || (s.voucherMinKc > 0 && kc >= s.voucherMinKc)))
      return json({error: s.voucherMinKc > 0 ? `Zadejte prosím částku v celých korunách, nejméně ${formatRevenue(s.voucherMinKc * 100)}.` : 'Vyberte prosím jednu z nabízených částek.'}, 400);
    valueCents = kc * 100;
  }
  if (!buyerName) return json({error: 'Vyplňte prosím své jméno.'}, 400);
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)) return json({error: 'Vyplňte prosím e-mail, pošleme na něj platební údaje a poukaz.'}, 400);
  if (phone && normalizePhone(phone).length < 9) return json({error: 'Zkontrolujte prosím telefon.'}, 400);
  if (d.consent !== true) return json({error: 'Pro objednávku je potřeba souhlas se zpracováním osobních údajů.'}, 400);

  const today = salonNow().slice(0, 10), payDue = addDays(today, VOUCHER_PAY_DAYS), code = await uniqueVoucherCode(db);
  let vs = '';
  for (let i = 0; i < 10 && !vs; i++) { const c = '9' + today.slice(2).replace(/-/g, '') + String(Math.floor(Math.random() * 1000)).padStart(3, '0'); if (!await db.prepare('SELECT 1 FROM vouchers WHERE vs=?').bind(c).first()) vs = c; }
  const token = Array.from(crypto.getRandomValues(new Uint8Array(20)), b => b.toString(16).padStart(2, '0')).join(''), id = crypto.randomUUID();
  await db.prepare('INSERT INTO vouchers (id,code,kind,service_name,value_cents,balance_cents,buyer_name,buyer_contact,recipient_name,note,issued,valid_until,status,receipt_id,source,buyer_email,delivery,vs,pay_due,token,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, code, kind, serviceName, valueCents, valueCents, buyerName, [phone, email].filter(Boolean).join(', '), recipientName, text('note', 300), today, addMonths(today, s.voucherMonths), 'pending', null, 'online', email, delivery, vs, payDue, token, new Date().toISOString()).run();

  const what = kind === 'service' ? `na ošetření ${serviceName} (${formatRevenue(valueCents)})` : `v hodnotě ${formatRevenue(valueCents)}`, link = `${origin}/poukaz?t=${token}`;
  notifySalon(`Objednávka poukazu: ${buyerName}, ${formatRevenue(valueCents)}`, [
    `Nová objednávka dárkového poukazu přes web (${salonName(s)})`, '', `Poukaz: ${what}`, recipientName ? `Pro: ${recipientName}` : '',
    `Kupující: ${buyerName}, ${[phone, email].filter(Boolean).join(', ')}`, `Předání: ${delivery === 'pickup' ? 'vyzvedne si tištěný poukaz v salonu' : 'e-mailem k vytištění'}`,
    text('note', 300) ? `Poznámka: ${text('note', 300)}` : '', '',
    `Platba ${formatRevenue(valueCents)} na účet ${s.account}, VS ${vs}, do ${dateText(payDue)}.`,
    'Až platba dorazí, potvrďte ji v administraci v části Poukazy (Platba přišla). Kupující pak dostane poukaz e-mailem.',
  ].filter(Boolean).join('\n'));
  notifyClient(email, `Objednávka dárkového poukazu – ${salonName(s)}`, [
    'Dobrý den,', '', `děkujeme za objednávku dárkového poukazu ${what}${recipientName ? ' pro ' + recipientName : ''}.`, '',
    `Zaplaťte prosím ${formatRevenue(valueCents)} na účet ${s.account}, variabilní symbol ${vs}, nejpozději ${dateText(payDue)}.`,
    `QR kód pro platbu a stav objednávky najdete zde: ${link}`, '',
    `Jakmile platba dorazí, pošleme Vám poukaz e-mailem${delivery === 'pickup' ? ' a tištěný připravíme v salonu' : ''}. Poukaz platí ${s.voucherMonths} ${s.voucherMonths === 1 ? 'měsíc' : s.voucherMonths <= 4 ? 'měsíce' : 'měsíců'} od zaplacení.`, '',
    `Děkujeme, ${salonName(s)}`,
  ].join('\n'));
  return json({ok: true, token, payment: payment(s, valueCents, vs, payDue)});
}
