#!/bin/sh
set -e
# Writable DB + upload temp live on the Docker volume (/data), which should live on the data disk
# when Docker's data-root points there.
mkdir -p /data/tmp
mkdir -p "${PDFAF_LLAMA_WORKDIR:-/app/data/llama-work}"
exec "$@"
