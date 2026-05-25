# California POST Publications Holdout - 2026-05-25

## Summary

This was a public outside-corpus holdout using California Commission on POST publication PDFs. The run was diagnostic-only: no scoring, planner, remediation, PAC gate, Docker, or API behavior changed.

- Source page: `https://post.ca.gov/Publication-List`
- Sample: first 20 unique direct PDF downloads from the official POST publication list that completed successfully and were under 10MB
- Duplicate handling: PDF downloads were de-duplicated by SHA-256 before counting the sample
- Validation mode: deterministic bounded holdout, `--no-semantic --no-pdfs`
- Local run artifact before cleanup: `/mnt/pdf-review/public-holdouts/california-post-publications-2026-05-25/run-r1/baseline_report.json`

## Results

- PDFs processed: `20/20`
- Completed without row error: `19/20`
- Mean after completed rows: `64.68 -> 89.4211`
- Mean after all rows: `84.95`
- Median after all rows: `93`
- Grades after remediation: `13 A / 3 B / 0 C / 2 D / 1 F / 1 timeout`
- Rows below `93`: `10`, counting the timeout row
- Runtime p50/p95/max: `32487ms / 218292ms / 300002ms`
- Timeout/error rows: `1`
- `false_positive_applied`: `0`

Low rows:

| File | Title | Score | Class |
| --- | --- | ---: | --- |
| `capostpub-08.pdf` | POST Guidelines for the Investigation of Child Physical Abuse and Neglect, Child Sexual Abuse and Exploitation | `0/?` | `timeout_or_error` |
| `capostpub-04.pdf` | Background Investigation File-PSD | `59/F` | `no_safe_predicate` |
| `capostpub-11.pdf` | RIVER CITY POLICE | `69/D` | `table_target_resolution_needed` |
| `capostpub-12.pdf` | RIVER CITY POLICE | `69/D` | `table_target_resolution_needed` |
| `capostpub-13.pdf` | CA Coroner Occupational Analysis Report | `82/B` | `reading_link_order_candidate` |
| `capostpub-16.pdf` | DeEscalation Publication | `87/B` | `no_safe_predicate` |
| `capostpub-06.pdf` | Becoming an Exemplary Peace Officer - The Guide to Ethical Decision Making | `88/B` | `reading_link_order_candidate` |
| `capostpub-09.pdf` | POST Guidelines for Child Safety - When a Custodial Parent or Guardian is Arrested | `90/A` | `near_miss_monitor` |
| `capostpub-14.pdf` | SB11_Instructor_Guide | `90/A` | `near_miss_monitor` |
| `capostpub-19.pdf` | Driver Training Instructor Manual August 2021 | `91/A` | `near_miss_monitor` |

## Diagnostics

Low-row diagnostic:

- Local artifact before cleanup: `/mnt/pdf-review/public-holdouts/california-post-publications-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `161`
- Lane split:
  - `timeout_or_error`: `1` row, `93` raw points
  - `table_target_resolution_needed`: `2` rows, `48` raw points
  - `no_safe_predicate`: `2` rows, `40` raw points
  - `reading_link_order_candidate`: `2` rows, `16` raw points
  - `near_miss_monitor`: `3` rows, `8` raw points

Timeout repeat:

- Local artifact before cleanup: `/mnt/pdf-review/public-holdouts/california-post-publications-2026-05-25/timeout-repeat-r1/baseline_report.json`
- `capostpub-08.pdf` repeated as `90/A` in `166066ms`, with `false_positive_applied=0`.
- This shows the timeout is runtime/analyzer volatility rather than a deterministic hard failure, but the official 20-row source result remains the fresh all-row mean `84.95`.

Table target-resolution diagnostic:

- Local artifact before cleanup: `/mnt/pdf-review/public-holdouts/california-post-publications-2026-05-25/table-target-resolution-r1/table-target-resolution-diagnostic.md`
- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: `capostpub-11`, `capostpub-12`
- Unsafe control candidates: `capostpub-03`
- Prior non-table target rows: none
- Classification counts: `3` stable normalize targets, `6` control/high-grade noise rows

The two focus rows have real object-backed table-shape and PAC table-header debt, but an A-grade same-source control also matched the stable table-normalization predicate. Existing table attempts on the focus rows also hit PAC table-header guards such as `pdfua.table.headers_present` and `pdfua.table.header_association_present`. That is not clean enough for planner promotion.

Reading-order shell diagnostic:

- Local artifact before cleanup: `/mnt/pdf-review/public-holdouts/california-post-publications-2026-05-25/reading-order-shell-r1/reading-order-shell-diagnostic.md`
- Sequence candidates needing proposal cleanup: `0`
- Safe route controls: `0`
- Recovered routes with final orphan debt: `1`
- Selected rows: none

The reading/link-order lane had no native shell route to promote. The one recovered route was an A-grade caution/control with remaining orphan-debt evidence, not a behavior proof.

## Decision

No engine change was accepted from this holdout set.

Reasons:

- The source missed mean `93`, but the high-impact lanes are not safe to promote.
- The timeout row is volatile and did complete on a focused repeat, but no general runtime fix was identified.
- Table evidence is real on the focus rows, but the same predicate triggered an A-grade same-source control.
- Reading-order shell diagnostics found no selected rows.
- Two major lows are `no_safe_predicate` from the run artifact alone.
- `false_positive_applied` stayed `0`.

No original-50 validation was required because no source behavior changed. Downloaded PDFs and generated validation artifacts were kept local only for metrics extraction and were deleted after this diagnostic set was documented.
