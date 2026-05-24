# Ohio AG Domestic Violence Reports Public Holdout

Date: 2026-05-24

Source: Ohio Attorney General reports page, Domestic Violence Reports section: `https://www.ohioattorneygeneral.gov/Files/Reports`

This was a 20-PDF public holdout sample from official Ohio Attorney General Domestic Violence Reports under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the first 20 Domestic Violence Report PDFs in source-page order.
- Report mix: all 12 available 2025 domestic-violence statistical PDFs plus the first 8 2024 statistical PDFs.
- Size cap: all 20 selected PDFs were under `10 MB`; selected files were about `4.8 KB` to `4.5 MB`.
- Validation: one bounded deterministic 20-file run plus the standard low-row diagnostic.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/ohio-ag-domestic-violence-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `38.40 -> 93.80`.
- Median after remediation: `94`.
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`.
- Rows below 93: `2`.
- Runtime p50/p95/max: `16340ms / 39740ms / 86221ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic classified the source as `holdout_target_met` with recommended lane `none`.

The only rows below 93 were one-point near misses:

- `ohagdv-12-domestic-violence-incidents-reports-legend.pdf`: `92/A`, with `heading_structure=80`.
- `ohagdv-15-2024-domestic-violence-incidents-reports-legend.pdf`: `92/A`, with `heading_structure=80`.

These are low-priority monitor rows, not enough evidence for a new general heading behavior.

## Decision

No source behavior change is accepted from this source because none was needed. Ohio AG Domestic Violence Reports pass the 93+ source target with all rows A-grade, no hard errors, no false-positive applications, and bounded runtime.

Because no source behavior changed, no original-50 regression validation was required for this source.
