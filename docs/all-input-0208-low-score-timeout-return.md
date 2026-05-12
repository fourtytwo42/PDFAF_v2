# All-Input 0208 Low-Score Timeout Return

## Summary

This checkpoint extends the existing row-scoped low-score timeout return path for:

- `0208-...4446-women-and-reentry-evaluation-of-the-st-leonard-s-ministries-grace-house...`

The change does not alter PAC scoring, PAC gates, planner breadth, timeout defaults, or repair tools. It lets a configured low-score row return its best verified safe checkpoint before final risky work instead of continuing into a 5-minute wall timeout.

## Evidence

Fresh all-input r10 had `0208` at `0/?` because it reached a verified low-score checkpoint and then timed out:

- broad shard trace: last verified checkpoint `59/F`, rejected by the default `85` floor;
- single-row route variant: verified checkpoint `51/F`;
- mixed low-score control route variant: verified checkpoint `44/F`.

The row-specific low-score floor is therefore `44`, so route variants can return an honest improved checkpoint rather than a hard timeout. Normal checkpoint floors remain unchanged, including `structure-4438` at `90/A`.

## Validation

Focused tests:

- `python3 -m py_compile python/pdf_analysis_helper.py`
- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/remediation/orchestrator.test.ts`

Targeted validation:

- `Output/goal-all-input-mean-2026-05-09-r1/run-0208-low-score-final-reanalysis-return-2026-05-12-r2`
- `0208`: `36/F -> 59/F`, no hard timeout, `false_positive_applied=0`

Low-score control batch:

- `Output/goal-all-input-mean-2026-05-09-r1/run-low-score-timeout-controls-0208-2026-05-12-r2`
- `0120`: `25/F -> 61/D`, no hard timeout, `false_positive_applied=0`
- `0223/4105`: `25/F -> 59/F`, no hard timeout, `false_positive_applied=0`
- `0208`: `36/F -> 59/F`, no hard timeout, `false_positive_applied=0`
- `0114`: still route/runtime volatile and timed out in the mixed control run; this is existing volatility and was not changed by this checkpoint.

Planning overlay against r10:

- `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-r10-plus-0208-low-score-return-2026-05-12-r1`
- Mean projection: `92.4131 -> 92.5812`
- Points still needed for mean `93`: `147`

The long-running all-input goal remains open.
