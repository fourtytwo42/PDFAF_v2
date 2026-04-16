#!/usr/bin/env bash
# Remediate PDFs via the Docker-hosted API (default http://127.0.0.1:6200).
# Default input dir: Input/from_sibling_pdfaf (PDFs copied from sibling ../pdfaf).
#
# Usage (repo root):
#   ./scripts/docker-remediate-input-dir.sh
#   ./scripts/docker-remediate-input-dir.sh /path/to/pdfs
#   PDFAF_DOCKER_BASE_URL=http://127.0.0.1:6200 ./scripts/docker-remediate-input-dir.sh
#
# If /v1/health fails, runs: docker compose -f docker-compose.yml up -d
# (same DOCKER_TMPDIR / compose project defaults as docker-compose-pdfaf.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKDIR="${PDFAF_DOCKER_WORK_ROOT:-/mnt/docker-data/pdfaf-docker-work}"
export DOCKER_TMPDIR="${WORKDIR}/buildkit-tmp"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-pdfafv2}"
export DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-1}"

INDIR="${1:-$ROOT/Input/from_sibling_pdfaf}"
BASE_URL="${PDFAF_DOCKER_BASE_URL:-http://127.0.0.1:6200}"

if ! mkdir -p "$DOCKER_TMPDIR" "$WORKDIR/compose" 2>/dev/null; then
  echo "Could not create $WORKDIR — run: sudo ./scripts/setup-docker-datadisk-workdir.sh" >&2
  exit 1
fi

if docker compose version &>/dev/null; then
  DC=(docker compose)
else
  DC=(docker-compose)
fi

if ! curl -sf "${BASE_URL}/v1/health" &>/dev/null; then
  echo "[docker-remediate] API not up; starting stack…"
  (cd "$ROOT" && "${DC[@]}" -f "$ROOT/docker-compose.yml" up -d)
  for i in $(seq 1 120); do
    if curl -sf "${BASE_URL}/v1/health" &>/dev/null; then
      echo "[docker-remediate] API is up."
      break
    fi
    if [[ "$i" -eq 120 ]]; then
      echo "[docker-remediate] Timed out waiting for ${BASE_URL}/v1/health" >&2
      "${DC[@]}" -f "$ROOT/docker-compose.yml" ps || true
      exit 1
    fi
    sleep 2
  done
fi

mapfile -t pdfs < <(find "$INDIR" -maxdepth 1 -type f -name '*.pdf' 2>/dev/null | sort)
if [[ "${#pdfs[@]}" -eq 0 ]]; then
  echo "No PDFs in $INDIR" >&2
  exit 1
fi

OUT="${PDFAF_DOCKER_REMEDIATE_OUT:-$ROOT/Output/docker-remediate-runs}"
mkdir -p "$OUT"
ts="$(date +%Y%m%d-%H%M%S)"
run_dir="$OUT/run-$ts"
mkdir -p "$run_dir"

for pdf in "${pdfs[@]}"; do
  bn="$(basename "$pdf")"
  echo "=== $bn"
  code="$(curl -sS -o "$run_dir/${bn}.remediate.json" -w '%{http_code}' \
    -F "file=@${pdf}" "${BASE_URL}/v1/remediate" || echo "000")"
  echo "  HTTP $code  -> $run_dir/${bn}.remediate.json"
  python3 -c "
import json, sys
p = sys.argv[1]
try:
    d = json.load(open(p, encoding='utf-8'))
except Exception as e:
    print(f'  (parse error: {e})')
    sys.exit(0)
if isinstance(d, dict) and 'error' in d:
    print('  error:', d.get('error'))
elif isinstance(d, dict):
    b, a = d.get('before') or {}, d.get('after') or {}
    print('  before score', b.get('score'), ' after', a.get('score'), ' grade', a.get('grade'), ' improved', d.get('improved'))
" "$run_dir/${bn}.remediate.json" 2>/dev/null || true
done

echo "[docker-remediate] Done. JSON under $run_dir"
