# All-Input Fresh R4 Checkpoint

Date: 2026-05-11

This checkpoint completes only the last two all-input shards requested after the prior fresh r3 run. The merged diagnostic combines `fresh-all-input-validation-2026-05-11-r3` shards `01-06` with newly completed `fresh-all-input-validation-2026-05-11-r4` shards `07-08`.

## Artifacts

- Fresh shard 07: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-11-r4/shard-07`
- Fresh shard 08: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-11-r4/shard-08`
- Merged root: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-11-r4-merged`
- Merged diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-11-r4/all-input-mean-diagnostic.md`
- Target selection: `Output/goal-all-input-mean-2026-05-09-r1/target-selection-fresh-r4-2026-05-11-r1`
- PAC object evidence: `Output/goal-all-input-mean-2026-05-09-r1/pac-object-evidence-gap-fresh-r4-2026-05-11-r1`
- Table object diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/table-parenttree-object-r4-diagnostic-2026-05-11-r1`
- `long-4516` exact repeat: `Output/goal-all-input-mean-2026-05-09-r1/run-long4516-exact-repeat-2026-05-11-r1`
- `0097` route diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/route-recovery-0097-r4-2026-05-11-r1`

## Result

Merged fresh mean is still below the goal:

- PDFs processed: `351`
- Mean: `91.359`
- Median: `94`
- Grades: `315 A / 4 B / 3 C / 14 D / 12 F`
- Rows below `93`: `54`
- Points needed for mean `93`: `576`
- Runtime p95: `244940ms`
- Runtime max: `300025ms`
- `false_positive_applied`: `0`

Hard timeouts are `long-4516`, `structure-4438`, and `0208 / 4446 women-and-reentry`. `structure-4438` still has no useful checkpoint. `0208` reached only a `51/F` checkpoint in the fresh trace. A fresh exact repeat of `long-4516` also hard-timed out; it reached only a `59/F` checkpoint, so the earlier `85/B` route is not repeatable enough to promote as a terminal-checkpoint behavior.

## Diagnostic Decision

The r4 target-selection diagnostic selected `heading_reading_recovery_target`, but the top score movement is dominated by runtime/analyzer route volatility rather than a clean same-state guard. The table/ParentTree object diagnostic over `0114`, `0135`, `0120`, `0223`, `0097`, `0138`, `0287`, and `0091` found no safe table-header association candidates: `6` rows were `not_table_first`, and `2` rows were `irregular_or_direct_table_shape`.

The `0097` route diagnostic compared the prior `95/A` route with fresh r4 `69/D` and classified it as `upstream_route_volatility`; the first divergence is at the initial language/title stage from different replay states. Do not add a table/PAC exception or route guard from this evidence.

Next useful direction is a dedicated analyzer/route-volatility project or a new object-level fixer family with direct PAC-like targets. Repeating near-pass shards or broad table-header batching is not supported by this checkpoint.
