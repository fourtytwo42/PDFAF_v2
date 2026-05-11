# All-Input Route Volatility Aggregate

Date: 2026-05-11

This diagnostic aggregates the existing per-row route recovery reports for the all-input mean goal. The original report was written after fresh r4; the update below records the complete-r5 refresh after all eight shards finished.

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

## Source Analyzer Repeat

Follow-up artifact:

- `Output/goal-all-input-mean-2026-05-09-r1/source-analyzer-repeat-volatile-2026-05-11-r1`

This repeated source analysis three times for the volatile focus rows before remediation tools ran.

Initial analyzer score variance was present on:

- `0086 / 4567`: `59, 46, 46`; largest category swings were `table_markup 0 -> 100`, `alt_text 0 -> 88`, and `heading_structure 0 -> 60`.
- `0084 / 4139`: `29, 31, 47`; largest swings were `alt_text 20 -> 100` and `heading_structure 0 -> 74`.
- `0325 / 4693`: `54, 59, 59`; largest swings were `alt_text 0 -> 100`, `heading_structure 0 -> 96`, and `table_markup 79 -> 100`.

Initial analyzer scores were stable on:

- `0108 / 4614`: `45, 45, 45`.
- `0236 / 4705`: `45, 45, 45`.
- `0097 / 4694`: `52, 52, 52`.
- `0316 / 4553`: `51, 51, 51`.

Decision refinement:

- `0086`, `4139`, and `0325` need analyzer determinism or evidence canonicalization before route behavior.
- `0108`, `0236`, `0097`, and `0316` should be treated as remediation-stage transaction/planner volatility, not raw source-analyzer volatility.
- `0108` remains the best focused same-state transaction probe, but prior evidence shows its bad route can regress alt/table evidence, so any behavior must materialize and accept only a final PAC-safe combined state.

## Complete-r5 Refresh

Follow-up artifact:

- `Output/goal-all-input-mean-2026-05-09-r1/route-volatility-aggregate-r5-complete-2026-05-11-r1`

The complete-r5 aggregate scanned `25` route recovery diagnostics:

- `4` same-state guard probes needed
- `17` upstream route-volatility rows
- `3` missing score-moving tool rows
- `1` no-safe-route-proof row
- Total observed score spread: `900`

The same-state probe rows remain:

- `0108 / 4614`: still the cleanest focused transaction probe, but prior explicit sequence probing did not reproduce the one-off `94/A` route and showed unsafe alt/table movement in intermediate states.
- `0086 / 4567`: shared native-link state exists, but source analyzer repeats showed initial analysis variance; do not add a route guard without analyzer-stable proof.
- `0248`: already recovered by accepted reading-shell behavior; do not reopen unless it regresses in a fresh full run.
- `4139`: has same-state language/title evidence in older route diagnostics, but source/repeat evidence is mixed with analyzer or route volatility; keep diagnostic-only.

The new `0346` repeats do not create a guard candidate. Three one-row current-code repeats landed `59/F`, `91/A`, and `94/A`, but route comparisons classify the miss as `upstream_route_volatility`: the low route takes `remap_orphan_mcids_as_artifacts@312fa263390e741c26f9476b:51->59`, while the high routes later reach heading/link/parent-link recovery. There is no shared rejected score-moving state.

Decision remains unchanged: do not weaken PAC gates, do not add broad route suppression, and do not count volatile one-off high routes toward the mean goal. The next behavior branch should be either one final PAC-safe transaction probe for an analyzer-stable same-state row, or a separate analyzer/route determinism design.
