# Stage 46A: Runtime Regression Isolation

## Summary

Stage 46 broad runtime-tail suppression was **not** safe to keep. The exploratory candidates improved p95 and attempts, but they also introduced score regressions on rows that are more important than the runtime gain alone.

This checkpoint does **not** keep any Stage 46 runtime-guard behavior in the engine. It adds a comparison tool and records the current isolation result so Stage 46B can reintroduce only the proven-safe subset.

Baseline for isolation:
- `run-stage45-full-2026-04-23-r2`

Candidate used for isolation:
- `run-stage46-full-2026-04-23-r2`

Generated diagnostic output:
- `Output/experiment-corpus-baseline/stage46-runtime-regression-isolation-2026-04-23-r1/`

## Current Mapping

Rows that regressed in the broad/narrow Stage 46 candidates:
- `figure-4188`
- `structure-4076`
- `fixture-teams-targeted-wave1`
- `long-4683`

Rows that showed real runtime wins:
- `structure-4438`
- `long-4516`

Current blame map from the isolation report:
- `annotation_ownership_family_blocking` is implicated in:
  - `figure-4188`
  - `structure-4076`
  - `structure-4438`
- `planner_loop_same_state_suppression` is implicated in:
  - `fixture-teams-targeted-wave1`
  - `long-4683`
  - `long-4516`

Interpretation:
- The Stage 46 runtime wins are not from one clean global guard.
- The `structure-4438` win is entangled with the same annotation-family blocking that also hurts `figure-4188` and `structure-4076`.
- The planner-loop same-state suppression family is too broad to keep as a general Stage 46 change.

## What Stays In Scope For Stage 46B

Safe next move:
- use `scripts/stage46-runtime-regression-isolation.ts` to compare a new candidate against Stage 45 before keeping any runtime guard
- reintroduce runtime trimming only if the target regression set stays at Stage 45-equivalent scores

Out of scope until proven safe:
- broad planner-loop same-state suppression
- broad annotation-family route blocking
- protected-flow suppression
- global orphan-drain suppression

## Commands

```bash
pnpm run benchmark:runtime-isolation -- \
  --id figure-4188 \
  --id structure-4076 \
  --id fixture-teams-targeted-wave1 \
  --id long-4683 \
  --id structure-4438 \
  --id long-4516 \
  Output/experiment-corpus-baseline/run-stage45-full-2026-04-23-r2 \
  Output/experiment-corpus-baseline/run-stage46-full-2026-04-23-r2 \
  Output/experiment-corpus-baseline/stage46-runtime-regression-isolation-2026-04-23-r1
```
