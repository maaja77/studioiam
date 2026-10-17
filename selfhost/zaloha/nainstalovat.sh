#!/usr/bin/env bash
# Nastaví automatické zálohy přes systemd: každou noc ve 2:30 záloha, 1. den v měsíci zkušební obnova.
# Použití: sudo selfhost/zaloha/nainstalovat.sh
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
[[ -r /etc/salon-zaloha.env ]] || { echo "Nejdřív vytvořte /etc/salon-zaloha.env podle $here/zaloha.env.example (chmod 600)." >&2; exit 1; }
chmod 600 /etc/salon-zaloha.env
cat >/etc/systemd/system/salon-zaloha.service <<UNIT
[Unit]
Description=Záloha salonu (restic)
Wants=network-online.target docker.service
After=network-online.target docker.service
[Service]
Type=oneshot
ExecStart=$here/zalohovat.sh
UNIT
cat >/etc/systemd/system/salon-zaloha.timer <<UNIT
[Unit]
Description=Noční záloha salonu
[Timer]
OnCalendar=*-*-* 02:30
RandomizedDelaySec=15min
Persistent=true
[Install]
WantedBy=timers.target
UNIT
cat >/etc/systemd/system/salon-zaloha-test.service <<UNIT
[Unit]
Description=Zkušební obnova zálohy salonu
After=salon-zaloha.service
[Service]
Type=oneshot
ExecStart=$here/obnovit.sh --test
UNIT
cat >/etc/systemd/system/salon-zaloha-test.timer <<UNIT
[Unit]
Description=Měsíční zkušební obnova zálohy salonu
[Timer]
OnCalendar=*-*-01 05:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now salon-zaloha.timer salon-zaloha-test.timer
echo "Hotovo. První zálohu spustíte hned: sudo systemctl start salon-zaloha && journalctl -u salon-zaloha -n 30"
