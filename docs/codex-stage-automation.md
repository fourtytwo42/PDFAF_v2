# Codex Stage Automation

This harness lets a lead coordinator trigger bounded Codex CLI workers for the staged PDFAF improvement loop.

## Dry Run

Use this first to inspect the generated coordinator prompt and metadata without launching Codex:

```bash
pnpm run agent:dry-run -- --stage 82 --mode diagnostic-first
```

Dry-run output is written under `Output/agent-runs/` and is not meant to be committed.

## Real Run

```bash
pnpm run agent:improve-accessibility -- \
  --stage 82 \
  --mode diagnostic-first \
  --corpora legacy,v1-edge \
  --max-iterations 1
```

## Continuous Run

Use this when you want the coordinator to run the next stage automatically after the previous one completes:

```bash
pnpm run agent:continuous -- \
  --stage 82 \
  --max-stages 3 \
  --max-iterations 1 \
  --poll-seconds 30
```

Continuous mode increments the stage number after a completed worker run. It stops when a worker reports `blocked`, `rejected`, `acceptance_ready`, or `safe_to_implement`, or when the final summary is missing/unparseable. That keeps the loop from running past a point that needs a deliberate decision.

The runner:

- checks for tracked dirty files unless `--allow-dirty` is passed;
- records local LLM/listener status before launching Codex;
- calls `codex exec` with `--sandbox danger-full-access` and `--ask-for-approval never`;
- passes `schemas/codex-stage-decision.schema.json` as the final response contract;
- writes prompt, JSONL event log, stderr, and final summary to `Output/agent-runs/`;
- prints heartbeat status while a Codex worker is still running;
- fails if generated artifact paths are staged after the Codex run.

## Guardrails

The coordinator prompt tells workers to:

- read `AGENTS.md` and latest stage evidence first;
- prefer diagnostics before implementation;
- preserve Stage 75 font gains and Stage 78 p95/false-positive wins;
- avoid route guards, scorer/gate changes, filename skips, and benchmark-only inflation unless explicitly justified;
- commit and push only source/docs/tests, never generated PDFs/reports/artifacts.

The runner is intentionally not a blind auto-loop. Use `--max-iterations` sparingly and inspect the final `iteration-N-summary.json` before deciding whether to continue.
