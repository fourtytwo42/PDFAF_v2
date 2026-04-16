#!/usr/bin/env bash
# One-time: create writable dirs on the data disk for DOCKER_TMPDIR / compose project files.
# Default matches scripts/docker-smoke.sh and scripts/docker-compose-pdfaf.sh.
#
# Usage (from repo root):
#   sudo ./scripts/setup-docker-datadisk-workdir.sh
#   sudo PDFAF_DOCKER_WORK_ROOT=/mnt/docker-data/my-pdfaf ./scripts/setup-docker-datadisk-workdir.sh
set -euo pipefail

TARGET="${PDFAF_DOCKER_WORK_ROOT:-/mnt/docker-data/pdfaf-docker-work}"

if [[ "${1:-}" != "" ]]; then
  TARGET="$1"
fi

if [[ $EUID -ne 0 ]]; then
  exec sudo "$0" "${TARGET}"
fi

if [[ -z "${SUDO_UID:-}" || -z "${SUDO_GID:-}" ]]; then
  echo "Run this script with sudo from a normal user (so SUDO_UID/GID are set), e.g. sudo $0" >&2
  exit 1
fi

mkdir -p "${TARGET}/buildkit-tmp" "${TARGET}/compose"
chown -R "${SUDO_UID}:${SUDO_GID}" "${TARGET}"
chmod u+rwx "${TARGET}" "${TARGET}/buildkit-tmp" "${TARGET}/compose"

echo "OK: ${TARGET}/buildkit-tmp and ${TARGET}/compose owned by uid ${SUDO_UID}."
echo "Docker Engine layers: see Docker Root Dir (expect /mnt/docker-data/docker if daemon.json is set)."
echo "If builds fail with no space under /var/lib/containerd while / is small, run once:"
echo "  sudo ./scripts/move-containerd-root-to-datadisk.sh"
echo "Optional: sudo usermod -aG docker ${SUDO_USER:-$(logname 2>/dev/null || true)}  then re-login or newgrp docker"
