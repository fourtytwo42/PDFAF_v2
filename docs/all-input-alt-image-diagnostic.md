# All-Input Alt/Image Diagnostic

Generated on 2026-05-09 for the active all-input mean goal.

## Inputs

- Target source folder: `Output/goal-all-input-mean-2026-05-09-r1/focused-alt-image-targets`
- Deterministic run: `Output/goal-all-input-mean-2026-05-09-r1/run-focused-alt-image-targets-2026-05-09-r1`
- PAC-style POC diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/poc-strong-focused-alt-image-r1`
- Figure-role diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/figure-role-alt-focused-r6`
- True-missing-alt diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/true-missing-alt-focused-r6`

## Result

The eight selected `alt_debt` rows are not safe deterministic figure-alt targets right now.

Deterministic remediation moved the focused set only from low F scores to:

- `4139`: `29/F -> 77/C`
- `4675`: `51/F -> 59/F`
- `4605`: `46/F -> 59/F`
- `4687`: `49/F -> 59/F`
- `4213`: `59/F -> 59/F`
- `4657`: `53/F -> 59/F`
- `4650`: `53/F -> 59/F`
- `4674`: `54/F -> 59/F`

The figure-role diagnostic classified all eight as `mixed_table_or_heading_blocker`. The true-missing-alt diagnostic found `6` rows with `no_safe_alt_action` and `2` rows with `table_or_heading_blocked_not_alt_first`, with `0` behavior candidates.

POC/PAC-style evidence on the remediated outputs is mostly not alt-first:

- font/CMap failures are frequent but remain diagnostic-only until a separate stability stage proves safe scoring/remediation;
- child-role/RoleMap and table-header failures are present on multiple rows;
- one row still has heuristic text-tagging evidence;
- no deterministic figure-role or true-missing-alt candidate is safe to promote from this set.

## Decision

Do not add a figure-alt mutator or alt-specific PAC recovery from this evidence. The next all-input mean-recovery branch should target either:

- table/structure plus annotation/header cleanup for rows where existing table/structure tools improve local evidence but fail final PAC gates; or
- a semantic/AI heading-alt lane once source-side LLM validation can use the current honesty guards without rebuilding the oversized Docker image blindly.

## Current-Code Refresh

Generated on 2026-05-10 after the `0297` proposal-buffer checkpoint.

Artifacts:

- Current deterministic alt run: `Output/goal-all-input-mean-2026-05-09-r1/run-focused-alt-image-current-2026-05-10-r1/`
- Current figure-role diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/figure-role-alt-current-2026-05-10-r4/`
- Current true-missing-alt diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/true-missing-alt-current-2026-05-10-r4/`

Result:

- Current deterministic remediation still leaves all eight focused alt rows at `59/F`.
- Stage 191 figure-role diagnostic classifies all eight rows as `mixed_table_or_heading_blocker`.
- Stage 192 true-missing-alt diagnostic classifies six rows as `no_safe_alt_action` and two rows as `table_or_heading_blocked_not_alt_first`.
- Behavior candidates remain `0`; this confirms the refreshed target selector's alt lane is high-deficit but not currently deterministic-fixer-ready.

Implementation note:

- `stage191-figure-role-alt-evidence-diagnostic.ts` and `stage192-true-missing-alt-diagnostic.ts` now understand `baseline_report.json` `rows[]` files and batch `*_remediated.pdf` outputs, so they can be reused directly on current all-input batch artifacts.

Decision:

- Keep the deterministic alt lane parked.
- The next non-semantic remediation branch should shift to table/structure/object evidence or route repeatability.
- A semantic/AI alt lane remains plausible, but it needs an explicit opt-in validation stage because deterministic object evidence does not identify safe placeholder/retag targets.
