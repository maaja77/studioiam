// Náhled kartotéky bez serveru: volání /api/* obslouží přímo skutečné API handlery
// nad ukázkovou databází v prohlížeči (viz runtime.ts).
import React from 'react';
import {createRoot} from 'react-dom/client';
import Home from '../../app/page';
import * as records from '../../app/api/records/route';
import * as photos from '../../app/api/photos/route';
import {resetDemo} from './runtime';
import '../../app/globals.css';
import './demo.css';

const realFetch = window.fetch.bind(window);
async function handle(url: URL, request: Request) {
  const m = request.method;
  if (url.pathname === '/api/records') return m === 'GET' ? records.GET() : records.POST(request);
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

function DemoBar() {
  const [confirming, setConfirming] = React.useState(false);
  return (
    <div className="demo-bar" role="note">
      <span><strong>Ukázková verze</strong> s vymyšlenými klientkami. Změny se ukládají jen ve vašem prohlížeči.</span>
      {confirming
        ? <span className="demo-actions"><button type="button" onClick={resetDemo}>Ano, obnovit</button><button type="button" onClick={() => setConfirming(false)}>Zpět</button></span>
        : <button type="button" onClick={() => setConfirming(true)}>Obnovit ukázková data</button>}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<><DemoBar/><Home/></>);
