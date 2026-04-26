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
./scripts/codex-stage.sh --continuous \
  --stage 82 \
  --max-stages 3 \
  --max-iterations 1 \
  --parked-pivot-after 2 \
  --parked-repeat-limit 4 \
  --poll-seconds 30
```

Continuous mode increments the stage number after a completed worker run. If a worker reports `blocked` or `safe_to_implement`, the runner reruns that same stage once with `--model-policy xhigh` only when the worker explicitly asks for xhigh and the requested work matches an approved xhigh task class. Use `--no-auto-escalate` to disable that behavior. When a blocked stage recommends pivoting, parks a topic, or finds no safe behavior change for that family, the runner continues and injects a pivot directive into the next stage objective. When diagnostic stages keep parking the same topic, the runner also injects a pivot directive. It stops only if the topic keeps repeating past `--parked-repeat-limit`, or on unapproved xhigh requests, `rejected`, `acceptance_ready`, hard `blocked`, repeated `safe_to_implement`, or missing/unparseable summaries.
The `scripts/codex-stage.sh` wrapper runs the TypeScript runner under Node 22 directly, which avoids the pnpm unsupported-engine warning in the live terminal.

## Evolve Run

Use the evolve runner when you want the system to keep improving the engine over repeated bounded stage batches. It wraps `codex-stage.sh`; each batch still uses the same stage guardrails, model policy, xhigh task allowlist, commit rules, and artifact protections.

Start one 10-stage evolution batch:

```bash
./scripts/codex-evolve.sh \
  --stage 92 \
  --batch-size 10 \
  --parked-pivot-after 2 \
  --parked-repeat-limit 4 \
  --topic-cooldown-stages 8 \
  --pull-v1-when-needed \
  --visual-gate \
  --protected-baseline-run Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7
```

Run indefinitely in bounded batches:

```bash
./scripts/codex-evolve.sh \
  --forever \
  --batch-size 10 \
  --parked-pivot-after 2 \
  --parked-repeat-limit 4 \
  --topic-cooldown-stages 8 \
  --sleep-seconds 300 \
  --pull-v1-when-needed \
  --visual-gate \
  --protected-baseline-run Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7
```

The evolve runner:

- defaults the starting stage to the latest `Output/agent-runs/stage*` directory plus one, unless `--stage` is supplied;
- checks for tracked dirty files unless `--allow-dirty` is passed;
- prints disk and local LLM/listener status before starting;
- reads recent stage summaries, puts recently parked topics on cooldown, and injects a target-family directive into each batch objective;
- tells workers to preserve speed, avoid regressions, keep PDFs visually stable, and reject/revert unsafe candidates;
- tells workers to generate the smallest focused diagnostic sample when selected-family artifacts are missing, instead of blocking solely because old generated artifacts were cleaned up;
- tells workers to pivot away from a family after it is parked, while the stage runner injects a pivot directive before stopping a batch for repeated parked diagnostics;
- tells workers to pull only small justified v1/sibling PDF batches into ignored local input folders when current evidence needs more coverage;
- writes current loop state to `Output/agent-runs/evolve/latest-state.json`;
- never commits generated `Output/` artifacts or PDF payloads.

Default target-family order:

```text
runtime-tail,protected-parity,visual-stability,font-text-extractability,figure-alt,table,heading,analyzer-volatility,boundary
```

Override it when you want a different evolution priority:

```bash
./scripts/codex-evolve.sh \
  --batch-size 10 \
  --target-families visual-stability,runtime-tail,protected-parity,font-text-extractability
