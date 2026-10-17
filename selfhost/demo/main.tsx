// Náhled kartotéky bez serveru: volání /api/* obslouží přímo skutečné API handlery
// nad ukázkovou databází v prohlížeči (viz runtime.ts).
import React from 'react';
import {createRoot} from 'react-dom/client';
import Home from '../../app/page';
import PublicBooking from '../../app/public-booking';
import PublicReceipt from '../../app/public-receipt';
import PublicIntake from '../../app/public-intake';
import PublicVoucher from '../../app/public-voucher';
import * as bookings from '../../app/api/bookings/route';
import * as publicApi from '../../app/api/public/route';
import * as receiptsApi from '../../app/api/receipts/route';
import * as statsApi from '../../app/api/stats/route';
import * as vouchersApi from '../../app/api/vouchers/route';
import * as intakeApi from '../../app/api/intake/route';
import * as lapsedApi from '../../app/api/lapsed/route';
import * as records from '../../app/api/records/route';
import * as photos from '../../app/api/photos/route';
import {env, resetDemo} from './runtime';
import {loginPage} from '../login-page';
import {LOGO} from './studio-logo';
import '../../app/globals.css';
import './demo.css';

// Prohlížeč náhledu nezobrazuje potvrzovací okna (confirm vrací false), v ukázce proto potvrzujeme automaticky.
window.confirm = () => true;

const realFetch = window.fetch.bind(window);
async function handle(url: URL, request: Request) {
  const m = request.method;
  if (url.pathname === '/api/records') return m === 'GET' ? records.GET() : records.POST(request);
  if (url.pathname === '/api/bookings') return m === 'GET' ? bookings.GET(request) : bookings.POST(request);
  if (url.pathname === '/api/receipts') return m === 'GET' ? receiptsApi.GET(request) : receiptsApi.POST(request);
  if (url.pathname === '/api/stats') return statsApi.GET(request);
  if (url.pathname === '/api/vouchers') return m === 'GET' ? vouchersApi.GET(request) : vouchersApi.POST(request);
  if (url.pathname === '/api/intake') return m === 'GET' ? intakeApi.GET(request) : intakeApi.POST(request);
  if (url.pathname === '/api/lapsed') return m === 'GET' ? lapsedApi.GET(request) : lapsedApi.POST(request);
  if (url.pathname === '/api/demo-logo') { const o = await env.BUCKET.get('branding/logo'); return o ? new Response(o.body as BodyInit, {headers: {'Content-Type': 'image/png'}}) : new Response(null, {status: 404}); }
  if (url.pathname === '/api/account') return Response.json({error: 'V ukázce se heslo nemění. Na serveru tu změníte heslo do administrace.'}, {status: 400});
  if (url.pathname === '/api/public') return m === 'GET' ? publicApi.GET(request) : publicApi.POST(request);
  if (url.pathname === '/api/photos') return m === 'GET' ? photos.GET(request) : m === 'POST' ? photos.POST(request) : photos.DELETE(request);
  return Response.json({error: 'Not found'}, {status: 404});
}
window.fetch = async (input, init) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!raw.startsWith('/api/')) return realFetch(input, init);
  const url = new URL(raw, location.origin);
  const request = new Request(url, init);
  const response = await handle(url, request);
  // Mírné zpoždění, ať se náhled chová jako skutečný server.
  await new Promise(r => setTimeout(r, 120));
  return response;
};

// Fotky se v aplikaci načítají přes <img src="/api/photos?id=…">; v náhledu je přesměrujeme na blob.
const blobs = new Map<string, string>();
async function swap(img: HTMLImageElement) {
  const src = img.getAttribute('src') || '';
  // Logo salonu vrací server na /logo.png; náhled server nemá, ukáže nahrané logo nebo logo Studia I AM.
  if (src.startsWith('/logo.png')) { const r = await window.fetch('/api/demo-logo'); img.setAttribute('src', r.ok ? URL.createObjectURL(await r.blob()) : LOGO); return; }
  if (!src.startsWith('/api/photos?id=')) return;
  let blob = blobs.get(src);
  if (!blob) { const r = await window.fetch(src); if (!r.ok) return; blob = URL.createObjectURL(await r.blob()); blobs.set(src, blob); }
  if (img.getAttribute('src') === src) img.setAttribute('src', blob);
}
new MutationObserver(list => {
  for (const m of list) {
    if (m.type === 'attributes' && m.target instanceof HTMLImageElement) swap(m.target);
    m.addedNodes.forEach(n => { if (n instanceof HTMLElement) (n instanceof HTMLImageElement ? [n] : Array.from(n.querySelectorAll('img'))).forEach(swap); });
  }
}).observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: ['src']});

