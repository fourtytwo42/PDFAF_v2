# All-Unique Hard Timeout Tail Diagnostic

Date: 2026-05-22

## Decision

Decision: `keep_diagnostic_only_reject_optional_post_alt_budget_guard`.

This adds a read-only hard-timeout tail diagnostic and records a rejected behavior proof. No scoring, remediation, planner, PAC gate, timeout floor, checkpoint floor, Docker/API, or benchmark behavior change is kept.

## Diagnostic Tooling

New script:

- `scripts/all-unique-hard-timeout-tail-diagnostic.ts`

The script reads existing `baseline_report.json` files plus `runtime-timeouts/*.json` traces. It does not analyze PDFs, remediate PDFs, write remediated PDFs, call PAC/POC/ODL/Java, or start semantic work.

It classifies hard-timeout rows into:

- `eligible_checkpoint_terminal_bug`
- `stage_reanalysis_timeout_after_expensive_conformance`
- `optional_post_alt_budget_overrun_candidate`
- `late_no_gain_live_reanalysis_churn`
- `low_checkpoint_not_returnable`
- `missing_timeout_trace`
- `not_hard_timeout`

## All-Unique r2 Diagnostic

Local artifact:

- `/mnt/pdf-review/pdfaf-validation/allunique-current-bounded-full-2026-05-22-r2/hard-timeout-tail-diagnostic-r1/hard-timeout-tail-diagnostic.md`

Result:

- Rows: `351`
- Hard-timeout rows: `3`
- Decision: `plan_optional_post_alt_budget_guard_probe`
- Classification counts:
  - `optional_post_alt_budget_overrun_candidate`: `2`
  - `stage_reanalysis_timeout_after_expensive_conformance`: `1`
- Diagnostic-only projected mean if the optional-budget candidates merely completed at their low verified states: `92.6182`

Rows:

- `0120`: last traced remediation event was a low verified checkpoint at `235702ms`; `64317ms` elapsed afterward; best checkpoint `59/F`, below `85` floor; no-gain live analysis total `86138ms`.
- `0135`: last traced remediation event was a low verified checkpoint at `249088ms`; `50916ms` elapsed afterward; best checkpoint `59/F`, below `85` floor; no-gain live analysis total `98354ms`.
- `0031`: separate structure/reanalysis timeout; last traced event was `stage_reanalysis_start` after `repair_structure_conformance` consumed `115196ms`; best checkpoint `36/F`, below `90` floor.

Interpretation:

- Do not lower checkpoint floors.
- Do not return `0031`'s low checkpoint.
- The only behavior worth probing from this artifact was a bounded optional post-alt budget guard.

## Rejected Behavior Proof

A provisional deadline-aware post-alt guard was tested locally, then reverted. It is not kept in source.

Target/control run:

- `/mnt/pdf-review/pdfaf-validation/allunique-post-alt-budget-proof-2026-05-22-r1/run-r1/baseline_report.json`
- `7` rows: `0120`, `0135`, ADAM2, `pdfaf_fixture_accessible`, and three Teams controls
- Completed: `6/7`
- Mean: `77.00`
- `false_positive_applied=0`
- `0120`: recovered from timeout zero to `59/F` in `286462ms`
- `0135`: still hard-timed out at `300007ms`
- Controls completed and stayed A-grade/high:
  - ADAM2 `94/A`
  - `pdfaf_fixture_accessible` `96/A`
  - Teams original `98/A`
  - Teams remediated `96/A`
  - Teams targeted wave1 `96/A`

The follow-up diagnostic on that target/control run showed the remaining `0135` timeout had moved deeper into internal post-pass/finalization debt:

- `/mnt/pdf-review/pdfaf-validation/allunique-post-alt-budget-proof-2026-05-22-r1/hard-timeout-tail-diagnostic-r1/hard-timeout-tail-diagnostic.md`
- `0135`: last traced checkpoint `stage181_hidden_alt_post_pass` at `266209ms`; `33798ms` elapsed afterward; best checkpoint still `59/F`, below floor.

Original-50 gate with the provisional guard:

- `/mnt/pdf-review/pdfaf-validation/original50-post-alt-budget-guard-2026-05-22-r1/run-r1/baseline_report.json`
- Completed: `48/50`
- All-row mean: `90.84`
- Completed-row mean: `94.625`
- `false_positive_applied=0`
- p95/max: `230952ms / 300012ms`
- Hard timeouts: `4438` and `4516`
- `4683` completed low at `59/F`

This fails the acceptance gate because the current accepted original-50 checkpoint has only the known `4438` hard timeout and a higher all-row mean. The provisional guard recovered one all-unique target (`0120`) but did not pass broad validation, so the behavior was reverted.

## Current Status

Accepted source change:

- Diagnostic script and tests only.

Rejected/not kept:

- Deadline-aware `applyPostRemediationAltRepair` behavior.
- Benchmark/API post-alt deadline callsite changes.
- Any change to checkpoint floors, low-score timeout returns, scorer caps, PAC gates, or mutator behavior.

Next useful work:

1. For `0135`, diagnose the internal post-pass chain after `stage181_hidden_alt_post_pass`; the failure is no longer explained by the external post-alt call alone.
2. For `0031`, isolate `repair_structure_conformance` plus the following reanalysis; do not accept the `36/F` checkpoint.
3. If runtime work continues, require a new proof that removes at least one hard timeout and passes original-50 without adding `4516`/`4683` regressions.
