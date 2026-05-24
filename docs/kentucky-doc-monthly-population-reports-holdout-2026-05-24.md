# Kentucky DOC Monthly Population Reports Holdout - 2026-05-24

## Source

- Source page: `https://corrections.ky.gov/public-information/researchandstats/Pages/monthlyreports.aspx`
- Agency: Kentucky Department of Corrections
- Sample: first 20 distinct `Population Report` PDFs from the official monthly reports page, excluding inmate-profile PDFs
- Constraint: all counted PDFs were official Kentucky DOC PDFs and below 10 MB by actual downloaded size

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/kentucky-doc-monthly-population-reports-2026-05-24/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean: `16.00 -> 96.90`
- Median after remediation: `99`
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`
- Rows below `93`: `0`
- Runtime p50/p95/max: `8357ms / 9197ms / 12645ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Sample

| id | title | bytes |
| --- | --- | ---: |
| `kydocpop-01` | Population Report for January 2025 | 868578 |
| `kydocpop-02` | Population Report for February 2025 | 872461 |
| `kydocpop-03` | Population Report for March 2025 | 871056 |
| `kydocpop-04` | Population Report for January 2024 | 901513 |
| `kydocpop-05` | Population Report for February 2024 | 891436 |
| `kydocpop-06` | Population Report for March 2024 | 904045 |
| `kydocpop-07` | Population Report for April 2024 | 854561 |
| `kydocpop-08` | Population Report for May 2024 | 844795 |
| `kydocpop-09` | Population Report for June 2024 | 800982 |
| `kydocpop-10` | Population Report for July 2024 | 835565 |
| `kydocpop-11` | Population Report for August 2024 | 840240 |
| `kydocpop-12` | Population Report for September 2024 | 856276 |
| `kydocpop-13` | Population Report for October 2024 | 839234 |
| `kydocpop-14` | Population Report for November 2024 | 867980 |
| `kydocpop-15` | Population Report for May 2023 | 881400 |
| `kydocpop-16` | Population Report for June 2023 | 860986 |
| `kydocpop-17` | Population Report for July 2023 | 878769 |
| `kydocpop-18` | Population Report for August 2023 | 868233 |
| `kydocpop-19` | Population Report for September 2023 | 908515 |
| `kydocpop-20` | Population Report for October 2023 | 868447 |

## Diagnostics

Low-row diagnostic:

- Decision: `holdout_target_met`
- Recommended lane: `none`
- Raw points needed for mean `93`: `0`
- Timeout/error rows: `0`
- Rows below `93`: `0`

## Decision

No remediation, scorer, planner, analyzer, or PAC-gate behavior was accepted from this holdout.

The Kentucky DOC monthly population reports meet the mean/median target cleanly, run quickly, and preserve `false_positive_applied=0`. The source does not justify a new diagnostic lane or behavior change.

Because no source behavior changed, original-50 validation was not required. Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.
