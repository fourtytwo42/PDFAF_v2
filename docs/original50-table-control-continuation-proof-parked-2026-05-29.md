# Original-50 Table-Control Continuation Proof Parked

Date: 2026-05-29

## Summary

A narrow source experiment allowed verified low-score checkpoint routing to continue through an already-planned table/control cleanup stage when severe table-score debt was present and a smaller bounded continuation reserve remained. The experiment was intended to recover `4438` from the current `69/D` checkpoint-return route to the accepted `83/B` table-control route.

The behavior candidate was tested locally and then reverted before commit because the fresh original-50 gate did not meet the accepted floor. No production behavior is accepted from this proof.

Local artifacts:

- Targeted proof: `/mnt/pdf-review/original50-stabilization-2026-05-29-r2/table-continuation-targeted-r1/baseline_report.json`
- Original-50 gate: `/mnt/pdf-review/original50-stabilization-2026-05-29-r2/original50-table-continuation-gate-r1/baseline_report.json`

Both runs used deterministic Node 22 validation with `--no-semantic --no-pdfs`, 300s child timeout, 10s external grace, and scratch under `/mnt/pdf-review/pdfaf-tmp`.

## Targeted Proof

The targeted six-row proof completed with no hard timeout and `false_positive_applied=0`.

Rows:

- `4057`: `97/A`
- `4076`: `90/A`
- `4438`: `83/B`
- `4516`: `83/B`
- `4680`: `95/A`
- `4683`: `96/A`

The positive result was `4438`: under default settings it reached the accepted table-control route:

- score `59/F -> 83/B`
- `table_markup=72`
- `reading_order=100`
- `false_positive_applied=0`
- no timeout

This confirms the diagnostic conclusion from `docs/original50-4438-deadline-table-control-diagnostic-2026-05-29.md`: current `4438` low repeats are a checkpoint/deadline routing problem, not missing table evidence or a table mutator failure.

## Original-50 Gate

The fresh original-50 gate completed all `50` rows with no hard timeout and `false_positive_applied=0`, but failed the accepted quality floor:

- mean `93.00`
- accepted floor is mean `>=94.32`
- median was not enough to compensate for low route drops
- p95 runtime `185136ms`
- max runtime `282130ms`

Below-93 rows:

- `4076`: `90/A`, non-table heading/PDF-UA debt, near-wall route
- `4438`: `83/B`, table-control route recovered as intended
- `4516`: `59/F`, non-table figure/heading/PDF-UA route drop
- `4680`: `59/F`, non-table route drop
- `4683`: `62/D`, mixed heading/alt/table route drop
- `4754`: `85/B`, route drop outside the original five blockers

## Decision

Decision: `behavior_rejected_gate_failed`.

The continuation predicate is useful evidence for `4438`, but it cannot be accepted while unrelated original-50 route volatility drops the fresh gate below the required mean. The source experiment was reverted before commit.

Do not reintroduce the continuation behavior as a standalone table fix. A future attempt needs either:

- a broader original-50 route stabilization stage that handles `4516`, `4680`, `4683`, and `4754`; or
- an explicit source-tracked parking decision accepting those route drops as stricter true debt before table lanes are reopened.

## Guardrails

- Do not globally relax timeout/checkpoint policy.
- Do not lower scorer/PAC strictness or checkpoint floors.
- Do not use row, filename, source, corpus, or hash gates.
- Do not claim original-50 stability from the targeted `4438` proof alone.
- If this lane is retried, require a fresh original-50 gate before acceptance.
