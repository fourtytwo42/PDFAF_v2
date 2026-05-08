# Protected Regression And Runtime Tail Split Diagnostic

Date: 2026-05-08

## Decision

This stage is diagnostic-only. No PAC scoring, PAC gates, timeout defaults, table thresholds, planner breadth, API shape, or remediation tools changed.

The `figure-4702` sequence recovery remains valid, and the fixed-50 Stage 41 candidate mean is still over `90` with `false_positive_applied = 0`. The remaining blockers split into two separate work streams:

- protected score regressions: `font-3448` route volatility and `long-4680` final reanalysis drift;
- runtime/attempt tail: repeated no-gain or rejected churn on `long-4683`, `structure-4076`, and `figure-4702`, long successful recovery on `long-4516`, and parked hard-timeout debt on `structure-4438`.

The next behavior stage should not broaden PAC policy. The highest-value score diagnostic is `long-4680` final reanalysis drift, followed by a separate same-state route/floor diagnostic for `font-3448`. The highest-value speed work is a runtime admission/churn stage for repeated no-gain rows, with `structure-4438` still parked unless a real `90/A` checkpoint appears.

## Artifacts

Inputs:

- Stage 42 reference: `Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7`
- Strict/table baseline: `Output/experiment-corpus-baseline/run-table-batch-parked-debt-fixed50-2026-05-08-r1`
- Current fixed-50: `Output/experiment-corpus-baseline/run-figure4702-sequence-fixed50-2026-05-08-r1`
- Stage 41 gate: `Output/experiment-corpus-baseline/figure4702-sequence-fixed50-gate-2026-05-08-r1`

Diagnostic output:

- `Output/experiment-corpus-baseline/protected-regression-runtime-split-diagnostic-2026-05-08-r1`

Source script:

- `scripts/protected-regression-runtime-split-diagnostic.ts`

## Fixed-50 Context

- Stage 41 candidate mean: `90.45`
- Run-summary reanalyzed mean: `89.92`
- p95 wall: `246350ms`
- attempts: `912`
- `false_positive_applied = 0`
- `figure-4702 = 91/A`
- `font-4699 = 91/A`
- `long-4700 = 78/C` with table debt reduction preserved

## Protected Regressions

| Row | Classification | Stage 42 | Strict/table baseline | Current | Current reanalyzed | Main evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `font-3448` | `route_volatility` | `86` | `93` | `51` | `51` | heading drops `98 -> 0`; reading order drops `100 -> 30`; strict-to-current same-state divergence at `tag_native_text_blocks` (`applied` vs `rejected`) |
| `long-4680` | `final_reanalysis_drift` | `87` | `92` | `80` | `59` | in-run state reaches `80/B`, protected reanalysis drops `21` points; title/language drops to `0`, alt drops, PDF/UA drops |

`font-3448` should not be patched from the aggregate score delta. It needs a focused route/floor diagnostic because it has route volatility and a same-state strict/current decision divergence.

`long-4680` is the cleaner score target. It needs final-reanalysis evidence and checkpoint-safety inspection before any row-specific preservation behavior is considered.

## Runtime Tail

| Row | Classification | Current | Wall | Notes |
| --- | --- | --- | --- | --- |
| `long-4683` | `repeated_no_gain_or_rejected_churn` | `92/A` | `295914ms` | quality is good, but `2` applied vs `12` rejected/no-effect tools makes it an admission/churn candidate |
| `long-4516` | `long_successful_recovery` | `85/B` | `251529ms` | recovered without hard timeout; preserve quality before suppressing work |
| `structure-4076` | `repeated_no_gain_or_rejected_churn` | `69/D` | `246350ms` | `4` applied vs `16` rejected/no-effect tools; remains parked table/analyzer debt |
| `figure-4702` | `repeated_no_gain_or_rejected_churn` | `91/A` | `206445ms` | sequence recovery works, but late churn remains expensive |
| `long-4680` | `final_reanalysis_tail` | `80/B -> 59/F` | `111545ms` | score blocker and runtime tail overlap |
| `structure-4438` | `hard_timeout` | n/a | n/a | parked runtime/checkpoint debt; keep `90/A` floor |

## Follow-Up

Recommended next stage:

1. Diagnose `long-4680` final reanalysis drift and checkpoint eligibility.
2. Diagnose `font-3448` route/floor divergence separately.
3. Open a runtime admission/churn stage only after the score regressions are classified, using the repeated no-gain rows as evidence.

Generated `Output/` artifacts and PDFs are intentionally untracked.
