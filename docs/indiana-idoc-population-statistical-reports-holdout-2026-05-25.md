# Indiana IDOC Offender Population Statistical Reports Holdout - 2026-05-25

## Source

- Public source page: `https://www.in.gov/idoc/policies-and-statistics/data/statistical-data/offender-population-statistical-reports/`
- Source type: Indiana Department of Correction monthly offender population statistical reports.
- Sampling rule: first 20 discovered public PDF links from the source page, all under 10 MiB.
- Discovery result: 39 report links found, 20 downloaded, 0 skipped for size.
- Local scratch root during validation: `/mnt/pdf-review/public-holdouts/indiana-idoc-population-statistical-reports-2026-05-25`.

The downloaded PDFs and generated validation artifacts are local-only scratch data and are not source-tracked.

## Validation

Validation used deterministic remediation only:

- `scripts/bounded-holdout-validation.ts`
- Node 22
- `--no-semantic`
- `--no-pdfs`
- Per-PDF timeout: default 300000 ms

Local report:

- `/mnt/pdf-review/public-holdouts/indiana-idoc-population-statistical-reports-2026-05-25/run-r1/baseline_report.json`

Metrics:

- Rows processed: 20/20
- Mean before: 35.0000
- Mean after: 94.2500
- Median after: 94.0000
- Grades after: 19 A / 0 B / 1 C / 0 D / 0 F
- Rows below 93: 1
- `false_positive_applied`: 0
- Timeout/error rows: 0
- Runtime p50/p95/max: 23706 ms / 48604 ms / 49199 ms

The source clears the requested holdout target without any behavior change.

## Diagnostics

Low-row diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/indiana-idoc-population-statistical-reports-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `holdout_target_met`
- Recommended lane: `reading_link_order_candidate`
- Raw points needed for mean 93: 0

The single low row was:

- `inidocpop-07-September-2025.pdf`: `35/F -> 79/C`
- Final low categories: `reading_order=55`, `pdf_ua_compliance=71`, `link_quality=73`

The row is useful monitor evidence for the parked reading/link-order lane, but one residual row from an already-passing source does not justify a production behavior change.

## Decision

No source behavior change was accepted from this holdout. No original-50 validation was required because grading/remediation code did not change.

Downloaded PDFs and generated artifacts were removed after metrics extraction.
