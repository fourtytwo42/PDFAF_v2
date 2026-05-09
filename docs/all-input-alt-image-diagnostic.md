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

