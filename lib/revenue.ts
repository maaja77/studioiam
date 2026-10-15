export function parseRevenue(value:unknown):number|null {
 if(value===undefined||value===null||value==='')return null;
 if(typeof value!=='string')throw new Error('Zadejte tržbu v Kč jako nezápornou částku s nejvýše dvěma desetinnými místy.');
 const raw=value.trim();if(!raw)return null;
 if(!/^\d+(?:[.,]\d{1,2})?$/.test(raw))throw new Error('Zadejte tržbu v Kč jako nezápornou částku s nejvýše dvěma desetinnými místy.');
 const [whole,fraction='']=raw.replace(',','.').split('.');const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents>999999999)throw new Error('Tržba může být nejvýše 9 999 999,99 Kč.');return cents;
}
export function revenueSummary(visits:{date:string;revenueCents:number|null}[],month?:string){const recorded=visits.filter(v=>Number.isSafeInteger(v.revenueCents)&&v.revenueCents!==null&&(!month||v.date.slice(0,7)===month));return {cents:recorded.reduce((sum,v)=>sum+(v.revenueCents||0),0),count:recorded.length};}
export function formatRevenue(cents:number){return new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',minimumFractionDigits:0,maximumFractionDigits:2}).format(cents/100);}
