# Runtime Tail And Attempt Diagnostic

Date: 2026-05-09

## Decision

Do not add runtime suppression behavior from this pass.

The current fixed-50 candidate already meets the quality target after `font-3448` recovery, but Stage 41 still fails operational gates. The diagnostic confirms the remaining failures are not PAC scoring or gate policy issues:

- `structure-4438` is parked hard-timeout/checkpoint debt.
- `long-4516` and `long-4683` are expensive but complete with acceptable quality.
- `structure-4076`, `font-4057`, and `figure-4754` are low-score residual/parked debt and should not be hidden by runtime guards.
- `long-4680` is final/protected reanalysis debt with a real score drop, not a checkpoint-preservation candidate.
- `figure-4702` shows optional post-pass churn, but it is a recovered `91/A` row and needs targeted row/tool-state proof before any suppression.

No PAC scoring caps, PAC gate allow-list entries, timeout defaults, table thresholds, API fields, AI defaults, planner breadth, or repair tools changed.

## Artifacts

- Diagnostic script: `scripts/runtime-tail-attempt-diagnostic.ts`
- Diagnostic output: `Output/experiment-corpus-baseline/runtime-tail-attempt-diagnostic-2026-05-09-r1`
- Baseline run: `Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7`
- Candidate run: `Output/experiment-corpus-baseline/run-font3448-native-tagging-fixed50-2026-05-08-r1`
- Gate output: `Output/experiment-corpus-baseline/font3448-native-tagging-fixed50-gate-2026-05-08-r1`

## Findings

Stage 41 failures remain:

- `analyze_success`
- `remediate_success`
- `route_summary_coverage`
- `runtime_p95_wall`
- `runtime_median_wall`
- `total_tool_attempts`

Diagnostic classification:

- `parked_hard_timeout`: `structure-4438`
- `quality_gain_runtime_tradeoff`: `long-4516`, `long-4683`
- `optional_postpass_churn`: `figure-4702`
- `final_reanalysis_tail`: `long-4680`
- `residual_score_debt_not_runtime_fix`: `structure-4076`, `font-4057`, `figure-4754`

The only narrow guard candidate is `figure-4702` optional post-pass churn. It should not be implemented from this single full-run artifact because the row depends on the structure-annotation sequence to stay at `91/A`.

## Next Work

If runtime remains the priority, run a targeted repeat/probe only for `figure-4702` optional post-pass churn:

- compare current `91/A` route with a candidate that stops after the verified sequence recovery;
- require `false_positive_applied = 0`;
- require final `figure-4702 >=91/A`;
- preserve `font-3448`, `font-4699`, `long-4700`, `font-4035`, and `fixture-accessible`;
- do not touch `structure-4438`, `structure-4076`, `long-4680`, `font-4057`, or `figure-4754` until their underlying debt is addressed.
