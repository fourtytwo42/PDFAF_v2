# Georgia GBI Monthly Statistical Reports Public Holdout

Date: 2026-05-24

Sources:

- Georgia Bureau of Investigation Monthly Statistical Report page: `https://gbi.georgia.gov/gbi-monthly-statistical-report`
- 2025 Monthly Statistical Reports: `https://gbi.georgia.gov/gbi-monthly-statistical-report/2025-monthly-statistical-reports`
- 2024 Monthly Statistical Reports: `https://gbi.georgia.gov/gbi-monthly-statistical-report/2024-monthly-statistical-reports`

This was a 20-PDF public holdout sample from official Georgia Bureau of Investigation monthly statistical reports under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the first 20 eligible monthly statistical report PDFs parsed from the 2025 and 2024 source pages.
- Report mix: December 2025 through January 2025, then November 2024 through March 2024.
- Size cap: all 20 selected PDFs were under `10 MB`; selected files were about `753 KB` to `3.23 MB`.
- Validation: one bounded deterministic 20-file run plus the standard low-row diagnostic.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/georgia-gbi-monthly-statistical-reports-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `55.00 -> 95.75`.
- Median after remediation: `96`.
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`.
- Rows below 93: `0`.
- Runtime p50/p95/max: `28206ms / 28753ms / 28803ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic classified the source as `holdout_target_met` with recommended lane `none`.

All rows remediated to A-grade (`93`, `94`, or `96`), so there was no focused failure lane to promote and no source behavior change was justified.

## Decision

No source behavior change is accepted from this source because none was needed. The source passes the 93+ mean and median target with all rows A-grade, no hard errors, no false-positive applications, and bounded p95 runtime.

Because no source behavior changed, no original-50 regression validation was required for this source.
