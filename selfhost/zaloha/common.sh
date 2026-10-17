# Společné funkce pro zálohy (načítá se ze zalohovat.sh a obnovit.sh).
set -euo pipefail
CONF=${SALON_ZALOHA_CONF:-/etc/salon-zaloha.env}
RESTIC_IMAGE=${RESTIC_IMAGE:-restic/restic:0.17.3}
CACHE=${RESTIC_CACHE:-/var/cache/salon-restic}
[[ -r $CONF ]] || { echo "Chybí $CONF (vzor: selfhost/zaloha/zaloha.env.example)." >&2; exit 1; }
set -a; source "$CONF"; set +a
[[ -n ${RESTIC_PASSWORD:-} && -n ${RESTIC_REPOSITORY:-} ]] || { echo "V $CONF vyplňte RESTIC_PASSWORD a RESTIC_REPOSITORY." >&2; exit 1; }
mkdir -p "$CACHE"
# restic běží v kontejneru, na serveru ho není potřeba instalovat; pevné jméno stroje drží zálohy pohromadě.
restic() { docker run --rm -i --hostname salon-zaloha --env-file "$CONF" -e RESTIC_CACHE_DIR=/cache -v "$CACHE":/cache "${REPO_MOUNT[@]}" "${RESTIC_MOUNTS[@]}" "$RESTIC_IMAGE" "$@"; }
RESTIC_MOUNTS=(); REPO_MOUNT=()
# Úložiště jako cesta na tomto stroji (např. připojený disk NAS): zpřístupní se kontejneru se stejnou cestou.
if [[ $RESTIC_REPOSITORY == /* ]]; then mkdir -p "$RESTIC_REPOSITORY"; REPO_MOUNT=(-v "$RESTIC_REPOSITORY":"$RESTIC_REPOSITORY"); fi
ping_hc() { [[ -n ${HEALTHCHECK_URL:-} ]] && curl -fsS -m 10 --retry 3 -o /dev/null "$HEALTHCHECK_URL$1" || true; }
