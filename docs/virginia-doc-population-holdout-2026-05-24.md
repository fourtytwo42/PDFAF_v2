# Virginia DOC Monthly Population Reports Public Holdout

Date: 2026-05-24

Source: https://vadoc.virginia.gov/general-public/population-reports/

This is a public-source outside-corpus diagnostic run. It used 20 public Virginia Department of Corrections monthly population report PDFs, each under 10MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: individual monthly population reports for `2023-01` through `2023-12`, plus `2022-01` through `2022-08`.
- Validation: one bounded deterministic 20-file run.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

- Processed: `20/20`.
- Mean: `34.20 -> 93.60`.
- Median after remediation: `94`.
- Grades after remediation: `19 A / 1 B / 0 C / 0 D / 0 F`.
- Points needed for mean 93: `0`.
- Runtime p50/p95/max: `15884ms / 21203ms / 24038ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic classified the source as `holdout_target_met` and recommended no behavior lane.

| File | Score | Lowest categories | Notes |
| --- | ---: | --- | --- |
| `vadocpop-09-2023-09-monthly-population-report.pdf` | `86/B` | `text_extractability=76`, `reading_order=79`, `heading_structure=96` | No safe general lane was visible from the run artifact alone. |
| `vadocpop-12-2023-12-monthly-population-report.pdf` | `90/A` | `reading_order=79`, `text_extractability=88`, `heading_structure=96` | Near-miss monitor only. |
| `vadocpop-06-2023-06-monthly-population-report.pdf` | `92/A` | `text_extractability=82`, `reading_order=94`, `heading_structure=96` | Near-miss monitor only. |

## Decision

No source behavior change is accepted from this source. The accepted engine already clears the 93+ mean/median target with bounded runtime and no false-positive applications.

The residual rows are low-priority text-extractability/reading-order near misses, but this source does not provide a safe predicate for scoring, planner, mutator, PAC-gate, timeout, or semantic behavior changes. Because no source behavior changed, no original-50 regression validation was required for this source.
