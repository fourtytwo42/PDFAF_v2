# South Carolina DPPPS Annual Statistical Reports Holdout - 2026-05-25

## Source

- Public source: South Carolina Department of Probation, Parole and Pardon Services annual statistical reports.
- Source page: `https://www.dppps.sc.gov/about-ppp/statistics-and-reports/legislative-reports/annual-statistical-reports`
- Sample: 20 official annual statistical report PDFs, 2024 through 2005.
- Size gate: every downloaded PDF was under 10 MiB.
- Local PDFs and generated validation artifacts were temporary under `/mnt/pdf-review/public-holdouts/south-carolina-dppps-annual-statistical-reports-2026-05-25/` and are not source assets.

## Validation

- Command family: deterministic bounded holdout validation with `--no-semantic --no-pdfs`.
- Run artifact: `/mnt/pdf-review/public-holdouts/south-carolina-dppps-annual-statistical-reports-2026-05-25/run-r1/baseline_report.json`
- Completed: `20/20`
- Mean: `90.4000`
- Median: `95`
- Grades: `17 A / 0 B / 0 C / 2 D / 1 F`
- Rows below `93`: `4`
- Runtime p50/p95/max: `21123ms / 194729ms / 203535ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Low-Row Diagnostics

Low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/south-carolina-dppps-annual-statistical-reports-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `52`

Low rows:

| Row | Score | Classification | Notes |
| --- | ---: | --- | --- |
| `scdppps-10` / 2015 | `69/D` | `table_target_resolution_needed` | Stable table/PAC debt, but prior table tool target resolved to a non-table `TD`. |
| `scdppps-11` / 2014 | `69/D` | `table_target_resolution_needed` | Stable table/PAC debt, but prior table tool target resolved to a non-table `Span`. |
| `scdppps-20` / 2005 | `59/F` | `no_safe_predicate` | Real heading debt (`heading_structure=0`) but no safe object-backed predicate from the run artifact. |
| `scdppps-02` / 2023 | `92/A` | `near_miss_monitor` | Repeated at `95/A`, so not stable target debt. |

Table target-resolution diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/south-carolina-dppps-annual-statistical-reports-2026-05-25/table-target-resolution-r1/table-target-resolution-diagnostic.md`
- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: `none`
- Unsafe control candidates: `scdppps-01`, `scdppps-12`
- Prior non-table target rows: `scdppps-10`, `scdppps-11`

Low-row repeat:

- Artifact: `/mnt/pdf-review/public-holdouts/south-carolina-dppps-annual-statistical-reports-2026-05-25/low-repeat-r1/baseline_report.json`
- Rows: `scdppps-02`, `scdppps-10`, `scdppps-11`, `scdppps-20`
- Scores: `95`, `69`, `69`, `59`
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`

## Decision

This holdout is diagnostic-only. It did not meet the source target mean of `93`, but the apparent improvement lane is not safe to promote:

- The two high-impact table rows reproduce at `69/D`, so the debt is real and stable.
- Current table target resolution does not provide a clean object-backed focus target.
- Same-source controls also expose table targets, so broad table admission would be unsafe.
- The 2005 zero-heading row has real debt but no safe general object-backed heading predicate from this evidence.

No source behavior changed, so no original-50 regression validation was required. The downloaded PDFs and generated artifacts should be deleted after metrics extraction.
