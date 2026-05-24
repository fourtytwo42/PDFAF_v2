# Maryland DPSCS PREA Audits Holdout - 2026-05-24

## Source

- Source page: `https://dpscs.maryland.gov/prea/prea-audits.shtml`
- Agency: Maryland Department of Public Safety and Correctional Services
- Sample: first 20 usable facility PREA audit report PDFs from the public audit-report table
- Constraint: all PDFs were official public-source PDFs and below 10 MB

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/maryland-dpscs-prea-audits-2026-05-24/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean: `70.25 -> 76.10`
- Median after remediation: `69`
- Grades after remediation: `5 A / 1 B / 0 C / 14 D / 0 F`
- Rows below `93`: `16`
- Runtime p50/p95/max: `33477ms / 66840ms / 71707ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Sample

| id | year | facility | bytes |
| --- | --- | --- | ---: |
| `mddpsprea-01` | 2023 | Baltimore Central Booking and Intake Center | 541390 |
| `mddpsprea-02` | 2018 | Baltimore City Correctional Center | 1025670 |
| `mddpsprea-03` | 2024 | Baltimore City Correctional Center | 706977 |
| `mddpsprea-04` | 2015 | Brockbridge Correctional Facility | 944367 |
| `mddpsprea-05` | 2018 | Brockbridge Correctional Facility | 971372 |
| `mddpsprea-06` | 2017 | Chesapeake Detention Facility (Formerly MCAC) | 662640 |
| `mddpsprea-07` | 2024 | Chesapeake Detention Facility (Formerly MCAC) | 708362 |
| `mddpsprea-08` | 2018 | Central Maryland Correctional Facility (Formerly CLF) | 1563665 |
| `mddpsprea-09` | 2024 | Central Maryland Correctional Facility (Formerly CLF) | 700333 |
| `mddpsprea-10` | 2016 | Dorsey Run Correctional Facility | 699974 |
| `mddpsprea-11` | 2019 | Dorsey Run Correctional Facility | 2302835 |
| `mddpsprea-12` | 2021 | Dorsey Run Correctional Facility | 1181960 |
| `mddpsprea-13` | 2016 | Eastern Pre-Release Unit | 1874463 |
| `mddpsprea-14` | 2019 | Eastern Pre-Release Unit | 1141073 |
| `mddpsprea-15` | 2017 | Eastern Correctional Institution | 1109095 |
| `mddpsprea-16` | 2018 | Jessup Correctional Institution | 2231800 |
| `mddpsprea-17` | 2024 | Jessup Correctional Institution | 724574 |
| `mddpsprea-18` | 2018 | Maryland Correctional Institution - Hagerstown | 1763900 |
| `mddpsprea-19` | 2024 | Maryland Correctional Institution - Hagerstown | 705941 |
| `mddpsprea-20` | 2018 | Maryland Correctional Institution - Jessup | 2457938 |

## Diagnostics

Low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `338`
- Table-target rows: `14`
- `no_safe_predicate` rows: `1`
- Near-miss rows: `1`
- Timeout/error rows: `0`

Table target-resolution diagnostic:

- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: `mddpsprea-02`, `mddpsprea-03`, `mddpsprea-07`, `mddpsprea-08`, `mddpsprea-09`, `mddpsprea-10`, `mddpsprea-11`, `mddpsprea-13`, `mddpsprea-14`, `mddpsprea-16`, `mddpsprea-17`, `mddpsprea-19`, `mddpsprea-20`
- Unsafe same-source control candidates: `mddpsprea-01`, `mddpsprea-05`, `mddpsprea-06`
- Prior non-table target rows: `mddpsprea-12`, `mddpsprea-15`, `mddpsprea-18`
- Classification counts: `16 stable_normalize_target`, `5 control_or_high_grade_noise`, `3 non_table_target_attempt`, `1 layout_only_no_table_target`

Observed table-tool outcomes in the baseline run:

- `25` `set_table_header_cells` attempts returned `no_effect:no_structural_change`.
- `21` `normalize_table_structure` attempts rejected with `pac_rule_regressed(pdfua.table.header_association_present)`.
- `18` `repair_native_table_headers` attempts rejected with `pac_rule_regressed(pdfua.table.header_association_present)`.
- `8` `normalize_table_structure` attempts and `8` `repair_native_table_headers` attempts rejected with `pac_rule_regressed(pdfua.content.orphan_mcids_absent)`.
- A small number of table tools applied, but the overall holdout remained far below target.

## Decision

No remediation, scorer, planner, analyzer, or PAC-gate behavior was accepted from this holdout.

Maryland adds useful contrast to the PREA table/header lane: several low rows expose stable object-backed table targets, but same-source rows that already remediate to A-grade also match the same target shape. That makes broad admission unsafe. Future table work still needs a transaction proof that separates true low-score table/header debt from controls, preserves PAC table-header visibility, and reduces final PAC debt rather than only reducing intermediate irregular-table counts.

Because no source behavior changed, original-50 validation was not required. Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.
