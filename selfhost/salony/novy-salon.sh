#!/usr/bin/env bash
# Založí instalaci pro další salon: vlastní složku s daty, .env, heslo a port.
# Použití: selfhost/salony/novy-salon.sh <zkratka> <adresa>
#   např.  selfhost/salony/novy-salon.sh lucie https://lucie.mojesalony.cz
# Předpoklad: obraz sestavený příkazem selfhost/salony/aktualizovat.sh (nebo docker build, viz README).
set -euo pipefail
SALONY_DIR=${SALONY_DIR:-/srv/salony}
IMAGE=${SALON_IMAGE:-studioiam-salon:latest}
slug=${1:-}; origin=${2:-}
if [[ ! $slug =~ ^[a-z0-9][a-z0-9-]{1,30}$ ]]; then echo "Zkratka salonu: malá písmena, číslice a pomlčky (např. lucie)." >&2; exit 1; fi
if [[ ! $origin =~ ^https://[a-z0-9.-]+$ ]]; then echo "Adresa musí začínat https:// a být bez lomítka na konci (např. https://$slug.mojesalony.cz)." >&2; exit 1; fi
dir=$SALONY_DIR/$slug
if [[ -e $dir ]]; then echo "Salon $slug už existuje ($dir)." >&2; exit 1; fi
docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo "Chybí obraz $IMAGE. Nejdřív spusťte selfhost/salony/aktualizovat.sh." >&2; exit 1; }

# Volný port: o jedna vyšší než nejvyšší použitý, začíná se na 8801.
port=8801
for f in "$SALONY_DIR"/*/.port; do [[ -f $f ]] && (( $(cat "$f") >= port )) && port=$(( $(cat "$f") + 1 )); done

password=$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')  # 24 náhodných znaků
hash=$(printf '%s' "$password" | docker run --rm -i --network none "$IMAGE" node -e "const {randomBytes,scryptSync}=require('node:crypto');let p='';process.stdin.on('data',c=>p+=c).on('end',()=>{const s=randomBytes(16).toString('hex');console.log(s+':'+scryptSync(p,s,64).toString('hex'));});")

umask 077
mkdir -p "$dir/data"
chown 1000:1000 "$dir/data" 2>/dev/null || true  # v kontejneru běží uživatel node (UID 1000)
echo "$port" >"$dir/.port"
cat >"$dir/.env.selfhost" <<ENV
SALON_USER=$slug
SALON_PASSWORD_HASH=$hash
SALON_ORIGIN=$origin
SALON_PROFILE=generic
SALON_PUBLIC_ORIGIN=
# E-maily (potvrzení rezervací a účtenky). Bez nich aplikace funguje, jen nic neodesílá.
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SALON_NOTIFY_EMAIL=
SALON_BOOKING_FRAME_ANCESTORS=
ENV
cat >"$dir/compose.yaml" <<YAML
name: salon-$slug
services:
  salon:
    image: $IMAGE
    restart: unless-stopped
    env_file: .env.selfhost
    ports:
      - "127.0.0.1:$port:8787"
    volumes:
      - ./data:/app/data
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    mem_limit: 512m
YAML
docker compose -f "$dir/compose.yaml" up -d
for _ in $(seq 1 20); do curl -fsS -o /dev/null "http://127.0.0.1:$port/prihlaseni" 2>/dev/null && break; sleep 1; done
curl -fsS -o /dev/null "http://127.0.0.1:$port/prihlaseni" || { echo "Salon neodpovídá, zkontrolujte: docker compose -f $dir/compose.yaml logs" >&2; exit 1; }

host=${origin#https://}
cat <<INFO

Salon $slug běží na portu $port.
  Administrace:  $origin
  Rezervace:     $origin/rezervace
  Jméno:         $slug
  Heslo:         $password   (předejte bezpečně, zákaznice si ho změní v Nastavení)

Do Caddyfile doplňte a načtěte (caddy reload):
$host {
	reverse_proxy 127.0.0.1:$port
}

Do zálohování ho přidáte v /etc/salon-zaloha.env: do SALON_DIRS připište $dir
INFO
