import React from 'react';import {createRoot} from 'react-dom/client';import Home from '../../app/page';import '../../app/globals.css';
// Když přihlášení vyprší, API vrátí 401 a aplikace se vrátí na přihlašovací stránku.
const realFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{const response=await realFetch(input,init);const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url;const url=new URL(raw,location.href);
 if(response.status===401&&url.origin===location.origin&&url.pathname.startsWith('/api/')&&url.pathname!=='/api/public')location.href='/prihlaseni?next='+encodeURIComponent(location.pathname+location.search);return response;};
function logout(){const form=document.createElement('form');form.method='post';form.action='/odhlaseni';document.body.appendChild(form);form.submit();}
createRoot(document.getElementById('root')!).render(<Home onLogout={logout}/>);
