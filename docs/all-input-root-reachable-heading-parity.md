# All-Input Root-Reachable Heading Parity

## Summary

The PAC-style structure tree probe found a grader/analyzer gap on heading rows where Python could see root-reachable heading elements, but TypeScript scoring only saw the bounded `structureTree` JSON. That bounded JSON can omit deeper reachable headings, so rows with real checker-visible heading structure were still treated as `treeHeadingCount = 0`.

This stage wires direct Python evidence into the snapshot as `structureDebug.rootReachableHeadingCount` and `rootReachableDepth`, then uses it in bounded detection heading signals. It does not change PAC scoring caps, PAC gates, planner routes, mutation behavior, timeout defaults, API fields, or AI behavior.

## Validation

Focused proof run:

- `Output/goal-all-input-mean-2026-05-09-r1/run-heading-root-reachable-proof-2026-05-10-r2`
- `false_positive_applied = 0`
- `4078`: `74/C -> 100/A`
- `4188`: `87/B -> 95/A`
- `4171`: `51/F -> 83/B`
- `4139`: `29/F -> 59/F` because its final state has no root-reachable heading evidence.

Focused controls:

- `Output/goal-all-input-mean-2026-05-09-r1/run-root-reachable-controls-2026-05-10-r1`
- `false_positive_applied = 0`
- Controls remained A-grade: `0033`, `4646`, `0108`, `4593`, `0275`, `0317`, and `0319`.

Progress overlay:

- `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-root-reachable-heading-2026-05-10-r1`
- Estimated mean: `92.3846`
- Rows below target: `79`
- Points still needed for mean `93`: `216`

## Decision

Keep this as a direct evidence parity fix. It makes our grader closer to PAC/POC by trusting object-level root reachability evidence instead of only the bounded report tree.

The next selector shifts away from this exact gap:

- `Output/goal-all-input-mean-2026-05-09-r1/target-selection-after-root-reachable-heading-2026-05-10-r1`
- Selected direction: `needs_more_pac_object_evidence`
- Top families: PAC object evidence (`132` deficit), parked runtime (`105`), table/header (`99`), and remaining heading/reading (`74`).
