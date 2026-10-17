// Vstupní dotazníky v administraci: odeslání odkazu klientce, přehled na kartě, odvolání souhlasu.
// Vyplnění samotné jde přes veřejné API (/api/public, akce intake) s tajným odkazem.
import {database, publicOrigin} from '../../../db/raw';
import type {IntakeForm} from '../../../lib/intake';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});

export const INTAKE_COLUMNS = 'id,client_id AS clientId,booking_id AS bookingId,token,status,answers,birth_date AS birthDate,consent_health AS consentHealth,consent_photos AS consentPhotos,signed_name AS signedName,signature,consent_text AS consentText,submitted_at AS submittedAt,withdrawn_at AS withdrawnAt,created';
export const newIntakeToken = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), b => b.toString(16).padStart(2, '0')).join('');
export const intakeLink = (origin: string, token: string) => `${publicOrigin(origin)}/dotaznik?t=${token}`;

/** Nový odkaz na dotazník; dřívější nevyplněné odkazy klientky přestanou platit. */
export async function createIntake(clientId: string | null, bookingId: string | null) {
  const db = database(), id = crypto.randomUUID(), token = newIntakeToken();
  await db.batch([
    ...(clientId ? [db.prepare("DELETE FROM intake_forms WHERE client_id=? AND status='sent'").bind(clientId)] : []),
    db.prepare('INSERT INTO intake_forms (id,client_id,booking_id,token,created) VALUES (?,?,?,?,?)').bind(id, clientId, bookingId, token, new Date().toISOString()),
  ]);
  return {id, token};
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams, clientId = params.get('clientId') || '';
    const rows = await database().prepare(`SELECT ${INTAKE_COLUMNS} FROM intake_forms WHERE client_id=? ORDER BY created DESC`).bind(clientId).all<IntakeForm & {answers: string | null}>();
    const origin = new URL(request.url).origin;
    return json({forms: rows.results.map(f => ({...f, answers: f.answers ? JSON.parse(f.answers) : null, link: f.status === 'sent' ? intakeLink(origin, f.token) : '', token: ''}))});
  } catch (e) { console.error(e); return json({error: 'Dotazníky se nepodařilo načíst.'}, 503); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({error: 'Nepovolený požadavek.'}, 403);
    const body = await request.json() as {action?: string; data?: Record<string, unknown>};
    const d = body.data || {}, db = database(), id = typeof d.id === 'string' ? d.id : '';
    if (body.action === 'create') {
      const clientId = typeof d.clientId === 'string' ? d.clientId : '';
      if (!await db.prepare('SELECT id FROM clients WHERE id=?').bind(clientId).first()) return json({error: 'Klientka nebyla nalezena.'}, 404);
      const form = await createIntake(clientId, null);
      return json({ok: true, link: intakeLink(new URL(request.url).origin, form.token)});
    }
    // Odvolání souhlasu: odpovědi o zdraví se smažou; jméno, podpis a text souhlasu zůstanou jako doklad, že souhlas byl dán.
    if (body.action === 'withdraw') {
      const res = await db.prepare("UPDATE intake_forms SET status='withdrawn',withdrawn_at=?,answers=NULL,birth_date='' WHERE id=? AND status='done'").bind(new Date().toISOString(), id).run();
      if (!res.meta.changes) return json({error: 'Vyplněný dotazník nebyl nalezen.'}, 404);
      return json({ok: true});
    }
    if (body.action === 'delete') {
      const res = await db.prepare("DELETE FROM intake_forms WHERE id=? AND status='sent'").bind(id).run();
      if (!res.meta.changes) return json({error: 'Odkaz už neplatí nebo je dotazník vyplněný.'}, 404);
      return json({ok: true});
    }
    return json({error: 'Neplatná operace.'}, 400);
  } catch (e) { console.error(e); return json({error: 'Změnu se nepodařilo uložit. Zkuste to znovu.'}, 503); }
}
