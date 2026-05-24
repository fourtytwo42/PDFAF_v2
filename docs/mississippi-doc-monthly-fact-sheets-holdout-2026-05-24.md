# Mississippi DOC Monthly Fact Sheets Holdout - 2026-05-24

## Source

- Source page: `https://www.mdoc.ms.gov/general-public/monthly-fact-sheets`
- Agency: Mississippi Department of Corrections
- Sample: latest 20 Monthly Fact Sheet PDFs, dated January 2024 through May 2026
- Constraint: all PDFs were official public-source PDFs and below 10 MB

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/mississippi-doc-monthly-fact-sheets-2026-05-24/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean: `48.00 -> 97.95`
- Median after remediation: `98`
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`
- Rows below `93`: `0`
- Runtime p50/p95/max: `13696ms / 14918ms / 14955ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Diagnostics

Low-row diagnostic:

- Decision: `holdout_target_met`
- Recommended lane: `none`
- Raw points needed for mean `93`: `0`
- Low rows below `93`: `0`

## Decision

No remediation, scorer, planner, or analyzer behavior was accepted from this holdout. The engine already remediates this source above the requested mean and median thresholds with no false positives or runtime concern.

Because no source behavior changed, original-50 validation was not required. Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.
