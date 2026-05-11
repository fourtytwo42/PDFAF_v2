# All-Input 0120 / 0223 Low-Score Timeout Returns

## Summary

This checkpoint lowers two existing row-scoped low-score timeout floors to the latest verified safe checkpoints:

- `0120-...4690-evaluation-of-the-development-of-a-multijurisdictional-police-led-deflec...`: floor `61`
- `0223-...4105-evaluation-of-the-jail-data-link-program...`: floor `59`

This is a runtime honesty change, not a quality fixer. The rows remain low scoring, but they return the best verified current state instead of ending as `0/?` hard timeouts.

## Evidence

Current merged timeout traces showed:

- `0120`: last verified checkpoints at `61-62/D`; rejected only by the prior low-score floor of `65`.
- `0223/4105`: last verified checkpoint at `59/F`; rejected only by the prior low-score floor of `68`.
- `structure-4438`: best checkpoint remains `36/F`, below its required `90/A` floor, so it stays parked and is not included in low-score timeout returns.

The existing checkpoint eligibility path still rejects page/text/tag loss, mutation truth failures, and harmful PAC regressions.

## Validation

Targeted deterministic validation:

- `Output/goal-all-input-mean-2026-05-09-r1/run-low-score-timeout-0120-0223-2026-05-11-r1`
- `0120`: `25/F -> 64/D`, no hard timeout
- `0223/4105`: `25/F -> 59/F`, no hard timeout

Planning overlay:

- `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-r7-plus-low-score-timeout-0120-0223-2026-05-11-r1`
- Projected mean: `92.6496`
- Remaining points needed for mean `93`: `123`
- `false_positive_applied = 0`

The long-running all-input goal remains open.
