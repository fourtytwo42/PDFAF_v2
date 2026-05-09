# Long-4516 Runtime Route Diagnostic

Stage date: 2026-05-09

This diagnostic compares the current `long-4516` routes after the post-pass guard pilot:

- Good targeted route: `Output/experiment-corpus-baseline/run-long4516-postpass-guard-target-2026-05-09-r1`
- Low targeted route: `Output/experiment-corpus-baseline/run-goal-blocker-repeat-2026-05-09-r1`
- Hard-timeout repeat: `Output/experiment-corpus-baseline/run-goal-runtime-hardtimeout-repeat-2026-05-09-r1`
- Local diagnostic output: `Output/experiment-corpus-baseline/long4516-runtime-route-diagnostic-2026-05-09-r1`

## Result

Classification: `metadata_acceptance_volatility`.

The good route and low route start metadata repair from the same replay state (`59847e143d407cb8277da61e`). In the good route, `set_document_language` and `set_document_title` apply and the row reaches `92/A`. In the low route, those same metadata-only tools are rejected after reanalysis reports a structural/alt/table drop, leaving the row to recover only to `84/B`.

The hard-timeout repeat did not expose an eligible checkpoint-return bug. Its last verified checkpoint was `78/C`, with eligibility reason `checkpoint_below_floor(78<80)`. That checkpoint must not be returned and the `long-4516` floor should not be lowered.

## Decision

Do not change checkpoint floors, PAC scoring, PAC gates, timeout defaults, or broad planner behavior.

The only plausible follow-up behavior is a narrow metadata-only volatility probe: when a `4516` metadata-only stage reanalyzes as a severe non-metadata structural regression from the proven replay shape, run one bounded confirmation reanalysis and accept only if the confirmed state preserves page/text/tag/PAC safety and reaches the existing `>=80/B` floor. This should be a separate behavior stage with targeted controls before any fixed-50 run.

If confirmation cannot produce a floor-safe state, keep `long-4516` parked as route/runtime volatility rather than hiding the low checkpoint.
