#!/usr/bin/env bash
# Run docker compose for this repo with BuildKit temp on the data disk (same defaults as docker-smoke.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK_ROOT="${PDFAF_DOCKER_WORK_ROOT:-/mnt/docker-data/pdfaf-docker-work}"
export DOCKER_TMPDIR="${WORK_ROOT}/buildkit-tmp"

if ! mkdir -p "$DOCKER_TMPDIR" "$WORK_ROOT/compose" 2>/dev/null; then
  echo "Could not create ${WORK_ROOT}. Run: sudo ./scripts/setup-docker-datadisk-workdir.sh" >&2
  exit 1
fi

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-pdfafv2}"
export DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-1}"

cd "$ROOT"
exec docker compose -f "$ROOT/docker-compose.yml" "$@"
