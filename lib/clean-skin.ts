export const PROGRAM_TREATMENT='A-QS Hacker';
export type ProgramVisit={id:string;date:string;cleanSkin:number;programPriceCents:number|null;programStep:number|null};
const DAY=86400000;
const day=(date:string)=>Date.parse(date+'T00:00:00Z')/DAY;
export function addDays(date:string,days:number){return new Date((day(date)+days)*DAY).toISOString().slice(0,10);}
export function programQuote(visits:ProgramVisit[],date:string,excludeId?:string){
 const history=visits.filter(v=>v.cleanSkin===1&&v.id!==excludeId&&v.date<=date).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 let step=0,last:string|null=null;
 for(const visit of history){step=last&&day(visit.date)-day(last)<=28?step+1:1;last=visit.date;}
 const restarted=last!==null&&day(date)-day(last)>28;
 const nextStep=restarted?1:step+1;const discount=nextStep===1?0:nextStep===2?5:10;
 return {step:nextStep,discount,priceCents:discount===0?129000:discount===5?122550:116100,lastDate:last,dueDate:last?addDays(last,28):null,restarted};
}
export function programStatus(visits:ProgramVisit[],today:string){const latest=visits.filter(v=>v.cleanSkin===1).sort((a,b)=>b.date.localeCompare(a.date))[0];if(!latest)return {dueDate:null,daysLeft:null,overdue:false};const dueDate=addDays(latest.date,28),daysLeft=day(dueDate)-day(today);return {dueDate,daysLeft,overdue:daysLeft<0};}
