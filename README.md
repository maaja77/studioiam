# Studio I AM – administrace salonu

Webová aplikace pro kosmetický salon Studio I AM, provozovaná na vlastním serveru (Proxmox).

## Moduly

- **Kartotéka klientek** (hotovo): karty s kontakty, typem pleti a upozorněními, historie návštěv
  (datum, ošetření, použité přípravky jako seznam s množstvím a tlačítkem „Jako minule“, poznámky, tržba), fotky (nahrání i focení z telefonu, porovnání před/po s koláží ke stažení),
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

## Přehled dne

- Záložka **Dnes** je první a otevře se po přihlášení: dnešní termíny po sobě, u každé klientky upozornění z karty a z vyplněného dotazníku, nezaplacená kauce, nevyplněný dotazník, nová klientka, poslední návštěva a tlačítka Karta a Volat.
- Vpravo **Čeká na vyřízení**: nezaplacené kauce, proběhlé termíny bez účtenky, nezaplacené účtenky, poukazy z webu čekající na platbu a docházející produkty. Kliknutím se otevře příslušná část.
- **Ranní e-mail** (zapíná se zaškrtnutím v části Dnes, potřebuje `SMTP_*` a `SALON_NOTIFY_EMAIL`): jednou denně mezi 7:00 a 12:00 přijde salonu přehled s časy, ošetřeními a jmény. Zdravotní údaje ani text upozornění v něm nejsou, jen poznámka „upozornění v kartě“.

### Prosba o hodnocení

- V části **Dnes** je panel **Požádat o hodnocení** s klientkami, které byly v salonu v posledních 7 dnech. Každá se žádá jen jednou; klientky označené „Nechce zprávy“ a klientky s blokovanými rezervacemi se nenabízejí.
- Odkaz na hodnocení zkopírujte z Google profilu firmy („Požádat o recenze“) a vložte ho do panelu. Text zprávy jde upravit, doplní se `{jmeno}`, `{salon}` a `{odkaz}`.
- SMS se otevře v telefonu a odešlete ji sama, nic se neposílá automaticky. E-mail jde poslat přímo z aplikace, pokud jsou nastavené `SMTP_*`.

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

## Vstupní dotazník a souhlas (GDPR)

Před první návštěvou vyplní klientka zdravotní dotazník (alergie, léky, těhotenství, kožní a další onemocnění,
nedávné zákroky…), souhlas se zpracováním osobních údajů a údajů o zdraví, volitelně souhlas s fotografiemi, a podepíše se prstem.

- Nová klientka dostane odkaz `/dotaznik?t=…` hned po online rezervaci (na potvrzovací stránce i v e-mailu). Vypnout jde
  v Nastavení → Otevírací doba a pravidla. Po vyplnění se karta klientky založí sama (nebo se spáruje podle telefonu).
- Stávajícím klientkám se dotazník připraví na kartě: odkaz SMS, e-mailem, nebo „Vyplnit teď v salonu“ na tabletu či telefonu.
- Na kartě jsou odpovědi „ano“ jako upozornění, souhlas s fotkami, podpis a uložený text souhlasu (pozdější změna textu
  vyplněné dotazníky nemění). V detailu rezervace je vidět, jestli je dotazník vyplněný.
- „Klientka odvolala souhlas“ smaže odpovědi o zdraví; jméno, podpis a text souhlasu zůstanou jako doklad.
- Text souhlasu se skládá z údajů salonu (název, provozovatel, IČO, adresa) v `lib/intake.ts`. Uvádí uchování po dobu
  návštěv a nejdéle 3 roky od poslední; staré karty je potřeba mazat ručně. Text je vhodné nechat zkontrolovat.

## Kalendář v telefonu

V Nastavení → Kalendář v telefonu se zapne tajný odkaz `/kalendar/<kód>.ics`. Telefon ho odebírá jako kalendář
(iPhone: tlačítko Přidat do iPhonu nebo Nastavení → Kalendář → Účty → Přidat odebíraný kalendář; Android:
calendar.google.com → Další kalendáře → Z adresy URL) a změny si stahuje sám (Google jen několikrát denně).

