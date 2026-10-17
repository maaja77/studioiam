#!/usr/bin/env bash
# Noční šifrovaná záloha všech instalací do úložiště mimo server (restic).
# Databáze se zkopíruje konzistentně za běhu (VACUUM INTO), fotky a logo se přidají ze složky data.
# Spouští systemd časovač (viz nainstalovat.sh), ručně: sudo selfhost/zaloha/zalohovat.sh
source "$(dirname "$0")/common.sh"
ping_hc /start
trap 'ping_hc /fail' ERR
restic cat config >/dev/null 2>&1 || { echo "Zakládám nové úložiště záloh $RESTIC_REPOSITORY"; restic init; }
failed=0
for dir in $SALON_DIRS; do
  name=$(basename "$dir"); data="$dir/data"
  [[ -f $dir/compose.yaml && -d $data ]] || { echo "Přeskakuji $dir (chybí compose.yaml nebo data)." >&2; failed=1; continue; }
  echo "== $name"
  rm -f "$data/zaloha-noc.sqlite"
  # Přihlašovací a e-mailové nastavení se zálohuje taky (šifrovaně), aby šel server postavit znovu.
  [[ -f $dir/.env.selfhost ]] && install -m 600 "$dir/.env.selfhost" "$data/zaloha-env.selfhost"
  docker compose -f "$dir/compose.yaml" exec -T salon node -e "new (require('node:sqlite').DatabaseSync)('/app/data/salon.sqlite').exec(\"VACUUM INTO '/app/data/zaloha-noc.sqlite'\")"
  RESTIC_MOUNTS=(-v "$data":/zaloha/"$name":ro)
  restic backup /zaloha/"$name" --tag "$name" --exclude /zaloha/"$name"/salon.sqlite --exclude '/zaloha/'"$name"'/salon.sqlite-*' --exclude '*.tmp'
  rm -f "$data/zaloha-noc.sqlite" "$data/zaloha-env.selfhost"
done
RESTIC_MOUNTS=()
restic forget --group-by host,tags --keep-daily "${KEEP_DAILY:-14}" --keep-weekly "${KEEP_WEEKLY:-8}" --keep-monthly "${KEEP_MONTHLY:-12}" --prune
# V neděli kontrola úložiště včetně části dat.
[[ $(date +%u) == 7 ]] && restic check --read-data-subset=10%
restic snapshots --latest 1 --compact
(( failed == 0 )) || { echo "Některé instalace se nezazálohovaly, viz výše." >&2; ping_hc /fail; exit 1; }
ping_hc ''
echo "Záloha hotová."
