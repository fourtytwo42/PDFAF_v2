# All-Unique r39 Hard-Timeout Current Diagnostic

Date: 2026-05-22

## Decision

Decision: `fresh_all_unique_validation_justified`.

This is a focused deterministic diagnostic against the four hard-timeout rows from the best honest all-unique floor, r39. It does not change scoring, PAC gates, planner routing, remediation behavior, Docker/API behavior, or benchmark acceptance state.

The diagnostic is not a completion claim. It is evidence that current source may clear the one raw point still missing from the r39 all-unique checkpoint, but only a fresh all-unique run can prove that.

## Inputs

Baseline all-unique checkpoint:

- `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-14-r39-stage194-lowconcurrency-full-r1/all-input-mean-diagnostic.json`
- Rows: `351`
- Mean: `92.9972`
- Median: `95`
- Points needed for `93.0000`: `1`
- `false_positive_applied=0`
- Hard timeouts: `0019/long-4516`, `0031/structure-4438`, `0120/4690`, `0135/4453`

Current-source focused input:

- `Output/goal-all-input-mean-2026-05-09-r1/current-r39-hard-timeout-input-2026-05-22-r1`

Runs:

- `/mnt/pdf-review/pdfaf-validation/allunique-r39-hard-timeouts-current-2026-05-22-r1/baseline_report.json`
- `/mnt/pdf-review/pdfaf-validation/allunique-r39-hard-timeout-0019-repeat-2026-05-22-r1/baseline_report.json`

Both runs used deterministic remediation with `--no-semantic --no-pdfs` through `scripts/bounded-holdout-validation.ts`.

## Results

Four-row focused run:

- Completed: `1/4`
- `false_positive_applied=0`
- `0019/long-4516`: `43/F -> 59/F`, `238197ms`
- `0031/structure-4438`: hard timeout at `300039ms`
- `0120/4690`: hard timeout at `300122ms`
- `0135/4453`: hard timeout at `300117ms`

One-row `0019` repeat:

- Completed: `1/1`
- `false_positive_applied=0`
- `0019/long-4516`: `76/C -> 85/B`, `280597ms`

The `0019` recovery is route-variable but repeat-supported as a non-zero timeout recovery. The two observed current-source outcomes are both enough to recover more than the one raw all-unique point missing from r39 if they hold in a fresh full run.

Projected arithmetic only:

- r39 needs `1` raw point.
- Replacing r39 timeout `0019=0` with the weaker focused repeat `59` would add `+59` raw points.
- That projection is not accepted all-unique progress until a fresh all-unique validation proves it without new regressions.

## Interpretation

The current all-unique blocker shape is runtime/analyzer boundedness, not a new high-impact PAC/POC scoring lane.

What improved:

- `0019/long-4516` no longer appears as a deterministic hard-timeout-only row in focused current-source repeats.
- Mutation truth stayed clean: `false_positive_applied=0`.

What remains blocked:

- `0031/structure-4438`, `0120/4690`, and `0135/4453` remain hard timeouts under the same five-minute external guard.
- The `0019` outcome is not stable in score shape (`59/F` then `85/B`) and consumes most of the wall budget.

## Next Step

Run a fresh all-unique validation from current source when the next work window can support it. The validation should remain deterministic, preserve `false_positive_applied=0`, and compare against r39 for mean, hard timeouts, and p95/runtime.

Do not mark the goal complete from this diagnostic. Do not add a new scorer or mutator from this evidence. If a fresh all-unique run still misses, the next implementation-capable branch should target runtime/analyzer recovery for `0031`, `0120`, or `0135` with general predicates and controls.
