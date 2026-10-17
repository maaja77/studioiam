import React from 'react';import {createRoot} from 'react-dom/client';import PublicBooking from '../../app/public-booking';import PublicReceipt from '../../app/public-receipt';import PublicIntake from '../../app/public-intake';import '../../app/globals.css';
// Stejný balíček slouží rezervační stránce, účtence pro klientku (/uctenka?t=…) a vstupnímu dotazníku (/dotaznik?t=…).
const token=new URLSearchParams(location.search).get('t')||'';
const page=location.pathname.startsWith('/uctenka')?'receipt':location.pathname.startsWith('/dotaznik')?'intake':'booking';
if(page==='receipt')document.title='Účtenka';if(page==='intake')document.title='Vstupní dotazník';
createRoot(document.getElementById('root')!).render(page==='receipt'?<PublicReceipt token={token}/>:page==='intake'?<PublicIntake token={token}/>:<PublicBooking/>);
