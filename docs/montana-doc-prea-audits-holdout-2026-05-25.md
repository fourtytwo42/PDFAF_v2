# Montana DOC PREA Audits Holdout - 2026-05-25

## Summary

This was a public outside-corpus holdout using official Montana Department of Corrections PREA audit PDFs. The run was diagnostic-only: no scoring, planner, remediation, PAC gate, Docker, or API behavior changed.

- Source page: `https://cor.mt.gov/PREA/`
- Sample: all 20 facility PREA audit PDFs linked from the source page
- Size gate: all sampled PDFs were under 10MB
- Validation mode: deterministic bounded holdout, `--no-semantic --no-pdfs`
- Local run artifact: `/mnt/pdf-review/public-holdouts/montana-doc-prea-audits-2026-05-25/run-r1/baseline_report.json`

## Results

- PDFs processed: `20/20`
- Mean: `59.95 -> 84.65`
- Median: `59 -> 94`
- Minimum final score: `69`
- Grades after remediation: `11 A / 1 B / 0 C / 8 D / 0 F`
- Rows below `93`: `9`
- Runtime p50/p95/max: `24663ms / 72212ms / 104679ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

Low rows:

| File | Score | Class |
| --- | ---: | --- |
| `mtdocprea-01.pdf` | `69/D` | `table_target_resolution_needed` |
| `mtdocprea-02.pdf` | `69/D` | `table_target_resolution_needed` |
| `mtdocprea-05.pdf` | `69/D` | `table_target_resolution_needed` |
| `mtdocprea-07.pdf` | `69/D` | `table_target_resolution_needed` |
| `mtdocprea-09.pdf` | `69/D` | `table_target_resolution_needed` |
| `mtdocprea-10.pdf` | `69/D` | `table_target_resolution_needed` |
| `mtdocprea-12.pdf` | `69/D` | `table_target_resolution_needed` |
| `mtdocprea-13.pdf` | `69/D` | `reading_link_order_candidate` |
| `mtdocprea-08.pdf` | `87/B` | `table_target_resolution_needed` |

## Diagnostics

Low-row diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/montana-doc-prea-audits-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `167`

Focused table target-resolution diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/montana-doc-prea-audits-2026-05-25/table-target-resolution-r1/table-target-resolution-diagnostic.md`
- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: `mtdocprea-01`, `mtdocprea-02`, `mtdocprea-05`, `mtdocprea-07`, `mtdocprea-08`, `mtdocprea-09`, `mtdocprea-10`, `mtdocprea-12`
- Unsafe control candidates: `mtdocprea-11`, `mtdocprea-16`, `mtdocprea-17`
- Prior non-table target rows: none

Reading-order shell diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/montana-doc-prea-audits-2026-05-25/reading-order-shell-r1/reading-order-shell-diagnostic.md`
- Sequence candidates: `0`
- Safe route controls: `0`
- Recovered routes with final orphan debt: `1`
- `mtdocprea-13` classification: `unsafe_or_no_score_movement`

## Decision

No engine change was accepted from this holdout set.

Reasons:

- The dominant gap is PAC-like table/header association and dense table structure debt, but same-source A-grade controls also match the stable normalize-target predicate.
- Existing table tools already expose the relevant objects; the remaining issue is final PAC table/header correctness, not a safely missing broad admission rule.
- The one reading/link-order low did not show a score-moving native reading-order shell path.
- `false_positive_applied` stayed `0`, and there were no timeouts or runtime regressions.

No original-50 validation was required because no source behavior changed. Downloaded PDFs and generated validation artifacts were kept local only for metrics extraction and should be deleted after this diagnostic set is documented.
