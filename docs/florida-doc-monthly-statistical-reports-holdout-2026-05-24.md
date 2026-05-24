# Florida DOC Monthly Statistical Reports Holdout - 2026-05-24

## Source

- Source page: `https://www.fdc.myflorida.com/statistics-and-publications/fdc-monthly-statistics`
- Agency: Florida Department of Corrections
- Sample: first 20 monthly `Justice Counts` / monthly statistics PDFs exposed by the official FDC statistics page
- Constraint: all counted PDFs were official FDC PDFs and below 10 MB by actual downloaded size

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/florida-doc-monthly-statistical-reports-2026-05-24/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean: `69.00 -> 69.00`
- Median after remediation: `69`
- Grades after remediation: `0 A / 0 B / 0 C / 20 D / 0 F`
- Rows below `93`: `20`
- Runtime p50/p95/max: `11210ms / 13467ms / 13837ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Sample

| id | title | bytes |
| --- | --- | ---: |
| `fldocstats-01` | Justice Counts - January 2026 | 80768 |
| `fldocstats-02` | Justice Counts - February 2026 | 81319 |
| `fldocstats-03` | Justice Counts - March 2026 | 81263 |
| `fldocstats-04` | Justice Counts - April 2026 | 81229 |
| `fldocstats-05` | Justice Counts - January 2025 | 83903 |
| `fldocstats-06` | Justice Counts - February 2025 | 83925 |
| `fldocstats-07` | Justice Counts - March 2025 | 83673 |
| `fldocstats-08` | Justice Counts - April 2025 | 83739 |
| `fldocstats-09` | Justice Counts - May 2025 | 83733 |
| `fldocstats-10` | Justice Counts - June 2025 | 83848 |
| `fldocstats-11` | Justice Counts - July 2025 | 83890 |
| `fldocstats-12` | Justice Counts - September 2025 | 80576 |
| `fldocstats-13` | Justice Counts - October 2025 | 80685 |
| `fldocstats-14` | Justice Counts - November 2025 | 80648 |
| `fldocstats-15` | Justice Counts - December 2025 | 80724 |
| `fldocstats-16` | MS0124 | 83918 |
| `fldocstats-17` | MS0224 | 83930 |
| `fldocstats-18` | Justice Counts - March 2024 | 83685 |
| `fldocstats-19` | Justice Counts - April 2024 | 83754 |
| `fldocstats-20` | Justice Counts - May 2024 | 83746 |

## Diagnostics

Low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `480`
- Rows in table lane: `20`
- Timeout/error rows: `0`

Table target-resolution diagnostic:

- Decision: `plan_table_target_behavior_proof`
- Stable focus candidates: `20/20`
- Unsafe control candidates: `0`
- Control rows checked: `ADAM2`, three Teams variants, and `pdfaf_fixture_accessible`
- Classification counts: `20 stable_normalize_target`, `5 control_or_high_grade_noise`
- Prior non-table target rows: `0`

The table tools already fired during the baseline run. Representative rows applied `normalize_table_structure` and `repair_native_table_headers`; the later `stage180_header_regularization_sequence` reduced data cells without headers but left `pdfua.table.header_association_present` and final scores at `69/D`. This is useful evidence for a future table/header transaction proof, but it is not enough by itself to accept a behavior change.

## Decision

No remediation, scorer, planner, analyzer, or PAC-gate behavior was accepted from this holdout.

Florida DOC monthly statistical reports are a fast, high-impact table/header residual source. The structural predicate is clean against the checked controls, but existing production table tools already attempt the lane and do not move final scores. Any future source change should be a separate general table/header transaction proof that reduces final PAC table-header debt without suppressing `pdfua.table.header_association_present`, then pass targeted controls and original-50 deterministic validation.

Because no source behavior changed, original-50 validation was not required. Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.
