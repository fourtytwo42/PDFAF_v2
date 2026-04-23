# Stage 44 Freeze and Stage 45 Cleanup

## Status

Stage 43/44 delivered real aggregate corpus gains, but the stack is still **provisional** rather than accepted.

Best measured full-corpus reference:
- Run: `Output/experiment-corpus-baseline/run-stage44.8-full-2026-04-23-r1`
- Mean: `89.36`
- Median: `95`
- Grades: `31 A / 11 B / 1 C / 3 D / 4 F`
- Attempts: `850`
- False-positive applied: `0`

Why it is still provisional:
- Stage 41 gate still fails.
- Remaining hard debt is concentrated in protected-row instability and runtime tail, not broad engine weakness.
- Later Stage 44.9/44.10 preservation experiments traded one protected row for another and did not produce a stable accepted closeout.

## Known Debt

Protected-row debt to carry forward:
- `fixture-teams-original`
- `fixture-teams-remediated`

Runtime-tail debt to carry forward:
- `structure-4076`
- `structure-4438`

What is explicitly deferred:
- broad protected replay / best-state restore logic
- unstable alt-cleanup quarantine variants
- more fixture-specific preservation heuristics

## Freeze Decision

The correct reference for Stage 43/44 quality is the **best measured full run**, not the latest experimental source behavior.

This freeze keeps the useful general engine gains:
- Stage 43 table normalization
- Stage 44 figure target-selection / figure-ownership improvements
- Stage 35/36 mutation-truthfulness behavior
- replay/reporting diagnostics that help later debugging without changing default remediation behavior

This freeze drops or de-emphasizes unstable late experiments:
- global protected best-state restore
- broad protected alt-cleanup quarantine behavior
- late Stage 44 preservation branches that only move protected regressions around

## Current Cleanup Extraction

The current cleanup extraction run is:
- `Output/experiment-corpus-baseline/run-stage44-freeze-full-2026-04-23-r1`

That run is useful as a **cleanup checkpoint**, but it is **not** the quality reference:
- Mean: `87.44`
- Median: `94`
- Grades: `29 A / 9 B / 2 C / 5 D / 5 F`
- Attempts: `807`
- False-positive applied: `0`

It confirms the cleanup work removed unstable replay logic, but it also shows that some earlier protected-row recovery behavior was entangled with those branches. That is why Stage 45 should focus on code clarity and controlled re-introduction of any needed preservation logic, not more heuristic stacking.

## Stage 45 Direction

Stage 45 is a cleanup/stabilization stage, not a score-chasing stage.

Primary goals:
- simplify orchestrator post-pass and protected-flow logic
- remove dead or superseded Stage 44 experimental branches
- keep only one clear preservation model active at a time
- reduce coupling between figure cleanup, metadata top-up, protected-floor handling, and runtime trimming
- preserve deterministic routing, mutation truthfulness, and current table gains

Out of scope:
- public API changes
- scorer rebalance
- ICJIA-specific optimization
- semantic/LLM expansion
- new broad protected-row heuristics

## Acceptance Target For Stage 45

Stage 45 should be evaluated against the frozen provisional reference, not against Stage 41 acceptance:
- behaviorally equivalent or near-equivalent to the Stage 44 freeze reference set
- no false-positive `applied`
- no new protected-row regressions beyond the documented provisional debt
- no runtime regression

If a future stage resumes protected-row closeout, it should start from this freeze note and target only the documented debt instead of reopening broad replay policy.
