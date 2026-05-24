# California CDCR Monthly Total Population TPOP1 Public Holdout

Date: 2026-05-24

Source pages:

- `https://www.cdcr.ca.gov/research/2026-monthly-total-population-tpop1-archive/`
- `https://www.cdcr.ca.gov/research/2025-monthly-total-population-tpop1-archive/`
- `https://www.cdcr.ca.gov/research/2024-monthly-total-population-report-tpop1-archive/`

This was a 20-PDF public holdout sample from official California Department of Corrections and Rehabilitation monthly total population TPOP1 reports under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the newest 20 TPOP1 monthly reports available from the source archive pages, from `Apr2026` through `Sep2024`.
- Size cap: all 20 selected PDFs were under `10 MB`; all selected files were about `112 KB`.
- Validation: one bounded deterministic 20-file run plus the standard low-row diagnostic.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/california-cdcr-tpop1-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `90.05 -> 96.00`.
- Median after remediation: `96`.
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`.
- Rows below 93: `0`.
- Runtime p50/p95/max: `4767ms / 6226ms / 6247ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic classified the source as `holdout_target_met` with recommended lane `none`.

All rows remediated to `96/A`, so there was no focused failure lane to promote and no source behavior change was justified.

## Decision

No source behavior change is accepted from this source because none was needed. The source passes the 93+ mean and median target with all rows A-grade, no hard errors, no false-positive applications, and fast p95 runtime.

Because no source behavior changed, no original-50 regression validation was required for this source.
