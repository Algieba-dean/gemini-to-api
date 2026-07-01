#!/usr/bin/env bash
#
# install-systemd.sh — install a systemd service + timer that periodically runs
# scripts/auto-update.sh from this repository. Paths are derived automatically,
# so nothing is hardcoded.
#
# Usage:  sudo bash scripts/install-systemd.sh [interval]
#   interval  systemd time span for the update cadence (default: 30min)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INTERVAL="${1:-30min}"
UNIT_DIR="/etc/systemd/system"

cat > "${UNIT_DIR}/gemini-update.service" <<EOF
[Unit]
Description=Auto-update gemini-web2api from git and rebuild Docker stack
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=${REPO_DIR}
ExecStart=/usr/bin/bash ${REPO_DIR}/scripts/auto-update.sh
EOF

cat > "${UNIT_DIR}/gemini-update.timer" <<EOF
[Unit]
Description=Run gemini-web2api auto-update periodically

[Timer]
OnBootSec=5min
OnUnitActiveSec=${INTERVAL}
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now gemini-update.timer

echo "Installed gemini-update.timer (interval: ${INTERVAL}, repo: ${REPO_DIR})"
systemctl list-timers gemini-update.timer --no-pager
