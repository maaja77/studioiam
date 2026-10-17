# Kartotéka salonu Studio I AM: zdroje, záloha a přenos

> Tento návod vznikl k exportnímu ZIPu z 13. 10. 2026. V repozitáři je místo složky `project/`
> přímo kořen repozitáře, `compose.yaml` sestavuje aplikaci ze zdrojů (`Dockerfile.selfhost`)
> a hotový build `dist-selfhost/` ani data v repozitáři nejsou. Postup instalace z repozitáře
> je v README.md; tento soubor slouží hlavně pro ověření a import zálohy.

## Co balíček obsahuje
- project/: kompletní původní sledované zdroje s uzamčenými závislostmi a migracemi, navíc samostatná varianta pro vlastní server a její sestavené soubory.
- backup/salon.sqlite: přenositelná SQLite databáze vytvořená ze všech aplikačních tabulek.
- backup/records.json: úplná data všech sloupců tabulek clients, visits a photos, včetně poznámek, programu, tržeb a metadat fotografií.
- backup/salon.sql: čitelný SQL výpis pro obnovu.
- backup/objects/: všech 13 originálních fotek v cestách odpovídajících databázi.
- backup/manifest.json: čas exportu, commit, počty, celkové tržby a kontrolní součty.
- SHA256SUMS: kontrolní součty všech souborů balíčku.

Záloha obsahuje 7 klientek, 5 návštěv, 13 fotografií a 8 950 Kč zaznamenaných tržeb.
Nejde o zisk ani účetní uzávěrku. Uložené ceny, tržby, poznámky a programové příznaky
jsou zachovány. Export neobsahuje interní platformní přihlašovací účty; na vlastním
serveru si nastavíte nové přihlašovací jméno a heslo.

ZIP není šifrovaný a obsahuje osobní údaje a fotografie. Uchovávejte ho soukromě
na šifrovaném disku a alespoň ve dvou nezávislých kopiích. Neposílejte ho veřejným
odkazem. Přístupové tokeny původní služby nejsou v balíčku.

## Nejprve ověřte zálohu
Po rozbalení ze složky balíčku:

```sh
sha256sum -c SHA256SUMS
python3 project/selfhost/verify-backup.py backup
```
Kontroluje se integrita SQLite, cizí klíče, shoda každé hodnoty s JSON,
počty záznamů, součet tržeb a SHA-256 každé originální fotografie.

## Doporučený provoz na Proxmoxu
Použijte samostatný Debian/Ubuntu virtuální stroj QEMU/KVM, v něm Docker Engine
s Compose. Neinstalujte salonní aplikaci přímo do systému hypervizoru Proxmox.
Proxmox pro aplikační kontejnery doporučuje virtuální stroj:
https://pve.proxmox.com/pve-docs/pct.1.html

Návod předpokládá, že VM a Docker už jsou připravené. Instalaci Dockeru proveďte
podle jeho oficiálního návodu pro zvolený systém, ne náhodným instalačním skriptem.

1. Přeneste ZIP přes soukromé SSH/SCP spojení a rozbalte ho ve VM.
2. Ověřte zálohu příkazy výše. Ponechte backup/ jako neměnnou původní kopii.
3. Importujte do nové prázdné provozní složky:

```sh
cd project
# Spouštějte pouze pokud složka data ještě NEEXISTUJE.
test ! -e data && cp -a ../backup data
sudo chown -R 1000:1000 data
sudo chmod -R go-rwx data
cp .env.selfhost.example .env.selfhost
chmod 600 .env.selfhost
```

Pokud data už existuje, nejprve se zastavte: nekopírujte zálohu přes běžící databázi.
Použijte samostatný adresář pro nový import a ověřte, kterou databázi chcete zachovat.

4. Vytvořte hash nového silného hesla (alespoň 12 znaků) bez zapsání hesla do historie.
Následující příkazy použijte v Bash a s nainstalovaným Node.js 24:

```sh
read -rsp 'Nové heslo: ' salon_password
printf '\n'
printf '%s' "$salon_password" | node selfhost/hash-password.mjs
unset salon_password
```

Výsledný řetězec salt:hash vložte do SALON_PASSWORD_HASH v .env.selfhost.
SALON_USER nastavte na nové přihlašovací jméno, SALON_ORIGIN na skutečnou HTTPS
adresu BEZ závěrečného lomítka, např. https://salon.vasedomena.cz.
Uživatelské jméno nesmí obsahovat dvojtečku. .env.selfhost držte neveřejný.
Hash hesla lze vytvořit i v libovolném jiném důvěryhodném zařízení s Node.js 24.

5. Spusťte předem sestavenou variantu:

```sh
docker compose up -d --build
docker compose logs --tail=50 salon
```

