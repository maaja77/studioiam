import React from 'react';import {createRoot} from 'react-dom/client';import PublicBooking from '../../app/public-booking';import PublicReceipt from '../../app/public-receipt';import PublicIntake from '../../app/public-intake';import PublicVoucher from '../../app/public-voucher';import '../../app/globals.css';
// Stejný balíček slouží rezervační stránce, účtence pro klientku (/uctenka?t=…), vstupnímu dotazníku (/dotaznik?t=…) a prodeji poukazů (/poukaz).
const token=new URLSearchParams(location.search).get('t')||'';
const page=location.pathname.startsWith('/uctenka')?'receipt':location.pathname.startsWith('/dotaznik')?'intake':location.pathname.startsWith('/poukaz')?'voucher':'booking';
if(page==='receipt')document.title='Účtenka';if(page==='intake')document.title='Vstupní dotazník';if(page==='voucher')document.title='Dárkový poukaz';
createRoot(document.getElementById('root')!).render(page==='receipt'?<PublicReceipt token={token}/>:page==='intake'?<PublicIntake token={token}/>:page==='voucher'?<PublicVoucher/>:<PublicBooking/>);
