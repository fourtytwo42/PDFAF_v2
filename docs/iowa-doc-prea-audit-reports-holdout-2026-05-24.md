# Iowa DOC PREA Audit Reports Holdout - 2026-05-24

## Source

- Source page: `https://doc.iowa.gov/prea-audits-legacy`
- Agency: Iowa Department of Corrections
- Sample: first 20 current IDOC PREA Audit Report PDFs listed on the source page
- Constraint: all PDFs were official public-source PDFs and below 10 MB

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/iowa-doc-prea-audit-reports-2026-05-24/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean: `64.25 -> 74.95`
- Median after remediation: `69`
- Grades after remediation: `5 A / 0 B / 0 C / 15 D / 0 F`
- Rows below `93`: `17`
- Runtime p50/p95/max: `29930ms / 59812ms / 118265ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Diagnostics

Low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `361`
- Table-target rows: `16`
- Near-miss rows: `1`

Table target-resolution diagnostic:

- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: `iadocprea-02`, `iadocprea-03`, `iadocprea-04`, `iadocprea-05`, `iadocprea-06`, `iadocprea-07`, `iadocprea-08`, `iadocprea-11`, `iadocprea-12`, `iadocprea-13`, `iadocprea-14`, `iadocprea-15`, `iadocprea-16`, `iadocprea-17`, `iadocprea-19`, `iadocprea-20`
- Unsafe control candidates: `iadocprea-18`
- Prior non-table target rows: `none`

## Decision

No remediation, scorer, planner, or analyzer behavior was accepted from this holdout.

The low cluster is real and high impact, but this is not yet a safe general behavior lane. Table targets are object-backed on the focus rows, yet same-source control `iadocprea-18` also matches the stable normalize-target shape while remediating to A-grade through existing behavior. The low rows also already attempted table tools, with rejections tied to PAC-visible table-header or figure-alt regressions and no clear safe transaction that improves final table/PAC debt.

Because no source behavior changed, original-50 validation was not required. Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.
