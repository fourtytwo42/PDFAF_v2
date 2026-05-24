# Georgia GDC Monthly Inmate Profiles Public Holdout

Date: 2026-05-24

Sources:

- Georgia Department of Corrections Research and Reports page: `https://gdc.georgia.gov/organization/about-gdc/research-and-reports`
- Profiles of All Inmates page: `https://gdc.georgia.gov/organization/about-gdc/agency-activity/research-and-reports/monthly-statistical-reports/profiles`
- 2026 profile archive: `https://gdc.georgia.gov/profile-all-inmates-during-2026`
- 2025 profile archive: `https://gdc.georgia.gov/profile-all-inmates-during-2025-archived`
- 2024 profile archive: `https://gdc.georgia.gov/profile-all-inmates-during-2024-archived`

This was a 20-PDF public holdout sample from official Georgia Department of Corrections monthly `Profile All Inmates` reports under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the first 20 eligible `Profile All Inmates` PDFs parsed from the 2026, 2025, and 2024 archive pages.
- Report mix: April 2026 through January 2026, all 2025 monthly profiles, then December 2024 through September 2024.
- Size cap: all 20 selected PDFs were under `10 MB`; selected files were about `560 KB` to `5.30 MB`.
- Validation: one bounded deterministic 20-file run, the standard low-row diagnostic, focused table target-resolution diagnostic, and temporary one-row mutation probes.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/georgia-gdc-monthly-inmate-profiles-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `66.95 -> 70.25`.
- Median after remediation: `69`.
- Grades after remediation: `1 A / 0 B / 0 C / 19 D / 0 F`.
- Rows below 93: `19`.
- Runtime p50/p95/max: `170578ms / 223604ms / 223620ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

Only `gagdcprofiles-07.pdf` remediated to A-grade (`28/F -> 94/A`). The other 19 rows remained at `69/D`, mostly with `table_markup=35` or `table_markup=0` and otherwise strong headings/reading order.

## Low-Row Diagnostic

The low-row diagnostic classified the source as `plan_high_impact_targeted_diagnostic` with recommended lane `table_target_resolution_needed`.

- Raw points needed for a mean of 93: `455`.
- Candidate class: `table_target_resolution_needed`.
- Candidate rows: `19`.
- Timeout/error rows: `0`.

## Table Target Diagnostic

Focused table target-resolution diagnostic used six representative D-grade rows plus the one A-grade same-source control.

- Decision: `plan_table_target_behavior_proof`.
- Stable focus candidates: `gagdcprofiles-01`, `gagdcprofiles-03`, `gagdcprofiles-08`, `gagdcprofiles-11`, `gagdcprofiles-14`, `gagdcprofiles-20`.
- Unsafe control candidates: `none`.
- Prior non-table target rows: `none`.
- Control `gagdcprofiles-07` stayed classified as `control_or_high_grade_noise`.

This is strong evidence of real, general table/header debt, but the existing mutators did not yet produce score-moving accepted repair behavior.

## Mutation Probe Findings

Temporary one-row probes on `gagdcprofiles-01` were run against local copies and deleted afterward.

- Explicit stable normalize target `67414_0` applied and reduced the selected target's irregular rows from `19` to `0`, but the row stayed `69/D` with `table_markup=35` and `pdf_ua_compliance=57`; table-header debt slightly worsened (`dataCellsWithoutHeaderCount 11126 -> 11131`), so the existing PAC guard correctly rejects this as unsafe.
- Header association before normalization reduced debt on selected refs but did not move score.
- Six disjoint native header-association batches reduced total unassociated data-cell debt from `11126` to `46` and missing header association count from `168` to `16`, but score, table markup, and PDF/UA stayed unchanged.
- Adding three native normalization passes after those header batches reduced strongly-irregular table count from `84` to `72`, but the row still stayed `69/D`.

## Decision

No source behavior change is accepted from this source. The source exposes high-impact report-scale table/header debt and a severe runtime tail, but the supported probes show the current native table tools can reduce underlying debt without moving the final score and can create PAC header-association risk when used in the wrong order.

The next safe table lane should focus on why large reductions in native header-association debt and strongly-irregular-table debt are not reflected in final `table_markup`/PDFUA outcomes before broadening planner admission or increasing expensive table passes. Do not add Georgia/source/date/PDF-specific gates, scorer masking, PAC relaxations, or no-score table work from this evidence.

Because no source behavior changed, no original-50 regression validation was required for this source.
