# All-Input Parent-Link Cap Repair

This checkpoint adds one narrow PAC-parity remediation path for near-passing tagged PDFs that are capped only by direct `pdfua.structure.parent_links_valid` evidence.

## Evidence

The all-input overlay after Office figure RoleMap alt repair still had many near-target A-grade rows capped by strict PAC structure syntax evidence. A direct probe on `0052` showed that `repair_top_level_parent_links` clears the parent-link cap and improves the score without changing page/text/tag evidence:

- `0052`: `92/A -> 96/A` in the direct probe.

The focused source validation run:

- Run: `Output/goal-all-input-mean-2026-05-09-r1/run-parent-link-cap-targets-2026-05-10-r3`
- Rows: `0045`, `0052`, `0059`
- Result: all three reached `96/A`
- `false_positive_applied = 0`

## Scope

The planner schedules `repair_top_level_parent_links` only when all of these hold:

- current score is at least `85` and below the target score;
- the PDF is `native_tagged`;
- a structure tree is present;
- strict scoring has applied `PAC rule failure: pdfua.structure.parent_links_valid` at cap `79` or lower.

This is deliberately a strict-PAC object repair. It does not change scoring caps, PAC gates, timeout defaults, AI behavior, or broad planner routing.

## Progress Impact

Overlay:

- Output: `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-parent-link-cap-2026-05-10-r1`
- Mean: `92.1481 -> 92.1823`
- Median: `94`
- Rows below target: `87 -> 84`
- Points needed for mean `93`: `299 -> 287`

The remaining target-selection report still selects `heading_reading_recovery_target` as the highest-deficit lane, followed by PAC object evidence and table/header debt.
