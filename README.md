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
if [ -e data ]; then echo 'Složka data už existuje, záloha se NEZKOPÍROVALA (viz Import zálohy).'; else cp -a /cesta/k/Kartoteka-salonu/backup data; fi
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
Po 10 chybných pokusech z jedné adresy se přihlášení na 15 minut zablokuje.

Heslo si lze změnit přímo v aplikaci (Nastavení → Heslo do administrace); ostatní zařízení se odhlásí.
Zapomenuté heslo obnoví správce serveru: nový hash do `SALON_PASSWORD_HASH` a `docker compose up -d`.
Nový hash v `.env.selfhost` má vždy přednost před heslem změněným v aplikaci.

## Import zálohy do běžící instalace

Když aplikace už běží s prázdnou nebo starou složkou `data`, záloha se při instalaci nezkopíruje.
Postup (složka zálohy obsahuje `salon.sqlite` a `objects/`):

```sh
docker compose down
mv data data-puvodni
python3 selfhost/verify-backup.py /cesta/k/zaloze
cp -a /cesta/k/zaloze data
sudo chown -R 1000:1000 data && sudo chmod -R go-rwx data
docker compose up -d
```

Databáze se při spuštění sama doplní o nové tabulky. Po kontrole smažte `data-puvodni` a kopie zálohy mimo server.

## Aktualizace

```sh
git pull
docker compose up -d --build
```

Před větší aktualizací spusťte ruční zálohu (`sudo systemctl start salon-zaloha`, viz níže).

## Automatické zálohy mimo server

Každou noc ve 2:30 se databáze, fotky, logo i `.env.selfhost` zašifrují a odešlou mimo server
(nástroj restic, běží v Dockeru, nic se neinstaluje). Aplikace se kvůli záloze nezastavuje.
Uchovává se 14 denních, 8 týdenních a 12 měsíčních záloh. Každý 1. den v měsíci se záloha
zkušebně obnoví do dočasné složky a zkontroluje (databáze, vazby, všechny fotky).

Úložiště vyberte mimo Proxmox (doporučení: Backblaze B2 v EU regionu, pár korun měsíčně;
jde i S3 úložiště nebo disk NAS). Nastavení jednou:

```sh
sudo cp selfhost/zaloha/zaloha.env.example /etc/salon-zaloha.env
sudo chmod 600 /etc/salon-zaloha.env
sudo nano /etc/salon-zaloha.env   # heslo záloh, úložiště, klíče, SALON_DIRS = složka s compose.yaml
sudo selfhost/zaloha/nainstalovat.sh
sudo systemctl start salon-zaloha && journalctl -u salon-zaloha -n 30   # první záloha hned
sudo selfhost/zaloha/obnovit.sh --test                                  # zkušební obnova
```

Heslo záloh (`RESTIC_PASSWORD`) uložte i mimo server, například do správce hesel. Bez něj zálohy
nejdou otevřít. Selhání záloh hlídá zdarma healthchecks.io (`HEALTHCHECK_URL`):
když noční záloha neproběhne, přijde e-mail.

Obnova (např. po havárii VM):

```sh
sudo selfhost/zaloha/obnovit.sh --seznam                 # přehled záloh
sudo selfhost/zaloha/obnovit.sh studioiam /tmp/obnova    # obnoví a zkontroluje poslední zálohu
docker compose down && mv data data-stara && sudo mv /tmp/obnova data && docker compose up -d
```

Název salonu v příkazu je jméno složky instalace (u dalších salonů jejich zkratka). Při stavbě
nového serveru je v obnovené složce i původní nastavení `env.selfhost-ze-zalohy`.

## Údaje salonu a profil instalace

Název, adresa, telefon, IČO, e-mail, číslo účtu a logo se vyplňují v Nastavení → Údaje salonu.
Dokud chybí název nebo číslo účtu, administrace na to upozorní (bez účtu se netvoří QR platby a kauce).

`SALON_PROFILE` v `.env.selfhost` určuje, co je navíc:

- `studioiam` – Studio I AM: logo studia, tlačítko „Vložit ceník z MyFoxu“, program Čistá pleť zapnutý
  a při prvním spuštění se do prázdných polí doplní údaje studia (účet, adresa, telefon, IČO).
