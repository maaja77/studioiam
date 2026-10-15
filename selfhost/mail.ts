// Jednoduché odesílání e-mailu přes SMTP s TLS (např. smtp.seznam.cz:465), bez dalších knihoven.
import tls from 'node:tls';

export type MailConfig = {host: string; port: number; user: string; pass: string; to: string; from: string};

export function mailConfig(): MailConfig | null {
  const {SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SALON_NOTIFY_EMAIL, SMTP_FROM} = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SALON_NOTIFY_EMAIL) return null;
  return {host: SMTP_HOST, port: Number(SMTP_PORT || 465), user: SMTP_USER, pass: SMTP_PASS, to: SALON_NOTIFY_EMAIL, from: SMTP_FROM || SMTP_USER};
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const clean = (s: string) => s.replace(/[\r\n<>]/g, '');

/** Odešle e-mail salonu, nebo zadanému příjemci (`to`), např. klientce s odkazem na její rezervaci. */
export function sendMail(config: MailConfig, subject: string, text: string, to = config.to): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({host: config.host, port: config.port, servername: config.host});
    const date = new Date().toUTCString();
    const message = [
      `From: Studio I AM <${clean(config.from)}>`, `To: <${clean(to)}>`, `Subject: =?UTF-8?B?${b64(subject)}?=`, `Date: ${date}`,
      `Message-ID: <${crypto.randomUUID()}@${clean(config.host)}>`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
      (b64(text).match(/.{1,76}/g) || []).join('\r\n'), '.',
    ].join('\r\n');
    const steps: [string | null, number][] = [
      [null, 220], [`EHLO ${clean(config.host)}`, 250], ['AUTH LOGIN', 334], [b64(config.user), 334], [b64(config.pass), 235],
      [`MAIL FROM:<${clean(config.from)}>`, 250], [`RCPT TO:<${clean(to)}>`, 250], ['DATA', 354], [message, 250], ['QUIT', 221],
    ];
    let step = 0, buffer = '';
    const fail = (e: Error) => { socket.destroy(); reject(e); };
    socket.setTimeout(20000, () => fail(new Error('SMTP timeout')));
    socket.on('error', fail);
    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\r\n'); buffer = lines.pop() || '';
      for (const line of lines) {
        if (!/^\d{3} /.test(line)) continue; // pokračovací řádky odpovědi (250-…)
        const code = Number(line.slice(0, 3)), expected = steps[step][1];
        if (code !== expected) return fail(new Error(`SMTP ${steps[step][0]?.split(' ')[0] || 'connect'}: ${line}`));
        step++;
        if (step >= steps.length) { socket.end(); return resolve(); }
        socket.write(steps[step][0] + '\r\n');
      }
    });
  });
}
