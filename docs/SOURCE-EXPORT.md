# Zdrojový projekt Studio I AM

Původní projekt byl exportován z aktuálního vzdáleného repozitáře.
Původní commit: 0b3830875efa95c79610bd8dda90f783a64a82d0.
Složky app/, db/, lib/, components/, build/, public/, drizzle/ a původní konfigurace
obsahují kompletní sledované zdroje. pnpm-lock.yaml zachovává verze závislostí.
.git, node_modules, dočasné soubory, přístupové tokeny a tajná nastavení nejsou součástí.

Původní Cloudflare/Sites aplikace nebyla pro tento export upravována ani znovu publikována.
Navíc byly přidány selfhost/, dist-selfhost/, compose.yaml, Dockerfile.selfhost,
Dockerfile.selfhost-prebuilt a .env.selfhost.example: samostatná varianta pro Node.js 24,
SQLite a fotografie na disku. Používá stejné produktové obrazovky, pravidla programu
Čistá pleť a API, ale nahrazuje cloudové úložiště a ochranu přístupu místním řešením.

Ověřeno: sestavení klienta a serveru; běh Node.js 24; obnovení 7 klientek, 5 návštěv,
13 fotografií; součet tržeb; přihlášení; nahrání a smazání testovací fotky;
programové ceny včetně restartu po 28 dnech; integrita databáze.
Docker image a skutečný Proxmox host nebyly v této relaci spuštěny.
Vizuální chování fotoaparátu na vašem telefonu nebylo v této relaci ověřeno.
