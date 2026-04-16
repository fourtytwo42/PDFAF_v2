#!/usr/bin/env bash
# Build and smoke-test the Docker stack. Keeps BuildKit temp and compose state on the data disk
# when PDFAF_DOCKER_WORK_ROOT is set (default /mnt/docker-data/pdfaf-docker-work).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WORK_ROOT="${PDFAF_DOCKER_WORK_ROOT:-/mnt/docker-data/pdfaf-docker-work}"
export DOCKER_TMPDIR="${WORK_ROOT}/buildkit-tmp"
if ! mkdir -p "$DOCKER_TMPDIR" "$WORK_ROOT/compose" 2>/dev/null; then
  echo "[docker-smoke] Could not mkdir $WORK_ROOT (try: sudo mkdir -p $WORK_ROOT && sudo chown \"\$USER\" $WORK_ROOT)" >&2
  exit 1
fi

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-pdfafv2}"
export DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-1}"

echo "[docker-smoke] Using DOCKER_TMPDIR=$DOCKER_TMPDIR (keep large layers off a full OS disk)."

if docker compose version &>/dev/null; then
  DC=(docker compose)
else
  DC=(docker-compose)
fi

# Build llm (baked GGUF) + API image; pdfaf depends_on llm.
"${DC[@]}" -f "$ROOT/docker-compose.yml" build llm pdfaf

"${DC[@]}" -f "$ROOT/docker-compose.yml" up -d

echo "[docker-smoke] Waiting for API health (LLM weights are baked into the llm image; cold start is server load only)…"
for i in $(seq 1 180); do
  if curl -sf "http://127.0.0.1:6200/v1/health" >/dev/null; then
    echo "[docker-smoke] API is up."
    break
  fi
  if [[ "$i" -eq 180 ]]; then
    echo "[docker-smoke] Timed out waiting for health." >&2
    "${DC[@]}" -f "$ROOT/docker-compose.yml" ps
    exit 1
  fi
  sleep 2
done

PDFAF_DIR="${PDFAF_DIR:-$HOME/pdfaf}"
mapfile -t PDFS < <(find "$PDFAF_DIR" -maxdepth 3 -type f -name '*.pdf' -size -25M 2>/dev/null | head -3)
if [[ "${#PDFS[@]}" -eq 0 ]]; then
  echo "[docker-smoke] No PDFs under $PDFAF_DIR — place sample PDFs there or set PDFAF_DIR." >&2
  exit 1
fi

for pdf in "${PDFS[@]}"; do
  echo "[docker-smoke] --- $pdf"
  echo -n "  analyze: "
  curl -sS -o /tmp/pdfaf-smoke-analyze.json -w "%{http_code}" \
    -F "file=@${pdf}" "http://127.0.0.1:6200/v1/analyze" | tail -1
  echo
  python3 - <<'PY' 2>/dev/null || true
import json,sys
try:
  d=json.load(open("/tmp/pdfaf-smoke-analyze.json"))
  print("    score", d.get("score"), "grade", d.get("grade"))
except Exception as e:
  print("    (could not parse JSON)", e)
PY

  echo -n "  remediate (defaults = semantic on in compose): "
  curl -sS -o /tmp/pdfaf-smoke-remediate.json -w "%{http_code}" \
    -F "file=@${pdf}" "http://127.0.0.1:6200/v1/remediate" | tail -1
  echo
  python3 - <<'PY' 2>/dev/null || true
import json
try:
  d=json.load(open("/tmp/pdfaf-smoke-remediate.json"))
  print("    after score", (d.get("after") or {}).get("score"), "semantic" in d, "semanticHeadings" in d)
except Exception as e:
  print("    (could not parse JSON)", e)
PY

  echo -n "  remediate semantic off override: "
  curl -sS -o /tmp/pdfaf-smoke-off.json -w "%{http_code}" \
    -F "options={\"semantic\":false,\"semanticHeadings\":false}" \
    -F "file=@${pdf}" "http://127.0.0.1:6200/v1/remediate" | tail -1
  echo
done

echo "[docker-smoke] Done. Stack still running; from repo root run: ${DC[0]} ${DC[1]} -f docker-compose.yml down"