type View = 'admin' | 'public' | 'voucher' | 'login';
function DemoBar({view, setView}: {view: View; setView: (v: View) => void}) {
  const [confirming, setConfirming] = React.useState(false), [mail, setMail] = React.useState<string[]>([]);
  React.useEffect(() => { const on = (e: Event) => setMail(list => [...list, (e as CustomEvent<string>).detail].slice(-3)); window.addEventListener('demo-mail', on); return () => window.removeEventListener('demo-mail', on); }, []);
  return (
    <div className="demo-bar" role="note">
      <span><strong>Ukázková verze</strong> s vymyšlenými klientkami. Změny se ukládají jen ve vašem prohlížeči.</span>
      <span className="demo-actions" role="group" aria-label="Pohled">
        <button type="button" aria-pressed={view === 'admin'} onClick={() => setView('admin')}>Administrace</button>
        <button type="button" aria-pressed={view === 'public'} onClick={() => setView('public')}>Rezervace pro klientky</button>
        <button type="button" aria-pressed={view === 'voucher'} onClick={() => setView('voucher')}>Nákup poukazu</button>
        <button type="button" aria-pressed={view === 'login'} onClick={() => setView('login')}>Přihlášení</button>
      </span>
      {confirming
        ? <span className="demo-actions"><button type="button" onClick={resetDemo}>Ano, obnovit</button><button type="button" onClick={() => setConfirming(false)}>Zpět</button></span>
        : <button type="button" onClick={() => setConfirming(true)}>Obnovit ukázková data</button>}
      {mail.length > 0 && <span className="demo-mail">Zpráva, která by se teď odeslala: {mail.map((m, i) => <b key={i}>{m.startsWith('e-mail klientce') || m.startsWith('SMS') ? m : 'e-mail do salonu: ' + m}</b>)} <button type="button" onClick={() => setMail([])}>Zavřít</button></span>}
    </div>
  );
}

// Přihlašovací stránku server posílá jako samostatné HTML; v náhledu ji ukážeme v rámu a přihlášení jen přepne na administraci.
function DemoLogin({onLogin}: {onLogin: () => void}) {
  const html = React.useMemo(() => loginPage({logo: LOGO, salon: 'STUDIO I AM', notice: 'Ukázka: zadejte cokoli a klikněte na Přihlásit se.'}), []);
  return <iframe className="demo-login" title="Přihlášení" srcDoc={html} onLoad={e => {
    const form = e.currentTarget.contentDocument?.querySelector('form');
    form?.addEventListener('submit', ev => { ev.preventDefault(); onLogin(); });
  }}/>;
}

function Demo() {
  const [view, setView] = React.useState<View>(() => location.hash === '#rezervace' ? 'public' : location.hash === '#poukaz' ? 'voucher' : location.hash === '#prihlaseni' ? 'login' : 'admin');
  // Odkaz na účtenku pro klientku v náhledu neotevře novou stránku, ale ukáže ji tady.
  const [receipt, setReceipt] = React.useState(''), [intake, setIntake] = React.useState(''), [order, setOrder] = React.useState('');
  React.useEffect(() => {
    const on = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.('a'), m = a?.href.match(/\/uctenka\?t=([0-9a-f-]{36})/), q = a?.href.match(/\/dotaznik\?t=([0-9a-f]{40})/), o = a?.href.match(/\/poukaz(?:\?t=([0-9a-f]{40}))?$/);
      if (m) { e.preventDefault(); setReceipt(m[1]); }
      if (q) { e.preventDefault(); setIntake(q[1]); window.scrollTo(0, 0); }
      if (o) { e.preventDefault(); if (o[1]) setOrder(o[1]); else setView('voucher'); window.scrollTo(0, 0); }
    };
    document.addEventListener('click', on, true); return () => document.removeEventListener('click', on, true);
  }, []);
  if (order) return <><div className="demo-bar" role="note"><span><strong>Ukázka:</strong> takhle objednávku poukazu uvidí kupující po otevření odkazu z e-mailu.</span><button type="button" onClick={() => setOrder('')}>Zpět</button></div><PublicVoucher key={order} token={order}/></>;
  if (intake) return <><div className="demo-bar" role="note"><span><strong>Ukázka:</strong> takhle dotazník uvidí klientka po otevření odkazu (v telefonu nebo na tabletu v salonu).</span><button type="button" onClick={() => setIntake('')}>Zpět</button></div><PublicIntake token={intake}/></>;
  if (receipt) return <><div className="demo-bar" role="note"><span><strong>Ukázka:</strong> takhle účtenku uvidí klientka po otevření odkazu.</span><button type="button" onClick={() => setReceipt('')}>Zpět do administrace</button></div><PublicReceipt token={receipt}/></>;
  return <><DemoBar view={view} setView={setView}/>{view === 'admin' ? <Home onLogout={() => setView('login')}/> : view === 'login' ? <DemoLogin onLogin={() => setView('admin')}/> : view === 'voucher' ? <PublicVoucher token=""/> : <PublicBooking/>}</>;
}

createRoot(document.getElementById('root')!).render(<Demo/>);
