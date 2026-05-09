# Font-3448 Native Tagging Recovery

Date: 2026-05-08

## Decision

Promote the narrow `tag_native_text_blocks` useful-repair recovery for `font-3448`.

The diagnostic confirmed the exact same replay state diverged between the strict/table baseline and the current fixed-50 route:

- Replay state: `39be10e26232bf205f091beb`
- Strict/table baseline: `tag_native_text_blocks` applied, score `44 -> 83`, heading `0 -> 98`, reading order `0 -> 79`
- Current pre-fix route: `tag_native_text_blocks` rejected by `pac_rule_regressed(pdfua.content.orphan_mcids_absent)` while projecting heading and reading-order gains

The accepted behavior is limited to `pac_orphan_mcid_recovery(tag_native_text_blocks)`. It applies only when all PAC regressions are orphan-MCID regressions, total score improves, heading and reading order both improve, and page/text/tag evidence is preserved.

No PAC scoring caps, PAC gate allow-list entries, timeout defaults, table thresholds, API fields, AI defaults, planner breadth, or repair tools changed.

## Artifacts

- Diagnostic: `Output/experiment-corpus-baseline/font3448-native-tagging-diagnostic-2026-05-08-r1`
- Targeted validation: `Output/experiment-corpus-baseline/run-font3448-native-tagging-target-2026-05-08-r1`
- Fixed-50 validation: `Output/experiment-corpus-baseline/run-font3448-native-tagging-fixed50-2026-05-08-r1`
- Stage 41 gate: `Output/experiment-corpus-baseline/font3448-native-tagging-fixed50-gate-2026-05-08-r1`

## Validation

Targeted validation recovered `font-3448` to `93/A` with `false_positive_applied = 0`. Key controls held:

- `figure-4702`: `91/A`
- `font-4699`: `91/A`
- `font-4035`: `93/A`
- `fixture-accessible`: `96/A`
- `figure-4753`: `97/A`
- `long-4516`: `87/B`
- `long-4683`: `87/B`

Known parked rows remained parked:

- `structure-4438`: hard timeout, no eligible `90/A` checkpoint
- `structure-4076`: table/analyzer applicability volatility, `69/D` in the targeted run and `70/C` in fixed-50

Fixed original-50 validation repeated the recovery:

- Stage 41 candidate mean: `91.02`
- Stage 41 candidate median: `93`
- F count: `0`
- Protected regressions: `0`
- `false_positive_applied`: `0`
- `font-3448`: `93/A`
- `figure-4702`: `91/A`
- `font-4699`: `91/A`
- `long-4680`: in-run `92/A`, protected reanalyzed `73/C`; no checkpoint preservation was added
- `long-4683`: `91/A`

Stage 41 still fails operational gates: `structure-4438` timeout/route coverage, runtime p95/median, and total attempts. Those failures are not caused by the new native-tagging recovery and remain runtime/parked-debt work.

## Next Work

The next score work should not broaden orphan-MCID policy. Remaining low rows are strict-grader debt or parked route/runtime debt, especially `fixture-inaccessible`, `structure-3775`, `font-4057`, `long-4680`, `long-4700`, and `structure-4438`.

The next speed work should target runtime-tail admission/churn on `long-4683`, `long-4516`, `structure-4076`, `figure-4702`, and parked `structure-4438`.
