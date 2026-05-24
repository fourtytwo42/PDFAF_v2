# New York DOCCS PREA Audits Holdout - 2026-05-24

## Source

- Source page: `https://doccs.ny.gov/final-audit-reports`
- Agency: New York State Department of Corrections and Community Supervision
- Sample: first 20 usable PREA final audit report PDF downloads from the public final audit reports listing
- Constraint: all PDFs were official public-source PDFs and below 10 MB

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/new-york-doccs-prea-audits-2026-05-24/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean: `67.25 -> 70.20`
- Median after remediation: `69`
- Grades after remediation: `1 A / 0 B / 0 C / 19 D / 0 F`
- Rows below `93`: `19`
- Runtime p50/p95/max: `34993ms / 35669ms / 39922ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Sample

| id | report | bytes |
| --- | --- | ---: |
| `nydoccsprea-01` | Pathways Renewed, Inc. CBRP - Cycle 5 | 3052377 |
| `nydoccsprea-02` | Groveland Correctional Facility - Cycle 5 | 789017 |
| `nydoccsprea-03` | Wende Correctional Facility - Cycle 5 | 791142 |
| `nydoccsprea-04` | Collins Correctional Facility - Cycle 5 | 788180 |
| `nydoccsprea-05` | Greene Correctional Facility - Cycle 4 | 776384 |
| `nydoccsprea-06` | Auburn Correctional Facility - Cycle 4 | 846643 |
| `nydoccsprea-07` | Cape Vincent Correctional Facility - Cycle 4 | 780235 |
| `nydoccsprea-08` | Sing Sing Correctional Facility - Cycle 4 | 745793 |
| `nydoccsprea-09` | Coxsackie Correctional Facility - Cycle 4 | 799962 |
| `nydoccsprea-10` | Fishkill Correctional Facility - Cycle 4 | 836804 |
| `nydoccsprea-11` | Five Points Correctional Facility - Cycle 4 | 614854 |
| `nydoccsprea-12` | Marcy Correctional Facility - Cycle 4 | 833113 |
| `nydoccsprea-13` | Mohawk Correctional Facility - Cycle 4 | 811189 |
| `nydoccsprea-14` | Bridges of New York Schenectady CBRP - Cycle 4 | 536057 |
| `nydoccsprea-15` | Exodus House Poughkeepsie CBRP - Cycle 4 | 549849 |
| `nydoccsprea-16` | Bissonette House Buffalo CBRP - Cycle 4 | 579029 |
| `nydoccsprea-17` | Upstate Correctional Facility - Cycle 4 | 774457 |
| `nydoccsprea-18` | Hale Creek ASACTC - Cycle 4 | 795582 |
| `nydoccsprea-19` | Mid-State Correctional Facility - Cycle 4 | 805755 |
| `nydoccsprea-20` | Bedford Hills Correctional Facility PREA Audit - Cycle 4 | 801316 |

## Diagnostics

Low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `456`
- Table-target rows: `19`
- Timeout/error rows: `0`

Table target-resolution diagnostic:

- Decision: `plan_table_target_behavior_proof`
- Stable focus candidates: `nydoccsprea-02`, `nydoccsprea-03`, `nydoccsprea-04`, `nydoccsprea-05`, `nydoccsprea-06`, `nydoccsprea-07`, `nydoccsprea-08`, `nydoccsprea-09`, `nydoccsprea-10`, `nydoccsprea-11`, `nydoccsprea-12`, `nydoccsprea-13`, `nydoccsprea-14`, `nydoccsprea-15`, `nydoccsprea-16`, `nydoccsprea-17`, `nydoccsprea-18`, `nydoccsprea-19`, `nydoccsprea-20`
- Unsafe control candidates: `none`
- Prior non-table target rows: `none`
- Classification counts: `19 stable_normalize_target`, `6 control_or_high_grade_noise`

Observed table-tool outcomes in the baseline run:

- `38` `normalize_table_structure` attempts rejected with `pac_rule_regressed(pdfua.table.header_association_present)`.
- `38` `repair_native_table_headers` attempts rejected with `pac_rule_regressed(pdfua.table.header_association_present)`.
- `38` `set_table_header_cells` attempts returned `no_effect:no_structural_change`.

The one-row ordered table/structure sequence probe on `nydoccsprea-02` found no safe sequence candidate. Existing tools reduced some irregular-table counts, but final score stayed `69/D`, header association debt did not improve, and `set_table_header_cells` still had no safe target after normalization.

## Decision

No remediation, scorer, planner, analyzer, or PAC-gate behavior was accepted from this holdout.

This is another clean table/header transaction proof source. It strengthens the evidence that PREA report templates expose object-backed table targets at scale, but it does not yet justify behavior promotion. A valid future fix must transact table normalization and header association together, reduce final PAC table/header debt, avoid suppressing `pdfua.table.header_association_present`, and pass original-50 quality and speed validation.

Because no source behavior changed, original-50 validation was not required. Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.
