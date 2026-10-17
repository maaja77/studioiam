// Přihlašovací stránka administrace (čisté HTML bez Reactu, aby se načetla i bez přihlášení).
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);

export function loginPage({error='',name='',next='/',notice='',logo='/logo.png',salon='Salon'}:{error?:string;name?:string;next?:string;notice?:string;logo?:string;salon?:string}){
 return `<!doctype html><html lang="cs"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Přihlášení · ${esc(salon)}</title><link rel="icon" href="${esc(logo)}"><link rel="apple-touch-icon" href="${esc(logo)}"><style>
:root{--ink:#243638;--muted:#68787a;--teal:#126b66;--line:#e1e9e8;--gold:#b8955a}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;font-family:Arial,Helvetica,sans-serif;color:var(--ink);background:radial-gradient(circle at 15% 10%,#e3f0ed 0,transparent 45%),radial-gradient(circle at 90% 95%,#f3ebdc 0,transparent 40%),#f3f7f7;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px}
main{width:100%;max-width:400px}
.card{background:white;border:1px solid var(--line);border-radius:20px;box-shadow:0 18px 50px #1e4b4818;padding:40px 36px 32px}
.brand{text-align:center;margin-bottom:28px}.brand img{width:92px;height:92px;object-fit:contain;display:block;margin:0 auto 14px}
.brand b{display:block;font-family:Georgia,serif;font-weight:400;font-size:30px;letter-spacing:.5px;overflow-wrap:anywhere}
.brand span{display:block;font-size:11px;letter-spacing:2.4px;color:var(--gold);margin-top:4px}
h1{font-family:Georgia,serif;font-weight:400;font-size:20px;margin:0 0 20px;text-align:center;color:var(--muted)}
label{display:block;font-size:14px;font-weight:600;margin-bottom:16px}
label>span{display:block;margin-bottom:7px}
input[type=text],input[type=password]{width:100%;border:1px solid #cad8d6;border-radius:9px;padding:12px 14px;font:inherit;font-size:16px;color:var(--ink);background:white}
input:focus-visible,button:focus-visible{outline:3px solid #30a49b;outline-offset:2px}
.pass{position:relative}.pass input{padding-right:84px}
.pass button{position:absolute;right:6px;top:50%;transform:translateY(-50%);background:transparent;border:0;color:var(--teal);font:inherit;font-size:13px;font-weight:600;padding:8px 10px;border-radius:6px;cursor:pointer}
.remember{display:flex;align-items:center;gap:10px;font-weight:400;color:var(--muted);margin:4px 0 24px}.remember input{width:18px;height:18px;accent-color:var(--teal);margin:0}
.submit{width:100%;min-height:48px;border:0;border-radius:10px;background:var(--teal);color:white;font:inherit;font-weight:600;font-size:16px;cursor:pointer}.submit:hover{background:#0c514d}.submit:disabled{opacity:.6;cursor:wait}
.error,.notice{border-radius:9px;padding:11px 14px;font-size:14px;margin:0 0 18px}.error{background:#fff1ef;color:#963b30;border:1px solid #f3d8d4}.notice{background:#e2f3ed;color:var(--teal)}
footer{text-align:center;color:var(--muted);font-size:12px;margin-top:20px;line-height:1.6}
@media(max-width:420px){.card{padding:32px 22px 26px;border-radius:16px}.brand img{width:76px;height:76px}.brand b{font-size:26px}}
</style></head><body><main><div class="card">
<div class="brand"><img src="${esc(logo)}" alt=""><b>${esc(salon)}</b><span>ADMINISTRACE SALONU</span></div>
<h1>Přihlášení</h1>
${error?`<p class="error" role="alert">${esc(error)}</p>`:''}${notice?`<p class="notice" role="status">${esc(notice)}</p>`:''}
<form method="post" action="/prihlaseni" autocomplete="on">
<input type="hidden" name="next" value="${esc(next)}">
<label><span>Přihlašovací jméno</span><input type="text" name="name" value="${esc(name)}" autocomplete="username" autocapitalize="none" spellcheck="false" required ${name?'':'autofocus'}></label>
<label><span>Heslo</span><span class="pass"><input type="password" name="password" id="password" autocomplete="current-password" required ${name?'autofocus':''}><button type="button" id="show" aria-controls="password">Zobrazit</button></span></label>
<label class="remember"><input type="checkbox" name="remember" value="1" checked> Pamatovat si přihlášení na tomto zařízení</label>
<button class="submit" type="submit">Přihlásit se</button>
</form></div>
<footer>Soukromá kartotéka a rezervace salonu.<br>Na sdíleném počítači zrušte „Pamatovat si přihlášení“.</footer></main>
<script>var p=document.getElementById('password'),b=document.getElementById('show');b.onclick=function(){var h=p.type==='password';p.type=h?'text':'password';b.textContent=h?'Skrýt':'Zobrazit';p.focus();};document.querySelector('form').onsubmit=function(){document.querySelector('.submit').disabled=true;};</script>
</body></html>`;
}
