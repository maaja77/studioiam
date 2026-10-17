import http from 'node:http';import {readFileSync,existsSync,statSync} from 'node:fs';import path from 'node:path';import {createAuth,hashPassword,loginPage,loginBlocked,loginFailed,loginSucceeded,safeNext} from './auth';import {env,PROFILE,readSetting,writeSetting} from './runtime';import {parseSettings,salonName,salonNow} from '../lib/booking';
import * as records from '../app/api/records/route';import * as photos from '../app/api/photos/route';import * as bookings from '../app/api/bookings/route';import * as publicBooking from '../app/api/public/route';import * as receipts from '../app/api/receipts/route';import * as stats from '../app/api/stats/route';import * as vouchers from '../app/api/vouchers/route';import * as intake from '../app/api/intake/route';import * as lapsed from '../app/api/lapsed/route';import * as stock from '../app/api/stock/route';import * as bank from '../app/api/bank/route';import * as care from '../app/api/care/route';import * as today from '../app/api/today/route';import {LOGO_KEY,imageType} from '../app/api/bookings/route';
const user=process.env.SALON_USER,encoded=process.env.SALON_PASSWORD_HASH,origin=process.env.SALON_ORIGIN;
if(!user||!encoded||!origin)throw Error('Set SALON_USER, SALON_PASSWORD_HASH and SALON_ORIGIN before starting.');
// Heslo změněné v aplikaci má přednost před .env, dokud správce v .env nezadá nový hash (tím heslo obnoví).
const secure=new URL(origin).protocol==='https:';
function currentAuth(){try{const saved=JSON.parse(readSetting('auth')||'null') as {hash?:string;envHash?:string}|null;if(saved?.hash&&saved.envHash===encoded)return createAuth(user!,saved.hash,secure);if(saved)writeSetting('auth',null);}catch{writeSetting('auth',null);}return createAuth(user!,encoded!,secure);}
let auth=currentAuth();
const settings=()=>parseSettings(readSetting('booking'));
const logoUrl=()=>{const v=settings().logoVersion;return '/logo.png'+(v?'?v='+v:'');};
// Volitelně samostatná veřejná adresa rezervací (např. https://rezervace.studioiam.cz); na ní je jen rezervační stránka.
const publicOrigin=process.env.SALON_PUBLIC_ORIGIN?new URL(process.env.SALON_PUBLIC_ORIGIN).origin:'';const publicHost=publicOrigin?new URL(publicOrigin).host:'';
const webRoot=path.resolve('dist-selfhost/client');
const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2'};
// Veřejné jsou jen rezervační stránka, její statické soubory a /api/public; vše ostatní chrání přihlášení.
const isPublic=(p:string)=>p==='/rezervace'||p==='/rezervace/'||p==='/uctenka'||p==='/dotaznik'||p==='/poukaz'||p==='/pece'||p.startsWith('/assets/')||p==='/favicon.svg'||p==='/logo.png'||p==='/api/public'||/^\/kalendar\/[0-9a-f]{40}\.ics$/.test(p);
const frameAncestors=process.env.SALON_BOOKING_FRAME_ANCESTORS||'*';
const hits=new Map<string,number[]>();
function rateLimited(ip:string){const now=Date.now(),list=(hits.get(ip)||[]).filter(t=>now-t<3600_000);list.push(now);hits.set(ip,list);if(hits.size>5000)hits.clear();return list.length>20;}
const server=http.createServer(async(req,res)=>{try{
 const pathname=new URL(req.url||'/','http://x').pathname;const publicPath=isPublic(pathname);
 const onPublicHost=!!publicHost&&req.headers.host===publicHost&&publicOrigin!==origin;if(onPublicHost&&!publicPath){res.writeHead(404);res.end();return;}
 const clientIp=String(req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket.remoteAddress||'';
 const html=(status:number,body:string,extra:Record<string,string>={})=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',...extra});res.end(req.method==='HEAD'?undefined:body);};
 const allowed=auth.valid(req.headers.cookie);
 if(!onPublicHost&&pathname==='/prihlaseni'){
  const query=new URL(req.url||'/','http://x').searchParams;
  if(req.method==='GET'||req.method==='HEAD'){if(allowed){res.writeHead(303,{Location:safeNext(query.get('next'))});res.end();return;}html(200,loginPage({next:safeNext(query.get('next')),notice:query.has('odhlaseno')?'Byli jste odhlášeni.':'',salon:salonName(settings()),logo:logoUrl()}));return;}
  if(req.method!=='POST'){res.writeHead(405);res.end();return;}
  if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end();return;}
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192){res.writeHead(413);res.end();return;}}
  const form=new URLSearchParams(raw),name=(form.get('name')||'').trim(),next=safeNext(form.get('next'));
  if(loginBlocked(clientIp)){html(429,loginPage({name,next,error:'Příliš mnoho neúspěšných pokusů. Zkuste to znovu za 15 minut.',salon:salonName(settings()),logo:logoUrl()}));return;}
  if(!auth.check(name,form.get('password')||'')){loginFailed(clientIp);html(401,loginPage({name,next,error:'Jméno nebo heslo nesouhlasí. Zkontrolujte velká a malá písmena.',salon:salonName(settings()),logo:logoUrl()}));return;}
  loginSucceeded(clientIp);res.writeHead(303,{Location:next,'Set-Cookie':auth.issue(form.get('remember')==='1'),'Cache-Control':'no-store'});res.end();return;
 }
 if(!onPublicHost&&pathname==='/odhlaseni'&&req.method==='POST'){if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end();return;}res.writeHead(303,{Location:'/prihlaseni?odhlaseno','Set-Cookie':auth.clear(),'Cache-Control':'no-store'});res.end();return;}
 if(!allowed&&!publicPath){
  if(pathname.startsWith('/api/')){res.writeHead(401,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Přihlášení vypršelo. Obnovte stránku a přihlaste se znovu.'}));return;}
  const wanted=new URL(req.url||'/','http://x');res.writeHead(303,{Location:'/prihlaseni'+(wanted.pathname==='/'&&!wanted.search?'':'?next='+encodeURIComponent(wanted.pathname+wanted.search)),'Cache-Control':'no-store'});res.end();return;
 }
 const base=onPublicHost?publicOrigin:origin;const url=new URL(req.url||'/',base);if(url.origin!==new URL(base).origin){res.writeHead(400);res.end();return;}
 // Logo salonu: nahrané v Nastavení, jinak logo Studia I AM (jen jeho instalace) nebo neutrální výchozí.
 if(url.pathname==='/logo.png'&&(req.method==='GET'||req.method==='HEAD')){
  const cache=url.searchParams.has('v')?'public, max-age=31536000, immutable':'public, max-age=300';
  const custom=settings().logoVersion?await env.BUCKET.get(LOGO_KEY):null;const type=custom?imageType(custom.body):'';
  if(custom&&type){res.writeHead(200,{'Content-Type':type,'Cache-Control':cache,'X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:Buffer.from(custom.body));return;}
  const fallback=PROFILE==='studioiam'?'logo-studioiam.png':'logo-default.svg';
  res.writeHead(200,{'Content-Type':types[path.extname(fallback)],'Cache-Control':cache,'X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:readFileSync(path.join(webRoot,fallback)));return;
 }
 // Kalendář rezervací pro telefon: chrání ho tajný odkaz z Nastavení (telefon se nepřihlašuje).
 if(url.pathname.startsWith('/kalendar/')&&(req.method==='GET'||req.method==='HEAD')){
  const body=await bookings.calendarFeed(url.pathname.slice(10,-4));if(!body){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/calendar; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex'});res.end(req.method==='HEAD'?undefined:body);return;
 }
 // Změna hesla přihlášenou uživatelkou: ověří současné heslo, ostatní zařízení se odhlásí (klíč session se odvozuje z hesla).
 if(url.pathname==='/api/account'){
  const reply=(status:number,data:unknown,extra:Record<string,string>={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...extra});res.end(JSON.stringify(data));};
  if(req.method!=='POST'){reply(405,{error:'Nepovolená operace.'});return;}
  if(req.headers.origin&&req.headers.origin!==origin){reply(403,{error:'Nepovolený požadavek.'});return;}
  if(loginBlocked(clientIp)){reply(429,{error:'Příliš mnoho neúspěšných pokusů. Zkuste to znovu za 15 minut.'});return;}
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096){reply(413,{error:'Požadavek je příliš dlouhý.'});return;}}
  let body:{current?:unknown;password?:unknown}={};try{body=JSON.parse(raw);}catch{reply(400,{error:'Neplatný požadavek.'});return;}
  const current=typeof body.current==='string'?body.current:'',password=typeof body.password==='string'?body.password:'';
  if(!auth.check(user,current)){loginFailed(clientIp);reply(400,{error:'Současné heslo nesouhlasí.'});return;}
  if(password.length<12||password.length>200){reply(400,{error:'Nové heslo musí mít 12 až 200 znaků.'});return;}
  if(password===current){reply(400,{error:'Nové heslo je stejné jako současné.'});return;}
  const remember=auth.remembered(req.headers.cookie);writeSetting('auth',JSON.stringify({hash:hashPassword(password),envHash:encoded}));auth=currentAuth();
  reply(200,{ok:true},{'Set-Cookie':auth.issue(remember)});return;
 }
 if(url.pathname==='/api/public'&&req.method==='POST'){if(rateLimited(clientIp)){res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Příliš mnoho pokusů. Zkuste to prosím později nebo nám zavolejte.'}));return;}}
 if(url.pathname.startsWith('/api/')){
  const headers=new Headers();for(const [k,v] of Object.entries(req.headers)){if(v)headers.set(k,Array.isArray(v)?v.join(','):v);}
  const method=req.method||'GET';const chunks:Buffer[]=[];let length=0;if(!['GET','HEAD'].includes(method)){for await(const chunk of req){length+=chunk.length;if(length>11*1024*1024){res.writeHead(413);res.end('Soubor je prilis velky.');return;}chunks.push(chunk);}}
  const request=new Request(url,{method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});let response:Response;
  if(url.pathname==='/api/records'&&method==='GET')response=await records.GET();else if(url.pathname==='/api/records'&&method==='POST')response=await records.POST(request);else if(url.pathname==='/api/photos'&&method==='GET')response=await photos.GET(request);else if(url.pathname==='/api/photos'&&method==='POST')response=await photos.POST(request);else if(url.pathname==='/api/photos'&&method==='DELETE')response=await photos.DELETE(request);else if(url.pathname==='/api/bookings'&&method==='GET')response=await bookings.GET(request);else if(url.pathname==='/api/bookings'&&method==='POST')response=await bookings.POST(request);else if(url.pathname==='/api/receipts'&&method==='GET')response=await receipts.GET(request);else if(url.pathname==='/api/receipts'&&method==='POST')response=await receipts.POST(request);else if(url.pathname==='/api/stats'&&method==='GET')response=await stats.GET(request);else if(url.pathname==='/api/vouchers'&&method==='GET')response=await vouchers.GET(request);else if(url.pathname==='/api/vouchers'&&method==='POST')response=await vouchers.POST(request);else if(url.pathname==='/api/intake'&&method==='GET')response=await intake.GET(request);else if(url.pathname==='/api/intake'&&method==='POST')response=await intake.POST(request);else if(url.pathname==='/api/lapsed'&&method==='GET')response=await lapsed.GET(request);else if(url.pathname==='/api/lapsed'&&method==='POST')response=await lapsed.POST(request);else if(url.pathname==='/api/stock'&&method==='GET')response=await stock.GET(request);else if(url.pathname==='/api/stock'&&method==='POST')response=await stock.POST(request);else if(url.pathname==='/api/today'&&method==='GET')response=await today.GET();else if(url.pathname==='/api/today'&&method==='POST')response=await today.POST(request);else if(url.pathname==='/api/care'&&method==='GET')response=await care.GET(request);else if(url.pathname==='/api/care'&&method==='POST')response=await care.POST(request);else if(url.pathname==='/api/bank'&&method==='GET')response=await bank.GET();else if(url.pathname==='/api/bank'&&method==='POST')response=await bank.POST(request);else if(url.pathname==='/api/public'&&method==='GET')response=await publicBooking.GET(request);else if(url.pathname==='/api/public'&&method==='POST')response=await publicBooking.POST(request);else response=Response.json({error:'Not found'},{status:404});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
 const bookingPage=pathname==='/rezervace'||pathname==='/rezervace/'||pathname==='/uctenka'||pathname==='/dotaznik'||pathname==='/poukaz'||pathname==='/pece';
 let file=bookingPage?path.join(webRoot,'rezervace.html'):path.resolve(webRoot,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(webRoot+path.sep)){file=path.join(webRoot,'index.html');}
 if(!existsSync(file)||!statSync(file).isFile()){if(!allowed){res.writeHead(404);res.end();return;}file=path.join(webRoot,'index.html');}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':file.endsWith('.html')?'no-store':'private, max-age=3600','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',...(bookingPage?{'Content-Security-Policy':'frame-ancestors '+frameAncestors}:{'X-Frame-Options':'DENY'})});res.end(req.method==='HEAD'?undefined:readFileSync(file));
}catch(e){console.error('Request failed',e instanceof Error?e.message:'error');res.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Server je dočasně nedostupný.'}));}});
server.listen(Number(process.env.PORT||8787),process.env.HOST||'127.0.0.1',()=>console.log('Salon self-host server ready'));
// Jednou denně po 8. hodině pošle salonu e-mail o poukazech, které brzy vyprší (každý poukaz 30 a 7 dní předem).
let remindedOn='';
async function dailyTasks(){const now=salonNow();
 // SMS připomínky zítřejších termínů: každých 15 minut od nastaveného času, každý termín jen jednou (hlídá databáze).
 try{const n=await bookings.remindBookings(now);if(n)console.log(`SMS připomínky odeslány (${n}).`);}catch(e){console.error('SMS reminders failed',e instanceof Error?e.message:e);}
 // Ranní přehled dne e-mailem salonu (pokud je zapnutý v části Dnes), jednou denně po 7. hodině.
 if(now.slice(11,13)>='07'&&now.slice(11,13)<'12'&&readSetting('morningSent')!==now.slice(0,10)){writeSetting('morningSent',now.slice(0,10));try{if(await today.morningDigest(origin+'/'))console.log('Ranní přehled odeslán.');}catch(e){writeSetting('morningSent',null);console.error('Morning digest failed',e instanceof Error?e.message:e);}}
 if(now.slice(11,13)<'08'||remindedOn===now.slice(0,10))return;remindedOn=now.slice(0,10);
 try{const n=await vouchers.remindExpiring(origin+'/');if(n)console.log(`Připomenutí poukazů odesláno (${n}).`);}catch(e){remindedOn='';console.error('Voucher reminder failed',e instanceof Error?e.message:e);}}
setTimeout(dailyTasks,10_000);setInterval(dailyTasks,15*60_000);
