# Protected Fixed-50 Goal Audit

Date: 2026-05-09

## Objective Checklist

- Fixed original-50 validation under current strict PAC grader: run completed at `Output/experiment-corpus-baseline/run-goal-protected-fixed50-2026-05-09-r1`.
- Stage 42 protected baseline restored/regenerated: `Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7`, regenerated from commit `f19eab5` in a detached worktree.
- Stage 41 gate run: `Output/experiment-corpus-baseline/goal-stage41-gate-protected-fixed50-2026-05-09-r1`.
- Scoring strictness/PAC gates/timeouts: no source behavior kept in this audit; the rejected figure-4702 probe was reverted.
- Mean target: Stage 41 gate mean passes (`88 -> 90.35`), but benchmark summary reanalyzed mean is `89.08` across successful rows.
- `false_positive_applied = 0`: Stage 41 gate passes this check.
- Protected regressions: Stage 41 gate fails with `2` unexplained protected regressions.
- Hard timeout policy: only parked `structure-4438` hard-times out in the protected run.
- Runtime/attempt gates: Stage 41 fails p95, median runtime, and total attempts.

## Stage 41 Result

Gate output:

- `Output/experiment-corpus-baseline/goal-stage41-gate-protected-fixed50-2026-05-09-r1`

Failed gates:

- `analyze_success`
- `remediate_success`
- `route_summary_coverage`
- `protected_file_regressions`
- `runtime_p95_wall`
- `runtime_median_wall`
- `total_tool_attempts`

Passed quality/safety gates:

- score mean floor
- score median floor
- F-grade count
- heading no-effect bound
- `false_positive_applied`

## Current Non-Parked Blockers

The current protected-baseline candidate is not acceptance-ready. Diagnostic output:

- `Output/experiment-corpus-baseline/current-fixed50-acceptance-diagnostic-protected-2026-05-09-r1`

Non-parked low-score rows:

- `figure-4702`: `59/F`
- `long-4470`: `59/F`
- `long-4683`: `59/F`
- `long-4700`: `78/C`

Parked rows remain:

- `structure-4438`: runtime/checkpoint debt.
- `structure-4076`: analyzer/table-applicability debt.
- `short-4074`: analyzer/figure-applicability drift.
- `font-4057`: mixed table/alt/annotation residual debt.
- `figure-4754`: route volatility.

## Rejected Probe

A narrow experiment added `repair_alt_text_structure` to the existing `figure-4702` structure-annotation sequence.

Single-row protected validation:

- `Output/experiment-corpus-baseline/run-figure4702-protected-sequence-alt-target-2026-05-09-r1`
- Result: `figure-4702` recovered to `91/A`, with `false_positive_applied = 0`.

Broader targeted validation:

- `Output/experiment-corpus-baseline/run-figure4702-protected-sequence-alt-target-2026-05-09-r2`
- Result: `figure-4702` repeated the bad `59/F` route, so the behavior was not kept.

Decision:

Do not promote the alt-in-sequence change. It is not repeatable under targeted protected-baseline validation and would not satisfy the goal's targeted-validation rule.

## Next Direction

Do not mark the goal complete. The next checkpoint should diagnose protected-baseline route volatility across `figure-4702`, `long-4470`, `long-4683`, and `long-4700`, then either prove a narrow same-state behavior change or explicitly park those rows with source evidence. No broad PAC, scoring, timeout, planner, or repair expansion is justified from this audit.
