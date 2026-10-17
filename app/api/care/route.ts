// Domácí péče po návštěvě: salon napíše doporučení a vybere produkty, klientka dostane tajný odkaz (SMS nebo e-mail).
// Do zprávy ani na stránku se nedávají údaje z dotazníku ani poznámky z karty, jen to, co salon napíše sem.
import {database, mailEnabled, notifyClient, publicOrigin} from '../../../db/raw';
import {parseSettings, salonName} from '../../../lib/booking';
import {careSms, DEFAULT_CARE_TEXT, type CareProduct} from '../../../lib/care';
import {formatRevenue} from '../../../lib/revenue';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
type DB = ReturnType<typeof database>;
type Note = {id: string; token: string; text: string; products: string; sentAt: string | null; sentVia: string};
type Visit = {id: string; clientId: string; date: string; treatment: string; name: string; phone: string; email: string};

const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), b => b.toString(16).padStart(2, '0')).join('');
export const careLink = (origin: string, token: string) => `${publicOrigin(origin)}/pece?t=${token}`;
const dateText = (s: string) => s.split('-').reverse().map(Number).join('. ');

const visitOf = (db: DB, id: string) => db.prepare('SELECT v.id,v.client_id AS clientId,v.date,v.treatment,c.name,c.phone,c.email FROM visits v JOIN clients c ON c.id=v.client_id WHERE v.id=?').bind(id).first<Visit>();
const noteOf = (db: DB, visitId: string) => db.prepare('SELECT id,token,text,products,sent_at AS sentAt,sent_via AS sentVia FROM care_notes WHERE visit_id=?').bind(visitId).first<Note>();
const settingsOf = async (db: DB) => parseSettings((await db.prepare("SELECT value FROM settings WHERE key='booking'").first<{value: string}>())?.value);

