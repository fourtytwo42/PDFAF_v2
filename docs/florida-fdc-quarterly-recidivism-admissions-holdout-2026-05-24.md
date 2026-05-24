# Florida FDC Quarterly Recidivism and Admissions Public Holdout

Date: 2026-05-24

Source: Florida Department of Corrections FDC Quarterly Recidivism and Inmate Admissions Reports page: `https://www.fdc.myflorida.com/statistics-and-publications/fdc-quarterly-recidivism-and-inmate-admissions-reports`

This was a 20-PDF public holdout sample from official Florida Department of Corrections quarterly recidivism and inmate admissions reports under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the first 20 report PDFs in source-page order, excluding the unrelated `dc5-801.pdf` form from the site menu.
- Report mix: recidivism and inmate admissions reports from the newest available FY 2025-2026 section through the FY 2022-2023 section.
- Size cap: all 20 selected PDFs were under `10 MB`; selected files were about `190 KB` to `728 KB`.
- Validation: one bounded deterministic 20-file run plus the standard low-row diagnostic.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/florida-fdc-quarterly-recidivism-admissions-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `63.10 -> 98.40`.
- Median after remediation: `99`.
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`.
- Rows below 93: `0`.
- Runtime p50/p95/max: `8221ms / 10702ms / 10891ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic classified the source as `holdout_target_met` with recommended lane `none`.

All rows remediated to A-grade (`95`, `97`, or `99`), so there was no focused failure lane to promote and no source behavior change was justified.

## Decision

No source behavior change is accepted from this source because none was needed. The source passes the 93+ mean and median target with all rows A-grade, no hard errors, no false-positive applications, and fast p95 runtime.

Because no source behavior changed, no original-50 regression validation was required for this source.
