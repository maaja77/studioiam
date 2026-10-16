# Studio I AM – administrace salonu

Webová aplikace pro kosmetický salon Studio I AM, provozovaná na vlastním serveru (Proxmox).

## Moduly

- **Kartotéka klientek** (hotovo): karty s kontakty, typem pleti a upozorněními, historie návštěv
  (datum, ošetření, přípravky, poznámky, tržba), fotky (nahrání i focení z telefonu),
  přehled tržeb za měsíc a celkem.
- **Program Čistá pleť** (hotovo): série ošetření A-QS Hacker za 1 290 Kč, 2. návštěva −5 %,
  3. a další −10 %, při odstupu nad 28 dní začíná série znovu. Cena se předvyplní do tržby.
- **Poukazy** (plánováno).

Aplikace vznikla v ChatGPT a 13. 10. 2026 byla exportována pro vlastní provoz
(viz [docs/SOURCE-EXPORT.md](docs/SOURCE-EXPORT.md)).

## Technologie

React + Tailwind (klient), Node.js 24 server (`selfhost/server.ts`), SQLite přes `node:sqlite`,
fotky na disku. Přístup chrání jedno salonní jméno a heslo na přihlašovací stránce `/prihlaseni`.
Původní cloudová varianta (vinext/Cloudflare) zůstává ve zdrojích, pro vlastní server se nepoužívá.

## Data klientek nepatří do Gitu

Databáze, fotky, zálohy a `.env.selfhost` jsou osobní a citlivé údaje. Ukládají se jen na serveru
ve složce `data/` a v zálohách mimo repozitář. `.gitignore` je vylučuje.

## Instalace na Proxmox

Doporučení: samostatná VM (Debian/Ubuntu) s Docker Engine a Compose, ne přímo na hostiteli Proxmoxu.

```sh
git clone https://github.com/maaja77/studioiam.git
cd studioiam

# 1. Data: rozbalte exportní ZIP mimo repozitář a ověřte zálohu
python3 selfhost/verify-backup.py /cesta/k/Kartoteka-salonu/backup
test ! -e data && cp -a /cesta/k/Kartoteka-salonu/backup data
sudo chown -R 1000:1000 data && sudo chmod -R go-rwx data

# 2. Přihlášení
cp .env.selfhost.example .env.selfhost && chmod 600 .env.selfhost
read -rsp 'Nové heslo: ' p; printf '\n'
printf '%s' "$p" | docker run --rm -i -v "$PWD/selfhost:/s:ro" node:24-bookworm-slim node /s/hash-password.mjs
unset p
# výsledek vložte do SALON_PASSWORD_HASH, nastavte SALON_USER a SALON_ORIGIN (https://… bez lomítka)

# 3. Spuštění
docker compose up -d --build
docker compose logs --tail=50 salon
```

Aplikace poslouchá jen na `127.0.0.1:8787` uvnitř VM. Před ni patří HTTPS reverse proxy
(Caddy nebo Nginx) s platným certifikátem; bez HTTPS nefunguje focení z telefonu.
Port 8787 nevystavujte přímo do internetu, přístup zvenku ideálně přes VPN.

Podrobný postup přechodu, kontroly po importu a zálohování: [docs/MIGRACE.md](docs/MIGRACE.md).

## Přihlášení

Administrace má vlastní přihlašovací stránku (`/prihlaseni`) v designu studia. Jméno je `SALON_USER`,
heslo je to, ze kterého vznikl `SALON_PASSWORD_HASH` (ne samotný hash). Volba „Pamatovat si přihlášení“
drží přihlášení 30 dní, bez ní do zavření prohlížeče (nejdéle 12 hodin). Tlačítko Odhlásit je v hlavičce.
Po 10 chybných pokusech z jedné adresy se přihlášení na 15 minut zablokuje. Změna hesla
(nový hash a `docker compose up -d`) odhlásí všechna zařízení.

## Aktualizace

```sh
git pull
docker compose up -d --build
```

## Online rezervace

