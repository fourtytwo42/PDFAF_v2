# Repository Memory

This file is durable context for agents working in this repository. Read it when starting work, after context compression, or when unsure about the current checkpoint, validation policy, or parked debt. Update it with concise facts that future agents should remember.

## Memory Rules

- Record durable decisions, accepted/rejected behavior, current best checkpoints, validation baselines, and parked debt.
- Do not record PDF payloads, Base64, large logs, generated benchmark JSON, or transient command output.
- Prefer exact stage numbers, run directories, commit hashes, and one-line conclusions.
- If a fact is uncertain, label it as uncertain and point to the local artifact that should be checked.

## Current Durable State

- Formal protected baseline remains `Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7`.
- Use Node 22 and `--no-semantic` for deterministic benchmark validation unless semantic behavior is explicitly under test.
- Before any benchmark path that might spawn an LLM, check for an existing local `llama-server` or API listener and reuse it.
- Keep generated PDFs, benchmark runs, and diagnostic reports local unless explicitly promoted to source documentation.

## Recent Stage Memory

- Stage 162 is a kept targeted quality win. Commit `4b554de` added near-pass PDF/UA cleanup. It lifted active-tail `v1-v1-3468` and `v1-v1-4766` to A-grade in focused validation, kept `false_positive_applied = 0`, preserved Stage 75 font gains, and improved original-50 mean/median/F count, but its formal gate still had protected regressions.
- Stage 163 is diagnostic-only. Commit `80d2e4c` added `scripts/stage163-protected-regression-closeout.ts` and tests. No remediation behavior was kept.
- Stage 163 focused diagnostics found same-buffer floor-safe repeats for `long-4516`, `short-4214`, `short-4176`, and sometimes `long-4683`; Stage 162 annotation retry did not fire on these protected blockers.
- Stage 163 full original-50 run `Output/experiment-corpus-baseline/run-stage163-full-2026-04-30-r1` failed only `protected_file_regressions` with `short-4176` and `long-4683`; runtime p95 passed, attempts passed, font controls stayed good, and active-tail Stage 162 wins stayed good.
- A Stage 163 experiment forcing protected final confirmation to bypass analyzer cache was rejected: `Output/experiment-corpus-baseline/run-stage163-full-postfix-2026-04-30-r1` failed both `protected_file_regressions` and `runtime_p95_wall`, so the behavior was reverted.
- Remaining protected debt after Stage 163 is analyzer/route volatility, especially `short-4176`, `long-4683`, and known volatile control `structure-4076`. Do not add broad protected route guards or scorer/gate changes without new repeat evidence.

## Parked Or Sensitive Areas

- Stage 75 local font substitution should remain guarded; font controls `font-4156`, `font-4172`, and `font-4699` are regression controls.
- Stage 162 near-pass rows `v1-v1-3468` and `v1-v1-4766` are regression controls. `v1-v1-4761` remains visually risky/parked and should not be forced through a broad PDF/UA cleanup.
- OCR title-owner rows `3451`, `3459`, and `3602` remain parked unless a safe MCID-backed title-owner bridge is proven.
- Analyzer-volatility rows should not drive new fixer acceptance unless repeat diagnostics prove a quality-preserving deterministic fix.
