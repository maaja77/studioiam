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
fotky na disku. Přístup chrání jedno salonní jméno a heslo (HTTP Basic přes HTTPS).
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

## Aktualizace

```sh
git pull
docker compose up -d --build
```

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