- `generic` – jakýkoli další salon: prázdné údaje, neutrální logo, bez ceníku a programu (ten lze zapnout v Nastavení).

Bez `SALON_PROFILE` se profil zvolí při prvním spuštění sám: instalace, která už má klientky, je Studio I AM,
nová prázdná je `generic`. Volba se uloží do databáze.

## Další salony (samostatná instalace pro každý salon)

Každý salon má vlastní kontejner, databázi, fotky, heslo a adresu, takže se jeho data nemíchají s ostatními.
Skripty počítají se složkou `/srv/salony` (změníte proměnnou `SALONY_DIR`) a s reverzní proxy s HTTPS,
např. Caddy s doménou typu `*.mojesalony.cz`.

```sh
# jednou (a po každém git pull): sestaví obraz a aktualizuje všechny salony, předtím zálohuje jejich data
sudo selfhost/salony/aktualizovat.sh

# nový salon: vypíše přihlašovací jméno, heslo a řádky pro Caddyfile
sudo selfhost/salony/novy-salon.sh lucie https://lucie.mojesalony.cz
```

Zálohy před aktualizací jsou v `/srv/salony/_zalohy/<salon>-<datum>.tar.gz` (posledních 10 na salon).
Obnova: rozbalit do prázdné složky `data`, přejmenovat `zaloha.sqlite` na `salon.sqlite`, `chown -R 1000:1000 data`.
Tyto zálohy jsou na stejném serveru; pro provoz s platícími salony je potřeba ještě šifrovaná záloha mimo server.

## Online rezervace

- Administrace: záložky **Rezervace** (týdenní kalendář s časovou osou, ošetření barevně podle kategorie, kliknutím do volného místa nová rezervace; ruční rezervace, blokace času, stav Proběhlo / Nepřišla / Zrušeno, založení karty z rezervace) a **Nastavení** (ceník ošetření s kategoriemi, popisy a barvami, výchozí ceník převzatý z MyFoxu, otevírací doba, předstih, kód pro web).
- Veřejná stránka `/rezervace` (bez hesla) s volnými termíny; rezervace se potvrdí sama. Bez hesla je dostupné jen `/rezervace`, `/assets/*` a `/api/public` (max. 20 odeslání za hodinu z jedné IP).
- Klientka se zablokovanými online rezervacemi (karta klientky nebo „Nepřišla“ v kalendáři) se pozná podle telefonu nebo e-mailu a online se neobjedná.
- E-mail o nové rezervaci: v `.env.selfhost` vyplňte `SMTP_*` a `SALON_NOTIFY_EMAIL` (Seznam: `smtp.seznam.cz`, port 465, přihlášení celým e-mailem).
- Na reverse proxy zveřejněte pro internet jen adresu rezervace (např. `rezervace.studioiam.cz`) a nastavte ji do `SALON_PUBLIC_ORIGIN`; na této adrese server vrací jen rezervační stránku, administrace tam odpoví 404. Administraci nechte za VPN nebo heslem. `SALON_BOOKING_FRAME_ANCESTORS` určuje weby, které smí stránku vložit do iframe.
- **Kauce:** v Nastavení → Kauce a platby se zadá číslo účtu, hranice ceny (výchozí 2 000 Kč), procento (30 %, zaokrouhleno na stovky) a lhůta (24 h). Kauci lze zapnout i jednotlivé klientce na kartě. Rezervace pak čeká na kauci, klientka dostane QR platbu, v kalendáři se kauce označí jako zaplacená / vrácená / propadlá. Nezaplacená rezervace se po lhůtě sama zruší.
- **Balíčky a programy:** u ošetření lze nastavit počet ošetření v balíčku a platbu předem. Klientka online rezervuje 1. termín a hned dostane QR platbu na celou částku; termín čeká na platbu stejně jako u kauce. Další termíny balíčku domluví salon.
- **Změna termínu klientkou:** po rezervaci (a e-mailem, pokud ho vyplní) dostane klientka tajný odkaz `/rezervace?t=…`, přes který termín zruší nebo přesune, nejpozději 24 h předem (nastavitelné). Salon dostane e-mail a do poznámky rezervace se zapíše, co klientka změnila. V administraci jde termín změnit kdykoliv.

## SMS připomínky

