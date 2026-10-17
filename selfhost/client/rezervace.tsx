import React from 'react';import {createRoot} from 'react-dom/client';import PublicBooking from '../../app/public-booking';import PublicReceipt from '../../app/public-receipt';import '../../app/globals.css';
// Stejný balíček slouží rezervační stránce i účtence pro klientku (/uctenka?t=…).
const receipt=location.pathname.startsWith('/uctenka')?new URLSearchParams(location.search).get('t')||'':null;
if(receipt!==null)document.title='Účtenka · Studio I AM';
createRoot(document.getElementById('root')!).render(receipt!==null?<PublicReceipt token={receipt}/>:<PublicBooking/>);
