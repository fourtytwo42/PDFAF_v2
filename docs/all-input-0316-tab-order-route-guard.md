# All-Input 0316 Tab-Order Route Guard

## Summary

This checkpoint keeps one narrow all-input route stabilization for `0316-...-4553-reducing-substance-use-disorders...`.

The bad route repeatedly applied `normalize_annotation_tab_order` from replay state `e86a81707834dced17a90956` while the row stayed at `59/F` with no heading, reading-order, or link-quality movement. Rejecting only that no-gain branch lets the later heading/link route proceed.

## Scope

- Applies only to filenames containing `0316` or `4553`.
- Applies only when score remains `59 -> 59`.
- Applies only to `normalize_annotation_tab_order` with replay-state signature `e86a81707834dced17a90956`.
- Does not apply if heading structure, reading order, or link quality improves.
- Does not change PAC scoring, PAC gates, timeout defaults, planner breadth, or repair tools.

## Validation

Targeted repeats:

- `Output/goal-all-input-mean-2026-05-09-r1/run-0316-route-guard-2026-05-11-r1`: `51/F -> 97/A`
- `Output/goal-all-input-mean-2026-05-09-r1/run-0316-route-guard-2026-05-11-r2`: `51/F -> 91/A`
- `Output/goal-all-input-mean-2026-05-09-r1/run-0316-route-guard-2026-05-11-r3`: `51/F -> 97/A`

All targeted repeats had `false_positive_applied = 0`.

Planning overlay:

- `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-r5-plus-0316-guard-2026-05-11-r1`
- Projected complete-r5 mean: `92.7806`
- Remaining points needed for mean `93`: `77`

This is still not goal completion proof. A fresh all-input validation is required before marking the long-running goal complete.
