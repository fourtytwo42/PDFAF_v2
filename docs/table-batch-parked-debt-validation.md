# Table Batch Validation With Parked Route Debt

Generated: 2026-05-08

## Decision

Accept the current table/header association batching as a bounded table-evidence improvement, with explicit parked route/runtime debt.

This stage did not change scoring, PAC gates, timeout defaults, API fields, AI behavior, planner breadth, or repair tools. It validated the already-implemented `set_table_header_cells` association batching policy against the strict-grader baseline and separated table evidence from unrelated route volatility.

## Targeted Validation

Run:

`Output/experiment-corpus-baseline/run-table-batch-parked-debt-target-2026-05-08-r1`

Diagnostic:

`Output/experiment-corpus-baseline/table-batch-acceptance-target-diagnostic-2026-05-08-r1`

Result:

- Decision: `accept_table_batch_with_parked_debt`
- `false_positive_applied`: `0`
- Non-parked regressions: `0`
- Table observations: `2`
- Table improvements: `2`
- `font-4699`: `91/A`, table debt `1 -> 0`, TD-without-header debt `6 -> 0`
- `long-4700`: `78/C`, table association debt `10 -> 2`, TD-without-header debt `220 -> 17`
- Non-parked controls did not regress.

Parked observation rows were reported but did not block table-batch acceptance:

- `fixture-inaccessible`: route volatility; native link repair is not consistently scheduled.
- `figure-4754`: upstream route volatility; not caused by table batching.
- `structure-3775`: route volatility observed in controls; no table-batch causality.

## Fixed Original-50 Validation

Run:

`Output/experiment-corpus-baseline/run-table-batch-parked-debt-fixed50-2026-05-08-r1`

Stage 41 gate:

`Output/experiment-corpus-baseline/table-batch-parked-debt-fixed50-gate-2026-05-08-r1`

Acceptance diagnostic:

`Output/experiment-corpus-baseline/table-batch-acceptance-fixed50-diagnostic-2026-05-08-r1`

Result:

- Diagnostic decision: `accept_table_batch_with_parked_debt`
- Reanalyzed mean: `91.18`
- Reanalyzed median: `94`
- Grades: `41 A / 3 B / 2 C / 2 D / 1 F`
- `false_positive_applied`: `0`
- Hard timeouts: `1`, parked `structure-4438`
- Non-parked table-batch regressions: `0`
- `font-4699`: `91/A`, table debt `1 -> 0`, TD-without-header debt `6 -> 0`
- `long-4700`: `78/C`, table association debt `10 -> 2`, TD-without-header debt `220 -> 17`
- `long-4516`: `87/B`, no hard timeout
- `long-4683`: `91/A`, no hard timeout
- `structure-4076`: `70/C`, parked floor reached

The formal Stage 41 gate still fails against the older Stage 42 baseline:

- `analyze_success` / `remediate_success` / `route_summary_coverage`: caused by parked `structure-4438` timeout.
- `runtime_p95_wall` and `runtime_median_wall`: runtime tail remains outside the older gate envelope.
- `total_tool_attempts`: current strict-grader path still has broader attempt count than Stage 42.
- `protected_file_regressions`: includes `figure-4702`, which is already `59/F` in the strict-grader baseline and has no table-batch evidence.

These gate failures are not table-batch causality. They remain parked route/runtime/strict-grader validation debt.

## Parked Rows For This Decision

- `fixture-inaccessible`: route volatility; link repair can be missing from bad routes.
- `figure-4754`: upstream route volatility; route can land at `67/D` or `78/C`.
- `structure-3775`: route volatility observed in controls.
- `structure-4076`: parked table/analyzer-applicability debt; reached `70/C` in this fixed run.
- `structure-4438`: parked runtime/checkpoint debt; still has no eligible `90/A` checkpoint.

## Follow-Up

The current table batch behavior is safe to keep under the parked-debt policy. Do not widen batching thresholds from this evidence. The next work should either:

- run a broader acceptance decision that explicitly waives/parks the documented route/runtime debt, or
- open a separate route/runtime project for `structure-4438`, `figure-4702`, and the remaining route-volatility rows.
