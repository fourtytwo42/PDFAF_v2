#!/usr/bin/env bash
# One-time (run with sudo): keep containerd's root on the data disk.
#
# Docker "data-root" on /mnt/docker-data/docker is not enough by itself: image export / diff
# still uses /var/lib/containerd (ingest + tmpmounts). A ~3 GiB layer can fill a small OS LV
# during "exporting layers" even when DOCKER_TMPDIR points at /mnt/docker-data.
#
# This script rsyncs /var/lib/containerd -> PDFAF_CONTAINERD_ROOT (default /mnt/docker-data/containerd-root),
# replaces the directory with a bind mount, and adds an /etc/fstab line so it survives reboot.
#
# Usage:
#   sudo ./scripts/move-containerd-root-to-datadisk.sh
#   sudo PDFAF_CONTAINERD_ROOT=/mnt/docker-data/containerd-root ./scripts/move-containerd-root-to-datadisk.sh
set -euo pipefail

SRC=/var/lib/containerd
DST="${PDFAF_CONTAINERD_ROOT:-/mnt/docker-data/containerd-root}"
FSTAB_LINE="${DST} ${SRC} none bind 0 0"

if [[ $EUID -ne 0 ]]; then
  exec sudo -E bash "$0" "$@"
fi

if ! mountpoint -q /mnt/docker-data; then
  echo "error: /mnt/docker-data is not a mountpoint — mount the data disk first." >&2
  exit 1
fi

if mountpoint -q "$SRC"; then
  cur="$(findmnt -n -o SOURCE --target "$SRC" 2>/dev/null || true)"
  if [[ "$cur" == "$DST" ]]; then
    echo "OK: $SRC is already bind-mounted from $DST."
    exit 0
  fi
  echo "error: $SRC is already a mountpoint (source: $cur). Resolve manually." >&2
  exit 1
fi

mkdir -p "$DST"

echo "Stopping Docker and containerd…"
systemctl stop docker docker.socket 2>/dev/null || true
systemctl stop containerd 2>/dev/null || true

if [[ -d "$SRC" ]] && [[ -n "$(ls -A "$SRC" 2>/dev/null || true)" ]]; then
  echo "Syncing $SRC/ -> $DST/ (may take a while)…"
  rsync -aHAXx --numeric-ids "${SRC}/" "${DST}/"
  bak="${SRC}.bak.$(date +%Y%m%d%H%M%S)"
  echo "Renaming $SRC -> $bak"
  mv "$SRC" "$bak"
  echo "If Docker starts cleanly, you may delete $bak after a few days."
fi

mkdir -p "$SRC"
mount --bind "$DST" "$SRC"

if ! grep -qF "$FSTAB_LINE" /etc/fstab; then
  echo "Adding fstab entry for bind mount."
  printf '%s\n' "$FSTAB_LINE" >>/etc/fstab
fi

echo "Starting containerd and Docker…"
systemctl start containerd docker

echo "Done. Verify: findmnt $SRC ; docker info | grep -i root"
