# Long-4680 Protected Reanalysis Drift Diagnostic

Date: 2026-05-08

## Decision

This stage is diagnostic-only. No checkpoint preservation behavior was added for `long-4680`.

The in-run `80/B` state is not safe to preserve. Protected reanalysis repeats the same buffer five times and returns `59/F` every time, with no floor-safe repeat. More importantly, protected reanalysis exposes scored checker-facing evidence that the in-run analysis hid: `alt_text` changes from `100/not applicable` to `0/applicable`, with `8` missing-alt figures, and `table_markup` also becomes applicable. Preserving the in-run checkpoint would hide real PAC/POC-style evidence rather than recover analyzer-only drift.

## Artifacts

Inputs:

- Stage 42 reference: `Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7`
- Strict/table baseline: `Output/experiment-corpus-baseline/run-table-batch-parked-debt-fixed50-2026-05-08-r1`
- Current fixed-50: `Output/experiment-corpus-baseline/run-figure4702-sequence-fixed50-2026-05-08-r1`

Diagnostic output:

- `Output/experiment-corpus-baseline/long4680-protected-drift-diagnostic-2026-05-08-r1`

Source script:

- `scripts/long4680-protected-drift-diagnostic.ts`

## Result

| Field | Value |
| --- | --- |
| Classification | `real_pdf_regression` |
| In-run score | `80/B` |
| Protected reanalysis score | `59/F` |
| Final reanalysis drop | `21` |
| Protected repeat scores | `59, 59, 59, 59, 59` |
| Floor-safe repeats | `none` |
| Checkpoint safe | `false` |
| `false_positive_applied` | `false` |

Key category movement:

| Category | In-run | Protected reanalysis | Interpretation |
| --- | --- | --- | --- |
| `alt_text` | `100`, not applicable | `0`, applicable | unsafe applicability/evidence regression |
| `heading_structure` | `78` | `60` | protected score drop |
| `table_markup` | `100`, not applicable | `92`, applicable | newly measurable table evidence |
| `title_language` | `0` | `0` | still unresolved, not the source of the drop |
| `pdf_ua_compliance` | `50` | `50` | unchanged residual PAC debt |

The tool timeline repeatedly starts from replay state `17648326faae3ac116fa4062`. Metadata, orphan-MCID, PDF/UA, and font post-pass attempts are correctly rejected or no-effect because they reanalyze to `59/F` or do not move evidence.

## Follow-Up

Do not add `long-4680` checkpoint preservation from this evidence. Treat the row as real figure-alt/table applicability debt under protected reanalysis.

Recommended next stage:

1. Diagnose `font-3448` same-state `tag_native_text_blocks` divergence because it remains the cleaner non-parked protected score regression.
2. Keep runtime work separate: repeated no-gain/rejected churn on `long-4683`, `structure-4076`, and `figure-4702` should be handled by a runtime admission/churn stage, not by checkpoint preservation.
3. Leave `structure-4438` parked unless a real `90/A` checkpoint appears.

Generated `Output/` artifacts and PDFs are intentionally untracked.
