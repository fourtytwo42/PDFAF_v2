# Maryland DPSCS Publications Public Holdout

Date: 2026-05-23

Source: https://dpscs.maryland.gov/publicinfo/publications/statistics.shtml

This is a public-source outside-corpus diagnostic run. It used 20 public Maryland Department of Public Safety and Correctional Services publication PDFs, each under 10MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: 8 Average Daily Population reports, 9 Incarcerated Individual Characteristics reports, and 3 Annual/Legislative reports.
- Validation: one bounded deterministic 20-file run.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

- Processed: `20/20`.
- Mean: `64.75 -> 94.40`.
- Grades after remediation: `19 A / 1 B / 0 C / 0 D / 0 F`.
- Points needed for mean 93: `0`.
- Runtime p50/p95/max: `8149ms / 41409ms / 65690ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic returned `holdout_target_met`.

| Group | Rows | Notes |
| --- | ---: | --- |
| Near-miss monitor | `8` | One `89/B` row and seven `92/A` rows carried only `11` raw points-to-target. |
| High-impact behavior lane | `0` | No table, figure/alt, heading, runtime, or analyzer lane was justified from this source. |

The lowest row was `mddpscs-19-dpscs-treatment-of-transgender-incarcerated-individuals-fy2023.pdf` at `89/B`. Its residual debt was mixed heading/PDF-UA/table/link/reading-order debt, but the source already exceeded the target mean and the diagnostic did not identify a safe high-impact predicate.

## Decision

No source behavior change is accepted from this source. Maryland DPSCS is a useful outside-source generalization pass: current deterministic remediation lifted the sample above the 93 mean target with no false positives, no timeouts, and fast p95 runtime.

Because no source behavior changed, no original-50 regression validation was required for this source. The downloaded PDFs and generated local diagnostics remain non-source artifacts and were removed after this report.
