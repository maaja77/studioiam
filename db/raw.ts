import { env } from 'cloudflare:workers';
export function database(){ if(!env.DB) throw new Error('Database unavailable'); return env.DB; }
export function photoStorage(){ if(!env.BUCKET) throw new Error('Photo storage unavailable'); return env.BUCKET; }
export async function deleteClientPhotos(clientId:string){const rows=await database().prepare('SELECT object_key FROM photos WHERE client_id=?').bind(clientId).all<{object_key:string}>();if(rows.results.length){const bucket=photoStorage();for(let i=0;i<rows.results.length;i+=500)await bucket.delete(rows.results.slice(i,i+500).map(r=>r.object_key));}}