export async function GET(request: Request) {
  try {
    const db = database(), origin = new URL(request.url).origin, visitId = new URL(request.url).searchParams.get('visitId') || '';
    const visit = await visitOf(db, visitId);
    if (!visit) return json({error: 'Návštěva nebyla nalezena.'}, 404);
    const [note, products, used, previous] = await Promise.all([
      noteOf(db, visitId),
      db.prepare('SELECT id,name,price_cents AS priceCents FROM products WHERE active=1 ORDER BY sort,name').all<{id: string; name: string; priceCents: number}>(),
      db.prepare('SELECT product_id AS productId FROM visit_products WHERE visit_id=? AND product_id IS NOT NULL').bind(visitId).all<{productId: string}>(),
      // Text naposledy poslaný ke stejnému ošetření se nabídne znovu, ať se nemusí psát pokaždé.
      db.prepare('SELECT n.text,n.products FROM care_notes n JOIN visits v ON v.id=n.visit_id WHERE lower(v.treatment)=lower(?) AND n.visit_id<>? ORDER BY n.created DESC LIMIT 1').bind(visit.treatment, visitId).first<{text: string; products: string}>(),
    ]);
    const chosen = note ? (JSON.parse(note.products) as (CareProduct & {id?: string})[]).map(p => p.id).filter(Boolean)
      : [...new Set([...used.results.map(u => u.productId), ...(previous ? (JSON.parse(previous.products) as {id?: string}[]).map(p => p.id || '') : [])])].filter(id => products.results.some(p => p.id === id));
    return json({
      visit: {date: visit.date, treatment: visit.treatment}, client: {name: visit.name, phone: visit.phone, email: visit.email},
      text: note?.text ?? previous?.text ?? DEFAULT_CARE_TEXT, productIds: chosen, products: products.results,
      saved: !!note, sentAt: note?.sentAt || null, sentVia: note?.sentVia || '', link: note ? careLink(origin, note.token) : '', mail: mailEnabled(),
      sms: note ? careSms(salonName(await settingsOf(db)), careLink(origin, note.token)) : '',
    });
  } catch (e) { console.error(e); return json({error: 'Domácí péči se nepodařilo načíst. Zkuste to znovu.'}, 503); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({error: 'Nepovolený požadavek.'}, 403);
    const body = await request.json() as {action?: string; data?: Record<string, unknown>};
    const d = body.data || {}, db = database(), origin = new URL(request.url).origin;
    const visit = await visitOf(db, typeof d.visitId === 'string' ? d.visitId : '');
    if (!visit) return json({error: 'Návštěva nebyla nalezena.'}, 404);
    let note = await noteOf(db, visit.id);

    if (body.action === 'delete') { await db.prepare('DELETE FROM care_notes WHERE visit_id=?').bind(visit.id).run(); return json({ok: true}); }
    if (body.action === 'sent') {
      if (!note) return json({error: 'Doporučení ještě není uložené.'}, 409);
      await db.prepare('UPDATE care_notes SET sent_at=?,sent_via=? WHERE id=?').bind(new Date().toISOString(), d.via === 'share' ? 'share' : 'sms', note.id).run();
      return json({ok: true});
    }
    if (body.action !== 'save' && body.action !== 'email') return json({error: 'Neplatná operace.'}, 400);

    const email = typeof d.email === 'string' ? d.email.trim() : '';
    if (body.action === 'email' && !mailEnabled()) return json({error: 'E-maily nejsou na serveru nastavené. Pošlete odkaz SMS.'}, 400);
    if (body.action === 'email' && !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)) return json({error: 'Zadejte platný e-mail klientky.'}, 400);
    // Uložení textu a produktů; ceny a názvy se uloží tak, jak jsou teď, aby odkaz ukazoval, co salon doporučil.
    const text = typeof d.text === 'string' ? d.text.trim().slice(0, 5000) : '';
    const ids = Array.isArray(d.productIds) ? d.productIds.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
    if (!text && !ids.length) return json({error: 'Napište doporučení nebo vyberte aspoň jeden produkt.'}, 400);
    const rows = ids.length ? (await db.prepare(`SELECT id,name,price_cents AS priceCents FROM products WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<{id: string; name: string; priceCents: number}>()).results : [];
    const products = ids.map(id => rows.find(r => r.id === id)).filter(Boolean).map(r => ({id: r!.id, name: r!.name, priceCents: r!.priceCents, note: ''}));
    if (note) await db.prepare('UPDATE care_notes SET text=?,products=? WHERE id=?').bind(text, JSON.stringify(products), note.id).run();
    else {
      const id = crypto.randomUUID(), token = newToken();
      await db.prepare('INSERT INTO care_notes (id,visit_id,client_id,token,text,products,created) VALUES (?,?,?,?,?,?,?)').bind(id, visit.id, visit.clientId, token, text, JSON.stringify(products), new Date().toISOString()).run();
      note = {id, token, text, products: '', sentAt: null, sentVia: ''};
    }
    const settings = await settingsOf(db), link = careLink(origin, note.token), salon = salonName(settings);
    if (body.action === 'save') return json({ok: true, link, sms: careSms(salon, link)});

    notifyClient(email, `Domácí péče po ošetření – ${salon}`, [
      'Dobrý den,', '', `děkuji za návštěvu ${dateText(visit.date)}. Posílám doporučení domácí péče po ošetření ${visit.treatment}:`, '', text,
      products.length ? '\nDoporučené přípravky (k dostání v salonu):\n' + products.map(p => `- ${p.name}${p.priceCents ? ' – ' + formatRevenue(p.priceCents) : ''}`).join('\n') : '',
      '', `Doporučení najdete i zde: ${link}`, settings.businessPhone ? `S dotazy volejte na tel. ${settings.businessPhone}.` : '', '', salon,
    ].join('\n').replace(/\n{3,}/g, '\n\n'));
    await db.prepare("UPDATE care_notes SET sent_at=?,sent_via='email' WHERE id=?").bind(new Date().toISOString(), note.id).run();
    return json({ok: true, link});
  } catch (e) { console.error(e); return json({error: 'Doporučení se nepodařilo uložit. Zkuste to znovu.'}, 503); }
}

/** Veřejná stránka doporučení: jen datum, ošetření, text, produkty a kontakt salonu (bez jména klientky). */
export async function careGet(token: string) {
  if (!/^[0-9a-f]{40}$/.test(token)) return json({error: 'Doporučení nebylo nalezeno.'}, 404);
  const db = database();
  const row = await db.prepare('SELECT n.text,n.products,v.date,v.treatment FROM care_notes n JOIN visits v ON v.id=n.visit_id WHERE n.token=?').bind(token).first<{text: string; products: string; date: string; treatment: string}>();
  if (!row) return json({error: 'Doporučení nebylo nalezeno. Odkaz už možná neplatí, zeptejte se prosím v salonu.'}, 404);
  const s = await settingsOf(db);
  return json({care: {date: row.date, treatment: row.treatment, text: row.text, products: (JSON.parse(row.products) as CareProduct[]).map(({name, priceCents}) => ({name, priceCents}))},
    salon: {name: salonName(s), phone: s.businessPhone, address: s.businessAddress, logoVersion: s.logoVersion, bookingUrl: '/rezervace'}});
}