- Administrace: záložky **Rezervace** (týdenní kalendář s časovou osou, ošetření barevně podle kategorie, kliknutím do volného místa nová rezervace; ruční rezervace, blokace času, stav Proběhlo / Nepřišla / Zrušeno, založení karty z rezervace) a **Nastavení** (ceník ošetření s kategoriemi, popisy a barvami, výchozí ceník převzatý z MyFoxu, otevírací doba, předstih, kód pro web).
- Veřejná stránka `/rezervace` (bez hesla) s volnými termíny; rezervace se potvrdí sama. Bez hesla je dostupné jen `/rezervace`, `/assets/*` a `/api/public` (max. 20 odeslání za hodinu z jedné IP).
- Klientka se zablokovanými online rezervacemi (karta klientky nebo „Nepřišla“ v kalendáři) se pozná podle telefonu nebo e-mailu a online se neobjedná.
- E-mail o nové rezervaci: v `.env.selfhost` vyplňte `SMTP_*` a `SALON_NOTIFY_EMAIL` (Seznam: `smtp.seznam.cz`, port 465, přihlášení celým e-mailem).
- Na reverse proxy zveřejněte pro internet jen adresu rezervace (např. `rezervace.studioiam.cz`) a nastavte ji do `SALON_PUBLIC_ORIGIN`; na této adrese server vrací jen rezervační stránku, administrace tam odpoví 404. Administraci nechte za VPN nebo heslem. `SALON_BOOKING_FRAME_ANCESTORS` určuje weby, které smí stránku vložit do iframe.
- **Kauce:** v Nastavení → Kauce a platby se zadá číslo účtu, hranice ceny (výchozí 2 000 Kč), procento (30 %, zaokrouhleno na stovky) a lhůta (24 h). Kauci lze zapnout i jednotlivé klientce na kartě. Rezervace pak čeká na kauci, klientka dostane QR platbu, v kalendáři se kauce označí jako zaplacená / vrácená / propadlá. Nezaplacená rezervace se po lhůtě sama zruší.
- **Balíčky a programy:** u ošetření lze nastavit počet ošetření v balíčku a platbu předem. Klientka online rezervuje 1. termín a hned dostane QR platbu na celou částku; termín čeká na platbu stejně jako u kauce. Další termíny balíčku domluví salon.
- **Změna termínu klientkou:** po rezervaci (a e-mailem, pokud ho vyplní) dostane klientka tajný odkaz `/rezervace?t=…`, přes který termín zruší nebo přesune, nejpozději 24 h předem (nastavitelné). Salon dostane e-mail a do poznámky rezervace se zapíše, co klientka změnila. V administraci jde termín změnit kdykoliv.

## Účtenky

- U rezervace v kalendáři tlačítko **Vystavit účtenku**: předvyplní ošetření, přidáte produkty ze seznamu (Nastavení → Produkty k prodeji) nebo vlastní položku, zvolíte platbu hotově / kartou / QR.
- Zaplacená kauce nebo platba předem se z účtenky odečte; rezervace se označí jako proběhlá.
- QR platba (SPD) na doplatek, číslování `RRRR/0001` po letech, VS = číslo účtenky. Storno účtenku nemaže, jen označí.
- Záložka **Účtenky**: přehled za měsíc, nezaplacené účtenky a prodej bez rezervace. Tisk přes tlačítko Tisk (účtenka je připravená na úzký papír 80 mm i A4).
- Údaje na účtence (název, provozovatel, adresa, IČO, neplátce DPH) se nastaví v Nastavení.

## Náhled s ukázkovými daty

`pnpm run demo:build` sestaví verzi, která běží celá v prohlížeči: skutečné API handlery
(`app/api/*`) nad databází sql.js s vymyšlenými klientkami (`selfhost/demo/`). Výsledná stránka
`dist-demo/nahled.html` se zveřejňuje jako živý náhled pro odsouhlasení změn. Skutečná data do ní nepatří.

## Vývoj

```sh
pnpm install --frozen-lockfile
node node_modules/vite/bin/vite.js build --config selfhost/vite.client.ts
node node_modules/vite/bin/vite.js build --config selfhost/vite.server.ts
node --env-file=.env.selfhost dist-selfhost/server.js   # Node.js 24
```
