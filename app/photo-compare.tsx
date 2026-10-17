'use client';
// Porovnání před/po: aplikace sama vybere nejstarší a nejnovější fotku, ukáže je vedle sebe nebo s posuvníkem
// a z obou udělá koláž ke stažení nebo sdílení (bez jména klientky).
import {useEffect, useRef, useState} from 'react';
import {Columns2, Download, Share2, SlidersHorizontal, X} from 'lucide-react';

export type ComparePhoto = {id: string; date: string; caption: string};
const dateLabel = (s: string) => s.split('-').reverse().map(Number).join('. ');
const photoUrl = (p: ComparePhoto) => '/api/photos?id=' + encodeURIComponent(p.id);

/** Doba mezi fotkami lidsky: „po 3 týdnech“, „po 2 měsících“. */
export function gapText(from: string, to: string) {
  const days = Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000);
  if (days <= 0) return 'stejný den';
  if (days < 14) return `po ${days} ${days === 1 ? 'dni' : 'dnech'}`;
  if (days < 61) { const w = Math.round(days / 7); return `po ${w} týdnech`; }
  const m = Math.round(days / 30.4);
  return m < 12 ? `po ${m} měsících` : m < 24 ? 'po více než roce' : `po ${Math.floor(m / 12)} letech`;
}

/** Fotky se stahují přes fetch (v náhledu je obsluhuje ukázková databáze) a zobrazují jako blob. */
function useBlobUrl(photo: ComparePhoto | undefined) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (!photo) return;
    let url = '', alive = true;
    fetch(photoUrl(photo)).then(r => r.ok ? r.blob() : Promise.reject()).then(b => { url = URL.createObjectURL(b); if (alive) setSrc(url); else URL.revokeObjectURL(url); }).catch(() => { if (alive) setSrc(''); });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [photo]);
  return src;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
}

/** Koláž 2 × 4:5 vedle sebe se štítky PŘED/PO a patičkou se jménem salonu. */
async function collage(before: string, after: string, labels: [string, string], footer: string) {
  const [a, b] = await Promise.all([loadImage(before), loadImage(after)]);
  const W = 1000, H = 1250, gap = 16, foot = 110, canvas = document.createElement('canvas');
  canvas.width = W * 2 + gap; canvas.height = H + foot;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  [a, b].forEach((img, i) => {
    // Oříznutí na střed, aby obě fotky měly stejný formát.
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight), sw = W / scale, sh = H / scale;
    const x = i * (W + gap);
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, 0, W, H);
    ctx.font = '600 44px Arial, Helvetica, sans-serif';
    const text = labels[i], tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(18,107,102,0.88)';
    ctx.beginPath(); ctx.roundRect(x + 32, H - 104, tw + 56, 72, 36); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + 60, H - 67);
  });
  ctx.fillStyle = '#243638'; ctx.font = '40px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(footer, canvas.width / 2, H + foot / 2);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Koláž se nepodařilo vytvořit.')), 'image/jpeg', 0.9));
}

export default function PhotoCompare({photos, salonName, onClose}: {photos: ComparePhoto[]; salonName: string; onClose: () => void}) {
  // Automatický výběr: nejstarší fotka jako „před“, nejnovější jako „po“.
  const sorted = [...photos].sort((x, y) => x.date.localeCompare(y.date));
  const [beforeId, setBeforeId] = useState(sorted[0]?.id), [afterId, setAfterId] = useState(sorted[sorted.length - 1]?.id);
  const [mode, setMode] = useState<'side' | 'slider'>('side'), [split, setSplit] = useState(50), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const before = sorted.find(p => p.id === beforeId), after = sorted.find(p => p.id === afterId);
  const beforeSrc = useBlobUrl(before), afterSrc = useBlobUrl(after);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const labels: [string, string] = [`PŘED · ${before ? dateLabel(before.date) : ''}`, `PO · ${after ? dateLabel(after.date) : ''}`];
  const footer = [salonName, before && after && gapText(before.date, after.date)].filter(Boolean).join(' · ');
  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare;

  async function make(action: 'download' | 'share') {
    if (!beforeSrc || !afterSrc) return;
    setBusy(true); setError('');
    try {
      const blob = await collage(beforeSrc, afterSrc, labels, footer);
      const name = `pred-po-${after?.date || ''}.jpg`, file = new File([blob], name, {type: 'image/jpeg'});
      if (action === 'share' && navigator.canShare?.({files: [file]})) { await navigator.share({files: [file], title: 'Před a po'}).catch(() => {}); return; }
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) { setError((e as Error).message || 'Koláž se nepodařilo vytvořit.'); } finally { setBusy(false); }
  }

  const option = (p: ComparePhoto) => <option key={p.id} value={p.id}>{dateLabel(p.date)}{p.caption ? ' · ' + p.caption.slice(0, 40) : ''}</option>;
  return <dialog ref={dialog} className="photo-compare" onCancel={onClose} onClose={onClose}>
    <div className="dialog-header"><div><p className="eyebrow">POROVNÁNÍ</p><h2>Před a po</h2></div><button aria-label="Zavřít porovnání" onClick={onClose}><X size={21}/></button></div>
    <div className="compare-body">
      <div className="compare-pick">
        <label className="field"><span>Před</span><select value={beforeId} onChange={e => setBeforeId(e.target.value)}>{sorted.map(option)}</select></label>
        <label className="field"><span>Po</span><select value={afterId} onChange={e => setAfterId(e.target.value)}>{sorted.map(option)}</select></label>
        <span className="segmented-mini" role="radiogroup" aria-label="Zobrazení">
          <button type="button" role="radio" aria-checked={mode === 'side'} className={mode === 'side' ? 'active' : ''} onClick={() => setMode('side')}><Columns2 size={15}/> Vedle sebe</button>
          <button type="button" role="radio" aria-checked={mode === 'slider'} className={mode === 'slider' ? 'active' : ''} onClick={() => setMode('slider')}><SlidersHorizontal size={15}/> Posuvník</button>
        </span>
      </div>
      {mode === 'side' ? <div className="compare-side">
        {[[beforeSrc, labels[0]], [afterSrc, labels[1]]].map(([src, label]) => <figure key={label}>{src ? <img src={src} alt={label}/> : <div className="compare-loading">Načítám…</div>}<figcaption>{label}</figcaption></figure>)}
      </div> : <div className="compare-slider">
        {afterSrc && <img src={afterSrc} alt={labels[1]}/>}
        {beforeSrc && <img src={beforeSrc} alt={labels[0]} className="compare-top" style={{clipPath: `inset(0 ${100 - split}% 0 0)`}}/>}
        <span className="compare-line" style={{left: split + '%'}}/>
        <span className="compare-tag left">{labels[0]}</span><span className="compare-tag right">{labels[1]}</span>
        <input type="range" min={0} max={100} value={split} aria-label="Posun mezi fotkou před a po" onChange={e => setSplit(Number(e.target.value))}/>
      </div>}
      <p className="compare-gap">{footer}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="muted-inline">Koláž je bez jména klientky. Na web nebo sociální sítě ji dávejte jen s jejím výslovným souhlasem.</p>
    </div>
    <div className="dialog-footer">
      {canShare && <button className="secondary" disabled={busy || !beforeSrc || !afterSrc} onClick={() => make('share')}><Share2 size={16}/> Sdílet</button>}
      <button className="primary" disabled={busy || !beforeSrc || !afterSrc} onClick={() => make('download')}><Download size={16}/> {busy ? 'Připravuji…' : 'Stáhnout koláž'}</button>
    </div>
  </dialog>;
}