- V kalendáři jsou rezervace od 60 dní zpět do roku dopředu, bez zrušených a nedorazivších. Blokace času jsou tam taky.
- U rezervace je jen jméno, ošetření a telefon; poznámky a údaje z karty klientky do kalendáře nejdou.
- Odkaz je dostupný i bez přihlášení, na veřejné adrese rezervací (`SALON_PUBLIC_ORIGIN`), aby fungoval i mimo domácí síť.
  Chrání ho jen tajný kód: „Vytvořit nový odkaz“ starý okamžitě zneplatní, „Vypnout“ kalendář zruší.

## Účtenky

- U rezervace v kalendáři tlačítko **Dokončit**: předvyplní ošetření, přidáte produkty ze seznamu (záložka Sklad) nebo vlastní položku, slevu v % nebo Kč a zvolíte platbu QR / hotově / kartou.
- Po dokončení se u nezaplacené účtenky hned ukáže velký QR kód k platbě a tlačítko Zaplaceno.
- Účtenku s QR platbou jde klientce poslat e-mailem (potřebuje nastavené SMTP), SMS z telefonu (otevře se zpráva s odkazem), sdílením nebo odkazem. Odkaz `/uctenka?t=…` je veřejný a tajný, klientka na něm vidí účtenku, QR kód a platební údaje ke zkopírování. Používá adresu `SALON_PUBLIC_ORIGIN`, jinak `SALON_ORIGIN`, takže ta musí být pro klientky dostupná.
- Zaplacená kauce nebo platba předem se z účtenky odečte; rezervace se označí jako proběhlá.
- QR platba (SPD) na doplatek, číslování `RRRR/0001` po letech, VS = číslo účtenky. Storno účtenku nemaže, jen označí.
- Záložka **Účtenky**: přehled za měsíc, nezaplacené účtenky a prodej bez rezervace. Tisk přes tlačítko Tisk (účtenka je připravená na úzký papír 80 mm i A4).
- Údaje na účtence (název, provozovatel, adresa, IČO, neplátce DPH) se nastaví v Nastavení.

### Podklady pro účetní

- Účtenky → **Pro účetní**: souhrn vybraného měsíce podle způsobu platby (hotově, kartou, QR / převod, kauce zaplacené předem) a podle druhu (ošetření, produkty, prodej dárkových poukazů), seznam účtenek včetně storen, nezaplacené QR účtenky a propadlé kauce.
- **Stáhnout CSV** uloží soubor pro Excel (středník, UTF-8), **Vytisknout / PDF** vytiskne přehled nebo ho uloží jako PDF.
- Část účtenky uhrazená dárkovým poukazem se do tržeb nepočítá, tržba je v měsíci prodeje poukazu. Jména klientek v podkladech nejsou.

### Platby z banky (párování převodů)

Účtenky → **Platby z banky**: nahrajete výpis pohybů z internetového bankovnictví (ČSOB: Pohyby na účtu → Export → CSV)
a aplikace podle variabilního symbolu a částky sama označí jako zaplacené kauce u rezervací (rezervace čekající na kauci
se potvrdí), objednávky poukazů z webu (poukaz začne platit a kupující dostane e-mail s odkazem) a QR účtenky.

- Bere jen příchozí platby. Každá platba se uloží s ID transakce z banky, takže výpisy se mohou překrývat a nic se nezdvojí.
- Když přijde méně, než se čeká, platba se nespáruje sama a ukáže se v seznamu **K vyřízení**. Tam jde platbu ručně
  přiřadit (třeba když klientka zapomněla variabilní symbol) nebo skrýt (platby kartou z terminálu, platby mimo aplikaci).
- Výpis z jiného účtu, než je v Nastavení, se nahraje jen po potvrzení.
- Nahraný výpis obsahuje osobní údaje plátců. Soubor po nahrání smažte a do GitHubu ho nikdy nedávejte.

## Domácí péče po ošetření

U každé návštěvy v kartě je tlačítko **Domácí péče pro klientku**: napíšete doporučení (řádek s pomlčkou = odrážka)
a vyberete doporučené produkty ze Skladu (předvyberou se ty, které jste při ošetření použila). Klientce se pošle
tajný odkaz `/pece?t=…` SMS z telefonu nebo e-mailem (potřebuje SMTP); na stránce vidí doporučení, produkty s cenou,
telefon salonu a odkaz na objednání. Text se příště sám nabídne u stejného ošetření. Do doporučení se nikdy
automaticky nedávají údaje z dotazníku ani poznámky z karty.

