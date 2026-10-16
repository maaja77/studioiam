import http from 'node:http';import {readFileSync,existsSync,statSync} from 'node:fs';import path from 'node:path';import {scryptSync,timingSafeEqual} from 'node:crypto';
import * as records from '../app/api/records/route';import * as photos from '../app/api/photos/route';import * as bookings from '../app/api/bookings/route';import * as publicBooking from '../app/api/public/route';import * as receipts from '../app/api/receipts/route';
const user=process.env.SALON_USER,encoded=process.env.SALON_PASSWORD_HASH,origin=process.env.SALON_ORIGIN;
if(!user||!encoded||!origin)throw Error('Set SALON_USER, SALON_PASSWORD_HASH and SALON_ORIGIN before starting.');
const [salt,hash]=encoded.split(':');if(!/^[a-f0-9]{32}$/.test(salt||'')||!/^[a-f0-9]{128}$/.test(hash||''))throw Error('Invalid password hash.');const expected=Buffer.from(hash,'hex');new URL(origin);
// Volitelně samostatná veřejná adresa rezervací (např. https://rezervace.studioiam.cz); na ní je jen rezervační stránka.
const publicOrigin=process.env.SALON_PUBLIC_ORIGIN?new URL(process.env.SALON_PUBLIC_ORIGIN).origin:'';const publicHost=publicOrigin?new URL(publicOrigin).host:'';
const webRoot=path.resolve('dist-selfhost/client');
const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2'};
// Veřejné jsou jen rezervační stránka, její statické soubory a /api/public; vše ostatní chrání heslo.
const isPublic=(p:string)=>p==='/rezervace'||p==='/rezervace/'||p.startsWith('/assets/')||p==='/favicon.svg'||p==='/logo.png'||p==='/api/public';
const frameAncestors=process.env.SALON_BOOKING_FRAME_ANCESTORS||'*';
const hits=new Map<string,number[]>();
function rateLimited(ip:string){const now=Date.now(),list=(hits.get(ip)||[]).filter(t=>now-t<3600_000);list.push(now);hits.set(ip,list);if(hits.size>5000)hits.clear();return list.length>20;}
const server=http.createServer(async(req,res)=>{try{
 const pathname=new URL(req.url||'/','http://x').pathname;const publicPath=isPublic(pathname);
 const onPublicHost=!!publicHost&&req.headers.host===publicHost&&publicOrigin!==origin;if(onPublicHost&&!publicPath){res.writeHead(404);res.end();return;}
 const auth=req.headers.authorization||'';let allowed=false;if(auth.startsWith('Basic ')){const decoded=Buffer.from(auth.slice(6),'base64').toString('utf8');const split=decoded.indexOf(':');const name=decoded.slice(0,split),password=decoded.slice(split+1);if(split>=0&&name===user&&password.length<=1024)allowed=timingSafeEqual(scryptSync(password,salt,64),expected);}
 if(!allowed&&!publicPath){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Studio I AM", charset="UTF-8"','Cache-Control':'no-store'});res.end('Prihlaste se.');return;}
 const base=onPublicHost?publicOrigin:origin;const url=new URL(req.url||'/',base);if(url.origin!==new URL(base).origin){res.writeHead(400);res.end();return;}
 if(url.pathname==='/api/public'&&req.method==='POST'){const ip=String(req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket.remoteAddress||'';if(rateLimited(ip)){res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Příliš mnoho pokusů. Zkuste to prosím později nebo nám zavolejte.'}));return;}}
 if(url.pathname.startsWith('/api/')){
  const headers=new Headers();for(const [k,v] of Object.entries(req.headers)){if(v)headers.set(k,Array.isArray(v)?v.join(','):v);}
  const method=req.method||'GET';const chunks:Buffer[]=[];let length=0;if(!['GET','HEAD'].includes(method)){for await(const chunk of req){length+=chunk.length;if(length>11*1024*1024){res.writeHead(413);res.end('Soubor je prilis velky.');return;}chunks.push(chunk);}}
  const request=new Request(url,{method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});let response:Response;
  if(url.pathname==='/api/records'&&method==='GET')response=await records.GET();else if(url.pathname==='/api/records'&&method==='POST')response=await records.POST(request);else if(url.pathname==='/api/photos'&&method==='GET')response=await photos.GET(request);else if(url.pathname==='/api/photos'&&method==='POST')response=await photos.POST(request);else if(url.pathname==='/api/photos'&&method==='DELETE')response=await photos.DELETE(request);else if(url.pathname==='/api/bookings'&&method==='GET')response=await bookings.GET(request);else if(url.pathname==='/api/bookings'&&method==='POST')response=await bookings.POST(request);else if(url.pathname==='/api/receipts'&&method==='GET')response=await receipts.GET(request);else if(url.pathname==='/api/receipts'&&method==='POST')response=await receipts.POST(request);else if(url.pathname==='/api/public'&&method==='GET')response=await publicBooking.GET(request);else if(url.pathname==='/api/public'&&method==='POST')response=await publicBooking.POST(request);else response=Response.json({error:'Not found'},{status:404});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
 const bookingPage=pathname==='/rezervace'||pathname==='/rezervace/';
 let file=bookingPage?path.join(webRoot,'rezervace.html'):path.resolve(webRoot,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(webRoot+path.sep)){file=path.join(webRoot,'index.html');}
 if(!existsSync(file)||!statSync(file).isFile()){if(!allowed){res.writeHead(404);res.end();return;}file=path.join(webRoot,'index.html');}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':file.endsWith('.html')?'no-store':'private, max-age=3600','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',...(bookingPage?{'Content-Security-Policy':'frame-ancestors '+frameAncestors}:{'X-Frame-Options':'DENY'})});res.end(req.method==='HEAD'?undefined:readFileSync(file));
}catch(e){console.error('Request failed',e instanceof Error?e.message:'error');res.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Server je dočasně nedostupný.'}));}});
server.listen(Number(process.env.PORT||8787),process.env.HOST||'127.0.0.1',()=>console.log('Salon self-host server ready'));
