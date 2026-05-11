# All-Input 0108 Transaction Diagnostic

Date: 2026-05-11

This diagnostic narrows one route-volatility candidate from the all-input r4 mean work. It is diagnostic-only; it does not change scoring, PAC gates, planner routing, timeout defaults, or remediation behavior.

## Artifacts

- Script: `scripts/all-input-0108-transaction-diagnostic.ts`
- Local output: `Output/goal-all-input-mean-2026-05-09-r1/0108-transaction-diagnostic-2026-05-11-r1`
- Good route input: `Output/goal-all-input-mean-2026-05-09-r1/run-remaining-high-deficit-rerun-2026-05-11-r1/baseline_report.json`
- Bad route input: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-11-r4-merged/shard-04/baseline_report.json`
- Focus row: `0108-d08027579d0b-4614`

## Finding

Classification: `combined_stage_probe_candidate`

The good route reaches `94/A`, but the fresh r4 route remains `59/F`.

The important shared state is `46a2929be04fb5debed80e91`. From that state, the bad route rejects the stage after exposing an unsafe intermediate:

- `alt_text: 84 -> 0`
- `table_markup: 100 -> 72`
- score `59 -> 55`

The good route does not justify accepting that intermediate. It only becomes viable after a combined sequence:

- `create_heading_from_candidate` moves heading evidence to `94`
- `normalize_annotation_tab_order` preserves the good heading/alt/table shape
- later `repair_native_link_structure` and `set_link_annotation_contents` move score to `91`
- `repair_top_level_parent_links` reaches `94/A`

## Decision

Do not add a PAC exception or accept the intermediate stage.

Any future behavior must be a row-scoped transaction probe that materializes only the final safe state and proves all of these conditions:

- final score improves and reaches at least `90/A` for `0108`
- final `heading_structure` and `reading_order` improve or stay above the good-route floor
- final `alt_text` and `table_markup` do not regress from the pre-transaction state
- page/text/tag evidence remains safe
- harmful PAC rules remain safe
- `false_positive_applied` remains `0`

Until that transaction can be replayed and validated, `0108` remains remediation-stage transaction volatility, not a safe same-state guard.
