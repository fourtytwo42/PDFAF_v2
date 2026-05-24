# Pennsylvania DOC Monthly Population Reports Public Holdout

Date: 2026-05-24

Source:

- Pennsylvania Department of Corrections Monthly Population Reports page: `https://www.pa.gov/agencies/cor/about-us/research-and-statistics/monthly-population-reports`

This was a 20-PDF public holdout sample from official Pennsylvania Department of Corrections monthly population report PDFs under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the first 20 listed monthly `Population Report` PDFs on the official page.
- Report mix: January 2026 through April 2026, January 2025 through December 2025, and July 2024 through October 2024.
- Size cap: all 20 selected PDFs were under `10 MB`; selected files were about `73 KB`.
- Validation: one bounded deterministic 20-file run and the standard low-row diagnostic.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/pennsylvania-doc-monthly-population-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `34.00 -> 98.05`.
- Median after remediation: `99`.
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`.
- Rows below 93: `1`.
- Runtime p50/p95/max: `6037ms / 7334ms / 10683ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic classified the source as `holdout_target_met` with recommended lane `none`.

- Raw points needed for a mean of 93: `0`.
- Only below-93 row: `padocpop-12.pdf`, `92/A`.
- Residual class: `near_miss_monitor`.
- Lowest residual categories: `heading_structure=79`, `pdf_ua_compliance=79`, `reading_order=96`.

The near miss does not justify a behavior change because the source already passes strongly and the residual carries only one raw point.

## Decision

No source behavior change is accepted from this source. Pennsylvania DOC monthly population reports are a clean passing public holdout with fast bounded runtime, no hard errors, no false-positive applications, and all rows in A grade.

Do not add Pennsylvania/source/month/PDF-specific gates or near-miss heading tweaks from this evidence. If a broader, already-supported heading/PDF-UA lane later reaches `padocpop-12.pdf` naturally, it can be monitored as a low-risk near miss, but no new behavior is warranted from this source alone.

Because no source behavior changed, no original-50 regression validation was required for this source.
