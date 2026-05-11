# All-Input Route Volatility Aggregate

Date: 2026-05-11

This diagnostic aggregates the existing per-row route recovery reports for the all-input mean goal after the fresh r4 checkpoint.

## Artifacts

- Script: `scripts/all-input-route-volatility-aggregate.ts`
- Local output: `Output/goal-all-input-mean-2026-05-09-r1/route-volatility-aggregate-2026-05-11-r1`
- Source checkpoint: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-11-r4/all-input-mean-diagnostic.md`

## Current Mean Checkpoint

Fresh r4 remains below the goal:

- PDFs processed: `351`
- Mean: `91.359`
- Median: `94`
- Rows below `93`: `54`
- Points needed for mean `93`: `576`
- `false_positive_applied`: `0`

The best expanded overlay reaches only `92.567`, so the goal is not complete.

## Aggregate Findings

The aggregate scanned `19` route recovery diagnostics:

- `4` same-state probe candidates
- `12` upstream route/analyzer volatility rows
- `2` missing score-moving tool rows
- `1` no-safe-route-proof row
- Total observed good-vs-bad score spread: `718`

The top same-state rows are:

- `0108 / 4614`: shared rejected `normalize_annotation_tab_order` state, but prior repeat docs already show the route can also enter a bad alt/table-regressed path. Needs a focused final-state probe before behavior.
- `0086 / 4567`: shared native-link repair state, but prior exact-name repeats are volatile. Needs object-level proof before behavior.
- `0248`: shared reading-shell state; already recovered by the accepted `repair_degenerate_native_reading_order_shell` orphan-MCID recovery.
- `4139`: shared language/title state, but later repeats classify the row as analyzer/upstream volatility. Do not add a language/title guard without a final PAC-safe replay proof.

The dominant pattern is upstream route volatility:

- `0236`, `0316`, `0033`, `0194`, `0325`, `0084`, `0097`, and several others diverge before the score-moving sequence, often at the initial analyzer/replay state.
- These are not safe route-guard candidates.

Runtime/admission rows:

- `0114` and canonical `long-4516` are classified as `missing_score_moving_tool`, but current exact repeats timeout or reach only low checkpoints. They need runtime/admission diagnostics, not lowered checkpoint floors.

## Decision

Do not run another broad all-input validation yet and do not add broad route guards.

Safe next branches:

1. Focused same-state probe for one row only, preferably `0108` or `0086`, with final PAC-safe reanalysis and repeat validation.
2. Analyzer/route determinism design for upstream initial-state drift.
3. New object-level PAC fixer family for rows that are not route volatility.

Unsafe branches:

- PAC gate weakening or orphan-MCID global exceptions.
- Counting one-off high routes as mean-goal completion.
- Broad table/header batching.
- Lowering timeout defaults or checkpoint floors.
