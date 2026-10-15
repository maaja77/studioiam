import { database, photoStorage } from '../../../db/raw';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function sameOrigin(request:Request){return !request.headers.get('origin')||request.headers.get('origin')===new URL(request.url).origin;}
export async function GET(request:Request){try{const params=new URL(request.url).searchParams;const db=database();const id=params.get('id');if(id){const row=await db.prepare('SELECT object_key,mime FROM photos WHERE id=?').bind(id).first<{object_key:string;mime:string}>();if(!row)return json({error:'Fotka nebyla nalezena.'},404);const object=await photoStorage().get(row.object_key);if(!object)return json({error:'Fotka není dostupná.'},404);return new Response(object.body,{headers:{'Content-Type':row.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}});}const clientId=params.get('clientId');if(!clientId)return json({error:'Chybí klient.'},400);const rows=await db.prepare('SELECT id,date,caption FROM photos WHERE client_id=? ORDER BY date DESC,created DESC').bind(clientId).all();return json({photos:rows.results});}catch(e){console.error(e);return json({error:'Fotky se nepodařilo načíst. Zkuste to znovu.'},503);}}
export async function POST(request:Request){
 if(!sameOrigin(request))return json({error:'Nepovolený požadavek.'},403);
 if(Number(request.headers.get('content-length')||0)>11*1024*1024)return json({error:'Fotka může mít nejvýše 10 MB.'},413);
 try{const data=await request.formData();const file=data.get('file');const clientId=data.get('clientId');const date=data.get('date');const caption=data.get('caption')||'';
 if(!(file instanceof File)||typeof clientId!=='string'||typeof date!=='string'||typeof caption!=='string')return json({error:'Vyberte fotku a vyplňte datum.'},400);
 if(!file.size||file.size>10*1024*1024)return json({error:'Vyberte fotku o velikosti nejvýše 10 MB.'},400);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)return json({error:'Vyplňte platné datum.'},400);
 if(caption.length>500)return json({error:'Popisek může mít nejvýše 500 znaků.'},400);
 const bytes=new Uint8Array(await file.arrayBuffer());let mime='';if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';else if([137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))mime='image/png';else if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')mime='image/webp';
 if(!mime)return json({error:'Vyberte fotku ve formátu JPG, PNG nebo WebP.'},400);
 const db=database();if(!await db.prepare('SELECT id FROM clients WHERE id=?').bind(clientId).first())return json({error:'Klient nebyl nalezen.'},404);
 const id=crypto.randomUUID(),key='photos/'+id;const bucket=photoStorage();await bucket.put(key,bytes,{httpMetadata:{contentType:mime}});
 try{await db.prepare('INSERT INTO photos(id,client_id,object_key,mime,date,caption,created) VALUES(?,?,?,?,?,?,?)').bind(id,clientId,key,mime,date,caption.trim(),new Date().toISOString()).run();}catch(e){await bucket.delete(key);throw e;}
 return json({ok:true,id},201);
 }catch(e){console.error(e);return json({error:'Fotku se nepodařilo uložit. Zkuste to znovu.'},503);}
}
export async function DELETE(request:Request){if(!sameOrigin(request))return json({error:'Nepovolený požadavek.'},403);try{const id=new URL(request.url).searchParams.get('id');if(!id)return json({error:'Chybí fotka.'},400);const db=database();const photo=await db.prepare('SELECT object_key FROM photos WHERE id=?').bind(id).first<{object_key:string}>();if(photo){await photoStorage().delete(photo.object_key);await db.prepare('DELETE FROM photos WHERE id=?').bind(id).run();}return json({ok:true});}catch(e){console.error(e);return json({error:'Fotku se nepodařilo smazat. Zkuste to znovu.'},503);}}
