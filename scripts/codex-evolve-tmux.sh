#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/codex-evolve-tmux.sh --session <name> [--log-dir <dir>] -- [codex-evolve options]

Starts scripts/codex-evolve.sh inside a detached tmux session and mirrors output
to a timestamped log file.

Example:
  ./scripts/codex-evolve-tmux.sh --session pdfaf-evolve-111 -- --stage 111 --batch-size 10
EOF
}

SESSION=""
LOG_DIR="Output/agent-runs"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --session)
      SESSION="${2:-}"
      shift 2
      ;;
    --log-dir)
      LOG_DIR="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      echo "Unknown wrapper option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$SESSION" ]]; then
  echo "--session is required" >&2
  usage >&2
  exit 2
fi

if [[ ! "$SESSION" =~ ^[A-Za-z0-9_.-]+$ ]]; then
  echo "--session may contain only letters, numbers, dots, underscores, and hyphens" >&2
  exit 2
fi

if [[ $# -eq 0 ]]; then
  echo "codex-evolve options are required after --" >&2
  usage >&2
  exit 2
fi

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is not installed or not on PATH" >&2
  exit 1
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "tmux session already exists: $SESSION" >&2
  echo "Attach with: tmux attach -t $SESSION" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
quoted_args=()
for arg in "$@"; do
  quoted_args+=("$(printf '%q' "$arg")")
done

quoted_root="$(printf '%q' "$ROOT")"
quoted_log_dir="$(printf '%q' "$LOG_DIR")"
quoted_session="$(printf '%q' "$SESSION")"
command_text="
set -o pipefail
cd $quoted_root
log_dir=$quoted_log_dir
session_name=$quoted_session
mkdir -p \"\$log_dir\"
log=\"\$log_dir/\$session_name-\$(date -u +%Y%m%dT%H%M%SZ).log\"
echo \"Codex evolve tmux session: \$session_name\"
echo \"Started: \$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
echo \"Log: \$log\"
./scripts/codex-evolve.sh ${quoted_args[*]} 2>&1 | tee \"\$log\"
status=\${PIPESTATUS[0]}
echo \"Exited with status \$status at \$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
echo \"Attach command was: tmux attach -t \$session_name\"
exec bash
"

tmux new-session -d -s "$SESSION" "bash -lc $(printf '%q' "$command_text")"

echo "Started tmux session: $SESSION"
echo "Attach with: tmux attach -t $SESSION"
echo "Detach with: Ctrl-b then d"
