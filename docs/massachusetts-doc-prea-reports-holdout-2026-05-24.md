# Massachusetts DOC PREA Reports Holdout - 2026-05-24

## Source

- Current source page: `https://www.mass.gov/lists/prea-reports`
- Archive source page: `https://www.mass.gov/lists/department-of-correction-archive-in-place#prea-audit-reports-`
- Agency: Massachusetts Department of Correction
- Sample: all 20 available PREA audit report PDFs exposed by the current page plus the archive
- Constraint: all counted PDFs were official Mass.gov PDFs and below 10 MB by actual downloaded size

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/massachusetts-doc-prea-reports-2026-05-24/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean: `65.40 -> 68.85`
- Median after remediation: `69`
- Grades after remediation: `0 A / 0 B / 0 C / 20 D / 0 F`
- Rows below `93`: `20`
- Runtime p50/p95/max: `35335ms / 250101ms / 262555ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Sample

| id | year | facility | bytes |
| --- | --- | --- | ---: |
| `madocprea-01` | 2026 | Pondville Correctional Center | 761008 |
| `madocprea-02` | 2026 | Old Colony Correctional Center | 785138 |
| `madocprea-03` | 2026 | Massachusetts Treatment Center | 780050 |
| `madocprea-04` | 2025 | Northeastern Correctional Center | 793693 |
| `madocprea-05` | 2025 | North Central Correctional Institution | 836569 |
| `madocprea-06` | 2025 | MCI - Shirley | 832444 |
| `madocprea-07` | 2025 | MCI - Framingham | 836631 |
| `madocprea-08` | 2024 | Souza Baranowski Correctional Center | 858074 |
| `madocprea-09` | 2024 | MCI - Norfolk | 831821 |
| `madocprea-10` | 2024 | Boston Pre-Release Center | 820981 |
| `madocprea-11` | 2021 | Boston Pre-Release Center | 4692010 |
| `madocprea-12` | 2021 | MCI - Norfolk | 5249464 |
| `madocprea-13` | 2021 | Souza Baranowski Correctional Center | 5322320 |
| `madocprea-14` | 2022 | MCI-Concord | 1691646 |
| `madocprea-15` | 2022 | MCI-Framingham | 1123542 |
| `madocprea-16` | 2022 | MCI-Shirley | 1707685 |
| `madocprea-17` | 2022 | North Central Correctional Institution | 939020 |
| `madocprea-18` | 2023 | Massachusetts Treatment Center | 867980 |
| `madocprea-19` | 2023 | Old Colony Correctional Center | 851810 |
| `madocprea-20` | 2023 | Pondville Correctional Center | 794118 |

## Diagnostics

Low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `483`
- Table-target rows: `17`, carrying `411` raw points
- Metadata/PDF-UA rows: `3`, carrying `72` raw points
- Timeout/error rows: `0`

Table target-resolution diagnostic:

- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: `madocprea-01`, `madocprea-02`, `madocprea-03`, `madocprea-04`, `madocprea-05`, `madocprea-06`, `madocprea-07`, `madocprea-08`, `madocprea-09`, `madocprea-10`, `madocprea-14`, `madocprea-15`, `madocprea-16`, `madocprea-17`, `madocprea-18`, `madocprea-19`, `madocprea-20`
- Unsafe same-source control candidates: `madocprea-11`, `madocprea-12`, `madocprea-13`
- Prior non-table target rows: none
- Classification counts: `20 stable_normalize_target`, `5 control_or_high_grade_noise`

Observed table-tool outcomes in the baseline run:

- `57` `set_table_header_cells` attempts returned `no_effect`.
- `42` `normalize_table_structure` attempts rejected.
- `37` `normalize_table_structure` attempts applied but did not recover the rows.
- `34` `repair_native_table_headers` attempts rejected.
- `29` `repair_native_table_headers` attempts returned `no_effect`.
- The dominant PAC rejection string was `pac_rule_regressed(pdfua.table.header_association_present)` with `110` occurrences.

PDF/UA catalog syntax diagnostic:

- Decision: `plan_catalog_settings_behavior_validation`
- Focus rows: `madocprea-11`, `madocprea-12`, `madocprea-13`
- Control: `pdfaf_fixture_accessible`
- Classification: the three focus rows were `catalog_settings_behavior_candidate`; the control stayed `catalog_syntax_noise_or_control`
- This remains diagnostic-only because the baseline run already applied title/language/PDF-UA tools on these rows, final scores stayed `69/D`, and no final-PDF transaction proof or original-50 validation was run.

## Decision

No remediation, scorer, planner, analyzer, or PAC-gate behavior was accepted from this holdout.

Massachusetts reinforces the PREA table/header pattern but does not give a safe promotion discriminator. Most rows expose stable object-backed table targets, but the same-source metadata/PDF-UA residuals also match the stable table-target shape. Current table tools already attempt the lane and mostly fail honestly on PAC-visible table-header association regressions or no structural effect. Suppressing `pdfua.table.header_association_present` would be the wrong fix.

The 2021 rows may justify a separate catalog-settings final-PDF proof later, but this holdout did not establish a behavior change: existing metadata tools fired and the final deterministic scores stayed D-grade.

Because no source behavior changed, original-50 validation was not required. Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.