## Sklad produktů

Záložka Sklad: produkty k prodeji (prodejní a nepovinně nákupní cena) a u těch se zapnutým sledováním počet kusů.
Prodej produktu na účtence kusy odečte (ručně dopsaná položka se spáruje podle názvu), storno účtenky je vrátí.
Ručně se zapisuje naskladnění (s nákupní cenou), spotřeba v salonu (testery, ošetření) a inventura (skutečný počet).
U každého produktu je historie pohybů a odhad, na jak dlouho zásoba vystačí podle prodejů za 90 dní. Když počet klesne
na nastavené minimum, ukáže se upozornění a odznak u záložky; na účtence se zobrazí, kolik kusů je skladem.

### Faktury za zboží

- Sklad → **Faktury za zboží**: dodavatel, číslo, datum, splatnost, částka, stav zaplacení a soubor faktury (PDF nebo fotka, nejvýše 10 MB; ukládá se na server vedle fotek a zálohuje se s nimi).
- Položka propojená s produktem ve Skladu se při uložení naskladní a produktu se uloží nákupní cena. Položku jde založit i jako nový produkt, nebo jen zapsat (doprava, spotřební materiál).
- E-faktura **ISDOC** (.isdoc) vyplní dodavatele, data, částku i položky sama a položky se podle názvu přiřadí k produktům.
- Smazání faktury naskladnění vrátí. Faktury daného měsíce jsou i v Podkladech pro účetní.

## Klientky, které dlouho nepřišly

Karty klientů → Dlouho nebyly: klientky, jejichž poslední návštěva (zápis v kartě, proběhlý termín v kalendáři nebo
účtenka) je starší než zvolená doba (6 týdnů až rok) a které nemají objednaný další termín. Zablokované klientky se
neukazují. U každé je SMS s připraveným textem (otevře se v telefonu), hovor, zkopírování textu a odkaz na kartu.
Oslovené se přesunou do záložky Oslovené, dokud znovu nepřijdou; klientky, které zprávy nechtějí, se označí Nechce zprávy.
Text SMS se ukládá do nastavení; jako obchodní sdělení musí nabízet možnost další zprávy odmítnout.

## Dárkové poukazy

Záložka Poukazy: prodej poukazu na částku nebo na ošetření (s účtenkou, takže se započítá do tržeb v den prodeje),
přehled s hlídáním platnosti (upozornění a odznak u záložky, když poukaz vyprší do 30 dnů), tisk poukazu (A6, PDF),
ruční čerpání, prodloužení platnosti a storno. Výchozí platnost (6 měsíců) se mění v Nastavení → Dárkové poukazy.
Když je nastavený e-mail (SMTP a `SALON_NOTIFY_EMAIL`), server jednou denně po 8. hodině pošle salonu souhrn poukazů,
kterým za 30 a znovu za 7 dní končí platnost (kupujícím se nic neposílá).
Poukaz se uplatní na účtence zadáním kódu; uhrazená část se do tržeb znovu nepočítá a storno účtenky ji vrátí na poukaz.

### Prodej poukazů na webu

Zapíná se v Nastavení → Dárkové poukazy (potřebuje číslo účtu salonu). Stránka `/poukaz` (na veřejné adrese
`SALON_PUBLIC_ORIGIN`, jde vložit do WordPressu přes iframe stejně jako rezervace) nabídne nastavené částky, vlastní
částku od zvoleného minima a poukazy na ošetření s cenou. Kupující vyplní jméno a e-mail a zaplatí QR platbou
(variabilní symbol začíná 9, splatnost 5 dní). Objednávka čeká v části Poukazy jako „Čeká na platbu“ a kód poukazu
se kupujícímu neukáže, ani ho nejde uplatnit. Když peníze dorazí, salon klikne na Platba přišla: poukaz začne platit
ode dneška, vznikne účtenka (QR, zaplaceno) a kupující dostane e-mailem odkaz na poukaz k vytištění nebo uložení do PDF.
Nezaplacenou objednávku salon zruší tlačítkem Zrušit objednávku.

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
