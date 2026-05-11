# All-Input Repeat Recovery Feasibility

This diagnostic supports the active all-input mean goal after the complete r5 validation landed at mean `92.0456`.

It does not change scoring, PAC gates, timeout policy, planner routing, semantic defaults, or remediation behavior. It answers one question: whether bounded source-level retry of low rows is promising enough to design a behavior stage.

## Why This Exists

Several below-target rows can recover to A-grade in focused current-engine runs, but the complete r5 all-input run missed them. Prior route diagnostics show a mix of:

- honest current-engine repeat recoveries;
- semantic planning evidence that must stay opt-in;
- expensive recoveries that would hurt runtime if promoted blindly;
- parked rows such as `structure-4438`, `structure-4076`, `long-4516`, and `long-4683`.

The diagnostic separates those cases before any retry behavior is considered.

## Current Artifact

- Script: `scripts/all-input-repeat-recovery-feasibility-diagnostic.ts`
- Local output: `Output/goal-all-input-mean-2026-05-09-r1/repeat-recovery-feasibility-r5-complete-2026-05-11-r1`
- Baseline report: `Output/goal-all-input-mean-2026-05-09-r1/r5-complete-baseline-report-2026-05-11-r1/baseline_report.json`

## Promotion Rule

A future behavior stage may use this report only for rows classified as `bounded_retry_candidate`.

Do not promote:

- `semantic_planning_candidate` rows without an explicit opt-in semantic stage;
- `runtime_expensive_candidate` rows without a runtime policy;
- parked hard-timeout/protected-drift rows;
- candidates with `false_positive_applied > 0`;
- already above-target polish rows as mean-goal blockers.

If bounded retry is implemented, it must keep the existing per-PDF wall budget and select only a final verified result with `false_positive_applied = 0`.
