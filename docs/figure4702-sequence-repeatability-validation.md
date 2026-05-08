# Figure-4702 Sequence Repeatability Validation

Date: 2026-05-08

## Decision

The `figure-4702` structure-then-annotation sequencing probe is repeatable enough to keep under the current parked-debt policy.

Three targeted repeats all recovered `figure-4702` to `91/A` with `structure_annotation_sequence_recovered` and `false_positive_applied = 0`. The table observation rows also stayed stable: `font-4699` remained `91/A`, and `long-4700` kept the table-header debt reduction while remaining score-capped at `78/C`.

Fixed original-50 validation was run because the repeat diagnostic returned `proceed_to_fixed50`.

## Targeted Repeats

Runs:

- `Output/experiment-corpus-baseline/run-figure4702-sequence-repeat-2026-05-08-r1`
- `Output/experiment-corpus-baseline/run-figure4702-sequence-repeat-2026-05-08-r2`
- `Output/experiment-corpus-baseline/run-figure4702-sequence-repeat-2026-05-08-r3`
- Diagnostic: `Output/experiment-corpus-baseline/figure4702-sequence-repeatability-diagnostic-2026-05-08-r1`

Repeatability summary:

| Row | Classification | Result |
| --- | --- | --- |
| `figure-4702` | `sequence_stable` | `91/A` in all 3 repeats |
| `long-4700` | `table_observation_stable` | `78/C` in all repeats with table debt reduction |
| `font-4699` | `table_observation_stable` | `91/A` in all repeats |
| `long-4683` | `sequence_stable` | `91/A` to `96/A` |
| `structure-4438` | `parked_runtime_debt` | hard timeout in all repeats |
| `fixture-inaccessible` | `parked_route_volatility` | `79/C` to `95/A` |
| `figure-4754` | `parked_route_volatility` | `67/D` to `78/C` |
| `long-4516` | `parked_route_volatility` | `85/B` to `89/B`, one hard-timeout repeat |
| `structure-3775` | `parked_route_volatility` | `93/A` in these repeats; remains parked due prior route volatility |

No repeat had `false_positive_applied`.

## Fixed-50 Result

Run:

- `Output/experiment-corpus-baseline/run-figure4702-sequence-fixed50-2026-05-08-r1`
- Gate: `Output/experiment-corpus-baseline/figure4702-sequence-fixed50-gate-2026-05-08-r1`

Summary:

- Stage 41 candidate mean: `90.45`; median: `94`
- Reanalyzed mean in run summary: `89.92`; reanalyzed median: `94`
- Grades after remediation: `40 A / 3 B / 2 C / 3 D / 1 F`
- Grades after protected reanalysis: `40 A / 1 B / 3 C / 3 D / 2 F`
- `false_positive_applied = 0`
- `figure-4702 = 91/A`
- `long-4516 = 85/B`
- `long-4683 = 92/A`
- `font-4699 = 91/A`
- `long-4700 = 78/C`
- `structure-4438` remains the sole hard timeout.

Stage 41 gate still fails:

- `analyze_success`, `remediate_success`, and `route_summary_coverage` because parked `structure-4438` timed out.
- `runtime_p95_wall` because p95 is `246350ms`.
- `total_tool_attempts` because attempts increased to `912`.
- `protected_file_regressions` because non-sequence parked/legacy rows still regress versus Stage 42.

The top non-sequence score regressions in the gate are `font-3448` and `long-4680`. These were not patched in this stage because the requested change was repeatability validation for the `figure-4702` probe, not a new fixer stage.

## Follow-Up

Keep the `figure-4702` sequence probe and current table batch behavior. The next stage should not change PAC scoring or gates; it should either:

- diagnose `font-3448` / `long-4680` as the next non-parked protected-regression blockers, or
- open a runtime-tail/attempt-reduction stage for `structure-4438`, `long-4683`, `long-4516`, and `structure-4076`.

Generated `Output/` artifacts and PDFs are intentionally untracked.
