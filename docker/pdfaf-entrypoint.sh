#!/bin/sh
set -e
# Writable DB + upload temp live on the Docker volume (/data), which should live on the data disk
# when Docker's data-root points there.
mkdir -p /data/tmp
mkdir -p "${PDFAF_LLAMA_WORKDIR:-/app/data/llama-work}"

if [ "${PDFAF_RESET_LEARNED_DB_ON_BOOT:-0}" = "1" ]; then
  marker="${PDFAF_RESET_LEARNED_DB_MARKER:-/data/.pdfaf-engine-v2-db-reset-complete}"
  if [ ! -f "$marker" ]; then
    db_path="${DB_PATH:-/data/pdfaf.db}"
    db_dir="$(dirname "$db_path")"
    ts="$(date -u +%Y%m%dT%H%M%SZ)"
    backup_dir="${db_dir}/backups/${ts}"
    mkdir -p "$backup_dir"
    mv "$db_path" "${db_path}-shm" "${db_path}-wal" "$backup_dir"/ 2>/dev/null || true
    touch "$marker"
    echo "PDFAF learned DB state archived to ${backup_dir}; a fresh DB will be initialized."
  fi
fi

exec "$@"