Compose publikuje port 8787 pouze na loopback VM. Před něj nastavte HTTPS reverse
proxy (např. již používaný Nginx/Caddy) na TOMTÉŽ VM s cílem http://127.0.0.1:8787.
Proxy musí předat cookies a původní Origin. SALON_ORIGIN musí přesně
odpovídat adrese v prohlížeči. Použijte platný důvěryhodný certifikát. Pro focení
z telefonu je HTTPS potřeba. Port 8787 přímo na internet nevystavujte.

Přístup nyní chrání nové místní heslo (přihlašovací stránka /prihlaseni, přes HTTPS), nikoli účet ChatGPT.
Tato varianta je určena pro soukromou kartotéku s jedním společným salonním účtem;
nepřidává více uživatelů ani role. Přístupy zvenku omezte VPN nebo firewallem,
pokud je nepotřebujete veřejně.

## Přímé spuštění bez Dockeru / změny zdrojů
Po nainstalování Node.js 24 lze použít hotový build:

```sh
node --env-file=.env.selfhost dist-selfhost/server.js
```

Při úpravách zdrojů sestavte novou klientskou i serverovou část:

```sh
corepack enable
corepack prepare pnpm@10.11.0 --activate
pnpm install --frozen-lockfile
node node_modules/vite/bin/vite.js build --config selfhost/vite.client.ts
node node_modules/vite/bin/vite.js build --config selfhost/vite.server.ts
```

Pro Docker build ze zdrojů použijte Dockerfile.selfhost místo výchozího
Dockerfile.selfhost-prebuilt v compose.yaml. Závislosti se instalují z registru;
node_modules se nepřenáší. Původní npm/pnpm build patří původní cloudové variantě.

## Bezpečné přepnutí bez ztráty změn
1. Novou aplikaci nejprve spouštějte s KOPIÍ zálohy pro testování.
2. Porovnejte počty 7/5/13 a tržby 8 950 Kč, otevřete několik karet a všechny fotky.
   Ověřte přihlášení, ošetření, program Čistá pleť a focení na konkrétním telefonu.
3. Před ostrým přechodem přestaňte do původní kartotéky zapisovat.
4. Pokud od času uvedeného v manifest.json vznikly změny, tento ZIP není jejich
   záloha. Vyžádejte nový úplný export; nepřecházejte se starou kopií.
5. Import finální zálohy proveďte při zastaveném novém serveru do NOVÉ složky data.
6. Po ověření používejte pro nové zápisy jen jednu aplikaci. Žádná automatická
   synchronizace mezi původní a vlastní variantou není nastavena.
7. Původní aplikaci zatím ponechte jako kontrolní kopii. Nerušte ji ani nemažte její
   data, dokud není ověřena nová instalace a alespoň jedna skutečná obnova zálohy.

## Průběžné zálohování vlastního serveru
Automatické noční šifrované zálohy mimo server nastavíte skripty v `selfhost/zaloha/`
(postup v README, oddíl Automatické zálohy mimo server). Ruční postup níže je náhradní varianta.

Zálohujte společně salon.sqlite a celý adresář objects/. Nestačí projektový ZIP,
samotná databáze ani samotný snapshot disků bez ověření konzistence aplikace.
Nejjednodušší konzistentní záloha je krátce zastavit aplikaci:

```sh
cd project
docker compose stop salon
# Cílový adresář existuje a je soukromý; jméno pokaždé nové.
sudo tar -czf /bezpecne-zalohy/salon-YYYYMMDD-HHMM.tar.gz data .env.selfhost
docker compose start salon
```

Pokud tar selže, aplikaci znovu spusťte a příčinu vyřešte; neoznačujte neúplný
soubor za platnou zálohu. Záloha .env.selfhost obsahuje přihlašovací hash: chraňte ji.
Kopii ukládejte také mimo Proxmox host. Retenci a frekvenci zvolte podle toho,
kolik nových zápisů jste ochotná znovu zadávat. Pravidelně vyzkoušejte obnovu do
oddělené VM bez přepisu produkčních dat. Původní manifest popisuje pouze tento
export; novější provozní databáze bude mít jiné kontrolní součty.

## Rozsah ověření
V této relaci prošel místní Node.js 24 build a integrační test s kopií skutečných
exportovaných dat: přihlášení, všechny originální fotografie, historie a tržby,
programové slevy, testovací zápisy i mazání a odmítnutí cizího Origin.
Docker image, nastavení HTTPS/VPN a provoz na vašem skutečném Proxmoxu nebyly
ověřeny. První nasazení proto musí projít uvedenými kontrolami před přechodem.

Oficiální reference:
- https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html
- https://docs.docker.com/compose/reference/
- https://docs.docker.com/reference/compose-file/volumes/
