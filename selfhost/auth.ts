// Přihlášení do administrace: vlastní přihlašovací stránka a podepsaná session cookie místo okna HTTP Basic.
// Cookie nese jen dobu platnosti a podpis; klíč se odvozuje z hashe hesla, takže změna hesla odhlásí všechna zařízení.
import {createHash,createHmac,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
export {loginPage} from './login-page';

export const COOKIE='salon_session';
const REMEMBER_DAYS=30,SESSION_HOURS=12;

export function createAuth(user:string,encoded:string,secure:boolean){
 const [salt,hash]=encoded.split(':');
 if(!/^[a-f0-9]{32}$/.test(salt||'')||!/^[a-f0-9]{128}$/.test(hash||''))throw Error('Invalid password hash.');
 const expected=Buffer.from(hash,'hex'),key=createHash('sha256').update('studioiam-session\0').update(expected).digest();
 const sign=(payload:string)=>createHmac('sha256',key).update(payload).digest('base64url');
 const check=(name:string,password:string)=>{
  const hashed=scryptSync(password.slice(0,1024),salt,64);// heslo se ověří i při špatném jménu, aby odpověď netrvala jinak dlouho
  return timingSafeEqual(hashed,expected)&&name===user;
 };
 const cookie=(value:string,maxAge?:number)=>`${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax${secure?'; Secure':''}${maxAge===undefined?'':'; Max-Age='+maxAge}`;
 return {
  check,
  /** Nová session; „zapamatovat“ drží přihlášení 30 dní, jinak do zavření prohlížeče (nejdéle 12 hodin). */
  issue(remember:boolean){const exp=Math.floor(Date.now()/1000)+(remember?REMEMBER_DAYS*86400:SESSION_HOURS*3600);const payload=`v1.${exp}`;return cookie(`${payload}.${sign(payload)}`,remember?REMEMBER_DAYS*86400:undefined);},
  clear:()=>cookie('',0),
  /** Platí přihlášení déle než běžná session, tj. bylo s „zapamatovat“? */
  remembered(header:string|undefined){const m=/(?:^|;\s*)salon_session=v1\.(\d{10})\./.exec(header||'');return !!m&&Number(m[1])-Date.now()/1000>SESSION_HOURS*3600;},
  valid(header:string|undefined){
   const value=(header||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
   const m=/^(v1\.(\d{10}))\.([A-Za-z0-9_-]{43})$/.exec(value);if(!m||Number(m[2])<Date.now()/1000)return false;
   const a=Buffer.from(m[3]),b=Buffer.from(sign(m[1]));return a.length===b.length&&timingSafeEqual(a,b);
  },
 };
}

/** Hash hesla ve stejném tvaru jako selfhost/hash-password.mjs (sůl:scrypt). */
export function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');}

/** Pokusy o přihlášení z jedné adresy: po 10 chybách 15 minut pauza. */
const failures=new Map<string,number[]>();
export function loginBlocked(ip:string){const now=Date.now(),list=(failures.get(ip)||[]).filter(t=>now-t<900_000);failures.set(ip,list);return list.length>=10;}
export function loginFailed(ip:string){if(failures.size>5000)failures.clear();failures.set(ip,[...(failures.get(ip)||[]),Date.now()]);}
export function loginSucceeded(ip:string){failures.delete(ip);}

/** Bezpečný cíl po přihlášení: jen cesta v této aplikaci, nikdy cizí adresa. */
export const safeNext=(next:string|null)=>next&&/^\/(?![/\\])[^\s]*$/.test(next)&&!next.startsWith('/prihlaseni')?next:'/';
