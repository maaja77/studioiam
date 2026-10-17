// Náhled kartotéky bez serveru: volání /api/* obslouží přímo skutečné API handlery
// nad ukázkovou databází v prohlížeči (viz runtime.ts).
import React from 'react';
import {createRoot} from 'react-dom/client';
import Home from '../../app/page';
import PublicBooking from '../../app/public-booking';
import PublicReceipt from '../../app/public-receipt';
import * as bookings from '../../app/api/bookings/route';
import * as publicApi from '../../app/api/public/route';
import * as receiptsApi from '../../app/api/receipts/route';
import * as statsApi from '../../app/api/stats/route';
import * as records from '../../app/api/records/route';
import * as photos from '../../app/api/photos/route';
import {resetDemo} from './runtime';
import {loginPage} from '../login-page';
import {LOGO} from '../../app/logo';
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

type View = 'admin' | 'public' | 'login';
function DemoBar({view, setView}: {view: View; setView: (v: View) => void}) {
  const [confirming, setConfirming] = React.useState(false), [mail, setMail] = React.useState<string[]>([]);
  React.useEffect(() => { const on = (e: Event) => setMail(list => [...list, (e as CustomEvent<string>).detail].slice(-3)); window.addEventListener('demo-mail', on); return () => window.removeEventListener('demo-mail', on); }, []);
  return (
    <div className="demo-bar" role="note">
      <span><strong>Ukázková verze</strong> s vymyšlenými klientkami. Změny se ukládají jen ve vašem prohlížeči.</span>
      <span className="demo-actions" role="group" aria-label="Pohled">
        <button type="button" aria-pressed={view === 'admin'} onClick={() => setView('admin')}>Administrace</button>
        <button type="button" aria-pressed={view === 'public'} onClick={() => setView('public')}>Rezervace pro klientky</button>
        <button type="button" aria-pressed={view === 'login'} onClick={() => setView('login')}>Přihlášení</button>
      </span>
      {confirming
        ? <span className="demo-actions"><button type="button" onClick={resetDemo}>Ano, obnovit</button><button type="button" onClick={() => setConfirming(false)}>Zpět</button></span>
        : <button type="button" onClick={() => setConfirming(true)}>Obnovit ukázková data</button>}
      {mail.length > 0 && <span className="demo-mail">E-mail, který by se teď odeslal: {mail.map((m, i) => <b key={i}>{m.startsWith('klientce') ? m : 'do salonu: ' + m}</b>)} <button type="button" onClick={() => setMail([])}>Zavřít</button></span>}
    </div>
  );
}

// Přihlašovací stránku server posílá jako samostatné HTML; v náhledu ji ukážeme v rámu a přihlášení jen přepne na administraci.
function DemoLogin({onLogin}: {onLogin: () => void}) {
  const html = React.useMemo(() => loginPage({logo: LOGO, notice: 'Ukázka: zadejte cokoli a klikněte na Přihlásit se.'}), []);
  return <iframe className="demo-login" title="Přihlášení" srcDoc={html} onLoad={e => {
    const form = e.currentTarget.contentDocument?.querySelector('form');
    form?.addEventListener('submit', ev => { ev.preventDefault(); onLogin(); });
  }}/>;
}

function Demo() {
  const [view, setView] = React.useState<View>(() => location.hash === '#rezervace' ? 'public' : location.hash === '#prihlaseni' ? 'login' : 'admin');
  // Odkaz na účtenku pro klientku v náhledu neotevře novou stránku, ale ukáže ji tady.
  const [receipt, setReceipt] = React.useState('');
  React.useEffect(() => {
    const on = (e: MouseEvent) => { const a = (e.target as HTMLElement).closest?.('a'); const m = a?.href.match(/\/uctenka\?t=([0-9a-f-]{36})/); if (m) { e.preventDefault(); setReceipt(m[1]); } };
    document.addEventListener('click', on, true); return () => document.removeEventListener('click', on, true);
  }, []);
  if (receipt) return <><div className="demo-bar" role="note"><span><strong>Ukázka:</strong> takhle účtenku uvidí klientka po otevření odkazu.</span><button type="button" onClick={() => setReceipt('')}>Zpět do administrace</button></div><PublicReceipt token={receipt}/></>;
  return <><DemoBar view={view} setView={setView}/>{view === 'admin' ? <Home onLogout={() => setView('login')}/> : view === 'login' ? <DemoLogin onLogin={() => setView('admin')}/> : <PublicBooking/>}</>;
}

createRoot(document.getElementById('root')!).render(<Demo/>);
