// Odesílání SMS přes bránu nastavenou v .env.selfhost:
//   SMS_PROVIDER=smsbrana  (smsbrana.cz, SMS Connect: SMSBRANA_LOGIN, SMSBRANA_PASSWORD)
//   SMS_PROVIDER=smsgate   (aplikace SMS Gateway for Android v telefonu salonu: SMSGATE_USER, SMSGATE_PASSWORD, volitelně SMSGATE_URL)
import {createHash, randomBytes} from 'node:crypto';

export type SendSms = (phone: string, text: string) => Promise<void>;
const SMSBRANA_ERRORS: Record<string, string> = {
  '2': 'špatné přihlašovací jméno nebo heslo', '3': 'špatné přihlašovací jméno nebo heslo', '4': 'nesouhlasí čas serveru',
  '5': 'IP adresa serveru není povolená v nastavení SMS Connect', '9': 'došel kredit', '10': 'neplatné číslo příjemce', '11': 'prázdný text',
};

export function smsConfig(): {name: string; send: SendSms} | null {
  const e = process.env;
  if (e.SMS_PROVIDER === 'smsbrana' && e.SMSBRANA_LOGIN && e.SMSBRANA_PASSWORD) {
    const login = e.SMSBRANA_LOGIN, password = e.SMSBRANA_PASSWORD;
    return {name: 'SMS brána (smsbrana.cz)', async send(phone, text) {
      const time = new Date().toISOString().replace(/\.\d+Z$/, '+00:00'), sul = randomBytes(5).toString('hex');
      const query = new URLSearchParams({action: 'send_sms', login, time, sul, hash: createHash('md5').update(password + time + sul).digest('hex'),
        number: phone.replace(/^\+/, ''), message: text, delivery_report: '0'});
      const r = await fetch('https://api.smsbrana.cz/smsconnect/http.php?' + query, {signal: AbortSignal.timeout(20_000)}).catch(() => { throw new Error('SMS brána není dostupná, zkuste to později.'); });
      const body = await r.text(), err = /<err>(\d+)<\/err>/.exec(body)?.[1];
      if (!r.ok || err === undefined) throw new Error(`SMS brána neodpověděla (HTTP ${r.status}).`);
      if (err !== '0') throw new Error(`SMS brána odmítla zprávu: ${SMSBRANA_ERRORS[err] || 'chyba ' + err}.`);
    }};
  }
  if (e.SMS_PROVIDER === 'smsgate' && e.SMSGATE_USER && e.SMSGATE_PASSWORD) {
    const url = (e.SMSGATE_URL || 'https://api.sms-gate.app/3rdparty/v1').replace(/\/$/, '') + '/messages';
    const auth = 'Basic ' + Buffer.from(`${e.SMSGATE_USER}:${e.SMSGATE_PASSWORD}`).toString('base64');
    return {name: 'telefon salonu (SMS Gateway for Android)', async send(phone, text) {
      const r = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: auth},
        body: JSON.stringify({textMessage: {text}, phoneNumbers: [phone], ttl: 6 * 3600}), signal: AbortSignal.timeout(20_000)})
        .catch(() => { throw new Error('Telefon s SMS Gateway není dostupný (služba neodpovídá).'); });
      if (r.status === 401) throw new Error('Telefon s SMS Gateway odmítl přihlášení (zkontrolujte SMSGATE_USER a SMSGATE_PASSWORD).');
      if (!r.ok) throw new Error(`Telefon s SMS Gateway zprávu nepřijal (HTTP ${r.status}).`);
    }};
  }
  if (e.SMS_PROVIDER) console.log(`SMS nejsou nastavené: pro SMS_PROVIDER=${e.SMS_PROVIDER} chybí přihlašovací údaje.`);
  return null;
}
