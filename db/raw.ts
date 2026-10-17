import { env } from 'cloudflare:workers';
export function database(){ if(!env.DB) throw new Error('Database unavailable'); return env.DB; }
export function photoStorage(){ if(!env.BUCKET) throw new Error('Photo storage unavailable'); return env.BUCKET; }
export async function deleteClientPhotos(clientId:string){const rows=await database().prepare('SELECT object_key FROM photos WHERE client_id=?').bind(clientId).all<{object_key:string}>();if(rows.results.length){const bucket=photoStorage();for(let i=0;i<rows.results.length;i+=500)await bucket.delete(rows.results.slice(i,i+500).map(r=>r.object_key));}}
/** Upozornění salonu (e-mail na vlastním serveru). Když není nastavené, nic se neodešle. */
type Notify=(subject:string,text:string,to?:string)=>Promise<void>;
export function notifySalon(subject:string,text:string,to?:string){const send=(env as {NOTIFY?:Notify}).NOTIFY;if(send)send(subject,text,to).catch(e=>console.error('Notification failed',e instanceof Error?e.message:e));}
/** E-mail klientce (jen když zadala platnou adresu a e-mail je nastavený). */
export function notifyClient(email:string,subject:string,text:string){if(/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email))notifySalon(subject,text,email);}
/** Jsou e-maily nastavené (SMTP)? Bez nich se klientce nic neodešle. */
export const mailEnabled=()=>!!(env as {NOTIFY?:Notify}).NOTIFY;
/** Adresa, na které klientky otevřou odkazy (veřejná adresa rezervací, jinak adresa aplikace). */
export const publicOrigin=(fallback:string)=>(env as {PUBLIC_ORIGIN?:string}).PUBLIC_ORIGIN||fallback;
/** Profil instalace: 'studioiam' (Studio I AM s vlastním ceníkem a logem) nebo 'generic' pro ostatní salony. */
export const salonProfile=()=>(env as {PROFILE?:string}).PROFILE||'generic';
