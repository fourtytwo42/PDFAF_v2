#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
exec npx -y node@22 node_modules/tsx/dist/cli.mjs scripts/codex-evolve-runner.ts "$@"