Den před termínem dostane klientka SMS, např. „STUDIO I AM: pripominame Vas termin zitra po 19.10. v 10:00 (A-QS Hacker).
Pokud nemuzete prijit, dejte prosim vedet na 775 963 462. Dekujeme.“ Zapíná se v Nastavení → SMS připomínky klientkám,
kde jde upravit text a čas odeslání (výchozí 10:00) a poslat si zkušební SMS.

- Posílá se potvrzeným rezervacím s číslem mobilu (české číslo bez předvolby se doplní o +420), každému termínu jednou.
  Po přesunu termínu odejde nová SMS. Rezervace vytvořené méně než den předem a zablokované klientky se nepřipomínají.
- V detailu rezervace je vidět, jestli SMS odešla, a jde ji poslat hned.
- Text je ve výchozím nastavení bez háčků a čárek, takže se vejde do jedné SMS (160 znaků; s diakritikou jen 70).

Brána se nastaví v `.env.selfhost` a pak `docker compose up -d`:

- **SMS brána** (`SMS_PROVIDER=smsbrana`): účet na smsbrana.cz s kreditem, v jejich administraci zapnout
  SMS Connect (a pokud tam je omezení IP adres, povolit veřejnou IP adresu serveru). Do `.env.selfhost` přihlašovací jméno a heslo SMS Connect
  (`SMSBRANA_LOGIN`, `SMSBRANA_PASSWORD`).
- **Vlastní telefon** (`SMS_PROVIDER=smsgate`): telefon s Androidem a aplikací SMS Gateway for Android (sms-gate.app),
  v aplikaci režim Cloud server; jméno a heslo, které aplikace ukáže, patří do `SMSGATE_USER` a `SMSGATE_PASSWORD`.
  SMS odcházejí z čísla telefonu podle tarifu, telefon musí být zapnutý a online.

Po spuštění je v logu `SMS připomínky přes: …`. Chyby odeslání (např. došlý kredit) jsou v `docker compose logs salon`.

## Účtenky

- U rezervace v kalendáři tlačítko **Dokončit**: předvyplní ošetření, přidáte produkty ze seznamu (Nastavení → Produkty k prodeji) nebo vlastní položku, slevu v % nebo Kč a zvolíte platbu QR / hotově / kartou.
- Po dokončení se u nezaplacené účtenky hned ukáže velký QR kód k platbě a tlačítko Zaplaceno.
- Účtenku s QR platbou jde klientce poslat e-mailem (potřebuje nastavené SMTP), SMS z telefonu (otevře se zpráva s odkazem), sdílením nebo odkazem. Odkaz `/uctenka?t=…` je veřejný a tajný, klientka na něm vidí účtenku, QR kód a platební údaje ke zkopírování. Používá adresu `SALON_PUBLIC_ORIGIN`, jinak `SALON_ORIGIN`, takže ta musí být pro klientky dostupná.
- Zaplacená kauce nebo platba předem se z účtenky odečte; rezervace se označí jako proběhlá.
- QR platba (SPD) na doplatek, číslování `RRRR/0001` po letech, VS = číslo účtenky. Storno účtenku nemaže, jen označí.
- Záložka **Účtenky**: přehled za měsíc, nezaplacené účtenky a prodej bez rezervace. Tisk přes tlačítko Tisk (účtenka je připravená na úzký papír 80 mm i A4).
- Údaje na účtence (název, provozovatel, adresa, IČO, neplátce DPH) se nastaví v Nastavení.

## Dárkové poukazy

Záložka Poukazy: prodej poukazu na částku nebo na ošetření (s účtenkou, takže se započítá do tržeb v den prodeje),
přehled s hlídáním platnosti (upozornění a odznak u záložky, když poukaz vyprší do 30 dnů), tisk poukazu (A6, PDF),
ruční čerpání, prodloužení platnosti a storno. Výchozí platnost (6 měsíců) se mění v Nastavení → Kauce a platby.
Když je nastavený e-mail (SMTP a `SALON_NOTIFY_EMAIL`), server jednou denně po 8. hodině pošle salonu souhrn poukazů,
kterým za 30 a znovu za 7 dní končí platnost (kupujícím se nic neposílá).
Poukaz se uplatní na účtence zadáním kódu; uhrazená část se do tržeb znovu nepočítá a storno účtenky ji vrátí na poukaz.

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
