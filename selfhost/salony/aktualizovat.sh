#!/usr/bin/env bash
# Aktualizuje všechny salony v SALONY_DIR na verzi z tohoto repozitáře.
# Před restartem každého salonu uloží zálohu jeho dat do $SALONY_DIR/_zalohy (posledních 10 na salon).
# Použití (ze složky repozitáře po git pull): selfhost/salony/aktualizovat.sh
set -euo pipefail
SALONY_DIR=${SALONY_DIR:-/srv/salony}
IMAGE=${SALON_IMAGE:-studioiam-salon:latest}
cd "$(dirname "$0")/../.."
docker build -f Dockerfile.selfhost -t "$IMAGE" .
mkdir -p "$SALONY_DIR/_zalohy"; chmod 700 "$SALONY_DIR/_zalohy"
stamp=$(date +%Y-%m-%d-%H%M)
for dir in "$SALONY_DIR"/*/; do
  slug=$(basename "$dir"); [[ $slug == _* || ! -f $dir/compose.yaml ]] && continue
  echo "== $slug"
  # Konzistentní kopie databáze za běhu (VACUUM INTO), pak archiv s fotkami.
  if docker compose -f "$dir/compose.yaml" exec -T salon node -e "require('node:sqlite');new (require('node:sqlite').DatabaseSync)('/app/data/salon.sqlite').exec(\"VACUUM INTO '/app/data/zaloha.sqlite'\")" 2>/dev/null; then
    tar -C "$dir/data" -czf "$SALONY_DIR/_zalohy/$slug-$stamp.tar.gz" --exclude=salon.sqlite --exclude='salon.sqlite-*' .
    rm -f "$dir/data/zaloha.sqlite"
  else
    echo "   salon neběží, zálohuji soubory přímo"
    tar -C "$dir/data" -czf "$SALONY_DIR/_zalohy/$slug-$stamp.tar.gz" .
  fi
  ls -1t "$SALONY_DIR/_zalohy/$slug-"*.tar.gz | tail -n +11 | xargs -r rm -f
  docker compose -f "$dir/compose.yaml" up -d
done
docker image prune -f >/dev/null
echo "Hotovo. Zálohy: $SALONY_DIR/_zalohy"
