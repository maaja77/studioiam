#!/usr/bin/env bash
# Obnova ze zálohy.
#   selfhost/zaloha/obnovit.sh --test [salon]            zkušební obnova do dočasné složky, kontrola a smazání
#   selfhost/zaloha/obnovit.sh <salon> <cíl> [snapshot]   obnova do prázdné složky <cíl> (výchozí snapshot: latest)
#   selfhost/zaloha/obnovit.sh --seznam                    přehled záloh
# <salon> je název složky instalace (např. studioiam). Obnovená složka je připravená jako "data" pro docker compose.
source "$(dirname "$0")/common.sh"
check() { # kontrola obnovené databáze: integrita a počty záznamů
  python3 - "$1/salon.sqlite" <<'PY'
import sqlite3,sys
db=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok','Databáze je poškozená'
assert not db.execute('PRAGMA foreign_key_check').fetchall(),'Nesedí vazby v databázi'
tables=[r[0] for r in db.execute("select name from sqlite_master where type='table' and name in ('clients','visits','photos','bookings','receipts','vouchers')")]
print('Databáze v pořádku: '+', '.join(f'{t} {db.execute(f"select count(*) from {t}").fetchone()[0]}' for t in sorted(tables)))
PY
  local missing=0
  while read -r key; do [[ -f $1/objects/$key ]] || { echo "Chybí fotka $key" >&2; missing=$((missing+1)); }; done < <(python3 -c "import sqlite3,sys;[print(r[0]) for r in sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True).execute('select object_key from photos')]" "$1/salon.sqlite")
  (( missing == 0 )) || { echo "Chybějící fotky: $missing." >&2; return 1; }
  echo "Fotky v pořádku: $(find "$1/objects" -type f 2>/dev/null | wc -l) souborů."
}
restore() { # $1 salon, $2 cíl, $3 snapshot
  mkdir -p "$2"; [[ -z $(ls -A "$2") ]] || { echo "Cílová složka $2 není prázdná." >&2; exit 1; }
  RESTIC_MOUNTS=(-v "$2":/obnova)
  local snap=${3:-latest}; [[ $snap == latest ]] && snap="latest --tag $1"
  # shellcheck disable=SC2086
  restic restore $snap --target /obnova
  # restic obnoví celou cestu /zaloha/<salon>; přesuneme obsah o úroveň výš a databázi pojmenujeme jako živou.
  shopt -s dotglob; mv "$2/zaloha/$1"/* "$2"/; rm -rf "$2/zaloha"; shopt -u dotglob
  mv "$2/zaloha-noc.sqlite" "$2/salon.sqlite"
  # Kopie .env.selfhost ze zálohy zůstane vedle dat pod jiným jménem, aplikace ji nečte.
  [[ -f $2/zaloha-env.selfhost ]] && mv "$2/zaloha-env.selfhost" "$2/env.selfhost-ze-zalohy"
  chown -R 1000:1000 "$2" 2>/dev/null || true; chmod -R go-rwx "$2"
}
case ${1:-} in
  --seznam) restic snapshots ;;
  --test)
    salon=${2:-$(basename "$(echo $SALON_DIRS | cut -d' ' -f1)")}; tmp=$(mktemp -d)
    trap 'rm -rf "$tmp"' EXIT
    restore "$salon" "$tmp/data"; check "$tmp/data"; echo "Zkušební obnova salonu $salon proběhla v pořádku." ;;
  ""|-h|--help) sed -n 2,6p "$0" ;;
  *) [[ -n ${2:-} ]] || { sed -n 2,6p "$0"; exit 1; }
     restore "$1" "$2" "${3:-latest}"; check "$2"
     echo "Obnoveno do $2. Pro použití: docker compose down, přesunout starou složku data jinam, $2 přejmenovat na data, docker compose up -d. Při stavbě nového serveru je v $2/env.selfhost-ze-zalohy původní .env.selfhost." ;;
esac
