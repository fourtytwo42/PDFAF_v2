# All-Input Second-Pass A-Grade Timeout Recovery

Generated: 2026-05-11

## Summary

The fresh all-input validation
`Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-10-r2`
completed 351 PDFs with mean `91.943`, median `95`, and `false_positive_applied = 0`.
Five rows ended as hard timeout/unknown scores. Runtime traces showed three of those rows could
already reach A-grade states before the wall timeout, but the batch runner continued into a second
deterministic pass because the global per-file target remained `95`.

This stage changes only benchmark-runner second-pass admission. It does not change PAC scoring,
PAC gates, remediation acceptance, planner routes, timeout defaults, API behavior, or repair tools.

## Change

`scripts/baseline-corpus-batch.ts` now skips the second deterministic pass when the first pass
already reaches `PDFAF_SECOND_PASS_MIN_SCORE`, defaulting to `93`. Rows below `93` still get the
second pass when budget remains; rows with verified checkpoint returns, exhausted budget, or target
score already reached still skip as before.

The rationale is runtime and honesty: an already A-grade first-pass PDF should not be converted to a
hard timeout merely because the batch runner tries to chase `95`.

## Targeted Validation

Exact-name target run:

`Output/goal-all-input-mean-2026-05-09-r1/run-second-pass-a-grade-timeout-exact-2026-05-11-r1`

Results:

| File | Result |
| --- | --- |
| `0007-21818039e63b-figure-4702.pdf` | `37/F -> 93/A` |
| `0233-966b49186171-4158-analysis-of-shelter-utilization-by-victims-of-domestic-violence-qualitat.pdf` | `35/F -> 94/A` |
| `0268-80324161cbfe-4531-s-t-o-p-violence-against-women-in-illinois-a-multi-year-plan-ffy14-16.pdf` | `28/F -> 93/A` |

All three completed without hard timeout and with `false_positive_applied = 0`.

Control run:

`Output/goal-all-input-mean-2026-05-09-r1/run-second-pass-a-grade-timeout-target-2026-05-11-r2`

Controls stayed A-grade:

- `ctrl-figure-4753.pdf`: `97/A`
- `ctrl-font-3448.pdf`: `97/A`
- `ctrl-font-4035.pdf`: `95/A`
- `ctrl-font-4699.pdf`: `95/A`
- `ctrl-long-4700.pdf`: `94/A`

Expected parked/unsafe timeout rows remained unresolved:

- `0031-structure-4438.pdf`: hard timeout, best known checkpoint below floor.
- `0223-4105-jail-data-link.pdf`: hard timeout, below-floor checkpoint/safety replay candidate.

## Mean Projection

Overlay:

`Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-second-pass-a-grade-timeout-exact-2026-05-11-r1`

Projected fresh all-input movement:

- Mean: `91.943 -> 92.7407`
- Rows below `93`: `60 -> 57`
- Points needed for mean `93`: `371 -> 91`
- Runtime p95: `247135ms -> 244928ms`

## Next Direction

The mean target is not yet met. The remaining deficit is `91` points. The next diagnostic-first
work should target remaining below-93 rows with real score movement, especially:

- `0223-...4105-evaluation-of-the-jail-data-link-program.pdf`: below-floor checkpoint/safety replay candidate.
- `long-4683`, `4453`, `4171`, `4503`, and other `59/F` rows where a single safe recovery can move 34 points.
- `structure-4438` remains parked unless a real `90/A` checkpoint appears.