```

## Model Policy

The runner chooses a model explicitly so it does not accidentally inherit a more expensive global Codex default.

Default `--model-policy auto` behavior:

- normal diagnostic and implementation stages use `gpt-5.4-mini` with medium reasoning;
- hard modes such as `hard-planning`, `acceptance`, `full-gate`, `protected`, `analyzer`, or `determinism` use `gpt-5.5` with xhigh reasoning;
- continuous mode can auto-escalate one stage rerun to `gpt-5.5`/xhigh when the mini worker explicitly asks for it and the task matches an approved xhigh class;
- continuous mode injects a pivot directive after repeated diagnostic-only parked decisions, controlled by `--parked-pivot-after`, then stops if repetition continues past `--parked-repeat-limit`;
- `--model <name>` overrides the model directly;
- `--reasoning-effort low|medium|high|xhigh` overrides the selected reasoning effort.

Default approved xhigh task classes:

```text
hard-planning,acceptance,full-gate,protected,analyzer,determinism,architecture,release,boundary-policy
```

Override the allowlist when needed:

```bash
./scripts/codex-stage.sh --continuous \
  --stage 92 \
  --max-stages 10 \
  --xhigh-task-classes hard-planning,acceptance,full-gate,analyzer,determinism
```

Conservative default:

```bash
./scripts/codex-stage.sh --continuous \
  --stage 85 \
  --max-stages 3 \
  --max-iterations 1
```

Deliberate hard-planning run:

```bash
./scripts/codex-stage.sh --continuous \
  --stage 85 \
  --mode hard-planning \
  --model-policy xhigh \
  --max-stages 1
```

Manual override:

```bash
./scripts/codex-stage.sh \
  --stage 85 \
  --model gpt-5.5 \
  --reasoning-effort xhigh
```

## Watching Progress

By default the runner converts Codex JSONL events into readable terminal lines while still saving the raw stream:

```text
=== Stage 82 (diagnostic-first) ===
Agent run dir: Output/agent-runs/stage82-...
Model: gpt-5.4-mini (medium, auto conservative default)
--- Iteration 1/1 ---
Prompt: Output/agent-runs/stage82-.../iteration-1-prompt.md
[codex:turn.started]
[codex:exec_command] pnpm exec tsc --noEmit
[codex-stage-runner] stage 82 iteration 1 still running after 30s
Decision: diagnostic_only
Next action: ...
```

Use `--raw-events` if you want the original Codex JSONL printed directly to the terminal.
Known Codex plugin/analytics warnings are hidden from the live terminal by default and kept in the per-iteration stderr log. Use `--show-codex-warnings` when debugging Codex CLI startup itself.

The runner:

- checks for tracked dirty files unless `--allow-dirty` is passed;
- records local LLM/listener status before launching Codex;
- calls `codex exec` with `--dangerously-bypass-approvals-and-sandbox` so stage workers can run non-interactively in this already-trusted workspace;
- passes an explicit Codex model and reasoning effort based on `--model-policy`;
- reruns a blocked/safe-to-implement continuous stage once at xhigh only when the worker explicitly asks for xhigh and the task matches `--xhigh-task-classes`;
- continues through soft blocked stages that recommend pivoting, park a topic, or find no safe behavior change for that family;
- injects a pivot directive after repeated diagnostic-only parked decisions for one topic, then stops if repetition continues;
- passes `schemas/codex-stage-decision.schema.json` as the final response contract;
- writes prompt, JSONL event log, stderr, and final summary to `Output/agent-runs/`;
- prints readable live progress and heartbeat status while a Codex worker is still running;
- suppresses known Codex plugin/analytics warning noise, including featured-plugin cache 403 HTML, from live output while preserving raw stderr logs;
- fails if generated artifact paths are staged after the Codex run.

## Guardrails

The coordinator prompt tells workers to:

- read `AGENTS.md` and latest stage evidence first;
- prefer diagnostics before implementation;
- preserve Stage 75 font gains and Stage 78 p95/false-positive wins;
- avoid route guards, scorer/gate changes, filename skips, and benchmark-only inflation unless explicitly justified;
- commit and push only source/docs/tests, never generated PDFs/reports/artifacts.

The runner is intentionally not a blind auto-loop. Use `--max-iterations` sparingly and inspect the final `iteration-N-summary.json` before deciding whether to continue.
