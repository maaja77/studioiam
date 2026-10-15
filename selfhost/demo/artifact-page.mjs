// Po sestavení náhledu vytvoří dist-demo/nahled.html: jedna samostatná stránka pro zveřejnění
// jako Artifact (bez <html>/<head>/<body>, ty doplní hostitel), CSS i JS jsou vložené přímo.
import {readFileSync,writeFileSync} from 'node:fs';
const css=readFileSync('dist-demo/assets/index.css','utf8').replace(/<\/style/gi,'<\\/style');
const js=readFileSync('dist-demo/assets/app.js','utf8').replace(/<\/script/gi,'<\\/script').replace(/<!--/g,'<\\!--');
writeFileSync('dist-demo/nahled.html',`<meta charset="utf-8">
<title>Studio I AM</title>
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`);
