# Minnesota DOC Population Profiles Holdout - 2026-05-24

## Source

- Source page: `https://mn.gov/doc/transparency-center/statistics/historical-population-summary-reports/`
- Agency: Minnesota Department of Corrections
- Sample: first 20 Adult Population Reports / Adult Prison Population Summary PDFs listed on the page, `1-1-26` through `7-1-16`
- Constraint: all PDFs were official public-source PDFs and below 10 MB

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/minnesota-doc-population-profiles-2026-05-24/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean: `73.30 -> 93.75`
- Median after remediation: `92`
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`
- Rows below `93`: `11`
- Runtime p50/p95/max: `12045ms / 16332ms / 16332ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Diagnostics

Low-row diagnostic:

- Decision: `holdout_target_met`
- Recommended lane: `none`
- Raw points needed for mean `93`: `0`
- Residual low rows were all low-priority near misses.

The repeated near-miss shape was `heading_structure=79` plus, on most rows, `table_markup=79` and PAC-style table/header-association evidence. Because the median remained `92`, a focused table target-resolution diagnostic was run on table-like near misses.

Table target-resolution diagnostic:

- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidate: `mndocpop-18`
- Unsafe/high-row stable target: `mndocpop-20`
- Prior non-table target rows: `mndocpop-06`, `mndocpop-07`, `mndocpop-08`, `mndocpop-09`, `mndocpop-10`, `mndocpop-12`, `mndocpop-14`

The table evidence was not clean enough to justify a production behavior change. Most near-miss rows had prior table/header attempts resolving to non-table roles such as `TR` or `TD`, and one same-source high/control row also matched the stable normalize-target shape.

## Decision

No remediation, scorer, planner, or analyzer behavior was accepted from this holdout. The source meets the mean target but not a strict median `>=93` target, so it should be treated as a diagnostic near-miss set rather than a full mean/median pass. It is useful as a table/heading monitor, but not as a safe general-fix proof.

Because no source behavior changed, original-50 validation was not required. Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.
