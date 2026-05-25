# Minnesota Judicial Branch Publications Holdout - 2026-05-25

## Source

- Public source: Minnesota Judicial Branch publications and reports pages.
- Source pages:
  - `https://mncourts.gov/about-the-courts/publicationsandreports`
  - `https://mncourts.gov/about-the-courts/publicationsandreports/mjb-performance-measures`
- Sample: 20 unique official Minnesota Judicial Branch report PDFs that downloaded successfully, verified as PDFs, and were under 10 MiB.
- Download note: the annual-reports page only yielded 16 retained under-cap PDFs; the sample was completed with the first four under-cap performance-measure reports from the same official publications area.
- Size gate: every retained PDF was under 10 MiB; largest retained file was about `9.4 MB`.
- Local PDFs and generated validation artifacts were temporary under `/mnt/pdf-review/public-holdouts/minnesota-judicial-branch-publications-2026-05-25/` and are not source assets.

## Validation

- Command family: deterministic bounded holdout validation with `--no-semantic --no-pdfs`.
- Run artifact: `/mnt/pdf-review/public-holdouts/minnesota-judicial-branch-publications-2026-05-25/run-r1/baseline_report.json`
- Completed: `20/20`
- Mean: `91.4500`
- Median: `93`
- Grades: `16 A / 3 B / 0 C / 1 D / 0 F`
- Rows below `93`: `6`
- Runtime p50/p95/max: `43608ms / 159108ms / 165847ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

Low rows:

| Row | Score | Notes |
| --- | ---: | --- |
| `mncourts-02-2021.pdf` | `91/A` | Near miss. |
| `mncourts-03-2020.pdf` | `87/B` | No safe lane from run artifact. |
| `mncourts-04-2019.pdf` | `89/B` | Near miss; recovered to `91/A` on repeat. |
| `mncourts-08-2010.pdf` | `92/A` | Reading/link near miss. |
| `mncourts-19-2023-report.pdf` | `66/D` | Stable table/header-association debt. |
| `mncourts-20-2022-report.pdf` | `85/B` | Stable table/header-association debt. |

## Low-Row Diagnostics

Low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/minnesota-judicial-branch-publications-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `31`

Repeat/control run:

- Artifact: `/mnt/pdf-review/public-holdouts/minnesota-judicial-branch-publications-2026-05-25/repeat-r1/baseline_report.json`
- Rows: six lows plus same-source controls `mncourts-01`, `mncourts-05`, `mncourts-17`, and `mncourts-18`.
- Stable lows: `mncourts-19` repeated at `66/D`; `mncourts-20` repeated at `85/B`.
- Volatility notes: `mncourts-03` dipped from `87/B` to `84/B`; `mncourts-04` recovered from `89/B` to `91/A`; `mncourts-08` moved from `92/A` to `91/A`.
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`

Repeat low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/minnesota-judicial-branch-publications-2026-05-25/repeat-low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `40`

Table target-resolution diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/minnesota-judicial-branch-publications-2026-05-25/table-target-resolution-r1/table-target-resolution-diagnostic.md`
- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: `mncourts-19`, `mncourts-20`
- Unsafe same-source control candidates: `mncourts-17`, `mncourts-18`
- Prior non-table target rows: none
- Rejection reason: stable object-backed table targets alone are not sufficient; controls trigger the same table-target class, and prior table attempts include `pac_rule_regressed(pdfua.table.header_association_present)` and `pac_rule_regressed(pdfua.figure.alt_present)`.

## Decision

This holdout is diagnostic-only and did not receive a behavior change. The source finished below target at mean `91.4500`, with two stable low table/header-association rows carrying enough points to matter. However, the available evidence does not justify a safe general remediation change:

- the same target-resolution predicate triggers same-source controls `mncourts-17` and `mncourts-18`;
- prior table normalization/header tools on this family still show PAC table-header and figure-alt regression risks;
- the lower near-miss annual-report rows show some route volatility rather than a clean structural fixer lane;
- broadening table admission from this evidence would be document-family fitting rather than a proven PAC-safe general rule.

No source behavior changed, so no original-50 regression validation was required. Downloaded PDFs and generated artifacts should be deleted after metrics extraction. Future table work should revisit this source only through a stricter transaction proof that reduces or preserves final PAC table/header debt on positives while staying off controls.
