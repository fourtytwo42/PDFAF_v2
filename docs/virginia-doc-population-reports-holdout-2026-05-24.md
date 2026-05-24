# Virginia DOC Population Reports Holdout - 2026-05-24

## Source

- Source page: `https://vadoc.virginia.gov/general-public/population-reports/`
- Agency: Virginia Department of Corrections
- Sample: 20 individual monthly population summary PDFs from the Monthly Population Reports section
- Selected range: January-April 2026, January-December 2023, and January-April 2022
- Constraint: all PDFs were official public-source PDFs and below 10 MB

The 2025 and 2024 compiled annual PDFs were skipped to keep the sample as individual monthly PDFs.

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/virginia-doc-population-reports-2026-05-24/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean: `37.05 -> 90.90`
- Median after remediation: `94`
- Grades after remediation: `18 A / 0 B / 0 C / 1 D / 1 F`
- Rows below `93`: `5`
- Runtime p50/p95/max: `15947ms / 42054ms / 42054ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Diagnostics

Low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `reading_link_order_candidate`
- Raw points needed for mean `93`: `42`
- Main low rows:
  - `vadocpop-04`: `57/F`, `heading_structure=0`, `reading_order=30`
  - `vadocpop-02`: `69/D`, `table_markup=35`, `pdf_ua_compliance=71`
  - `vadocpop-10`, `vadocpop-13`, `vadocpop-14`: near-miss text/reading/PDF-UA rows

Heading/reading diagnostic:

- Output: `/mnt/pdf-review/public-holdouts/virginia-doc-population-reports-2026-05-24/heading-reading-diagnostic-r1`
- Decision: `park_no_safe_heading_anchor_and_pivot_to_mixed_tail`
- Implementable rows: `0`
- `vadocpop-04` classified as `no_safe_heading_anchor`: it is tagged, but has a degenerate structure tree, `0` paragraph structure owners, `0` native title candidates, and no safe existing heading-owner tool candidate.
- Same-source controls mostly classified as mixed table/alt/PDF-UA debt rather than heading-first repair candidates.

Table target-resolution diagnostic:

- Output: `/mnt/pdf-review/public-holdouts/virginia-doc-population-reports-2026-05-24/table-target-resolution-r1`
- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidate: `vadocpop-02`
- Unsafe controls: `vadocpop-01`, `vadocpop-03`, `vadocpop-05`, `vadocpop-07`, `vadocpop-20`
- All inspected rows matched `stable_normalize_target`, so the predicate is not selective enough for production routing.

Low-row repeat:

- Output: `/mnt/pdf-review/public-holdouts/virginia-doc-population-reports-2026-05-24/low-repeat-r1`
- Rows: `vadocpop-02`, `vadocpop-04`, `vadocpop-10`, `vadocpop-13`, `vadocpop-14`
- Completed: `5/5`
- Scores: `69/D`, `57/F`, `88/B`, `90/A`, `93/A`
- `false_positive_applied`: `0`

The repeat confirmed the two major low rows are reproducible. The near-miss rows showed some route movement, but no clean general behavior predicate.

## Decision

No remediation, scorer, planner, or analyzer behavior was accepted from this holdout. VADOC is a useful source for future object-backed heading-owner and table-header-preservation work, but the current evidence is not selective or implementable enough to justify a source change.

Because no source behavior changed, original-50 validation was not required. Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.
