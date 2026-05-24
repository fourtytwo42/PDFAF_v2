# Pennsylvania DOC Monthly Population Reports Holdout - 2026-05-24

## Source

- Source page: `https://www.pa.gov/agencies/cor/about-us/research-and-statistics/monthly-population-reports`
- Agency: Pennsylvania Department of Corrections
- Sample: first 20 distinct monthly population-report PDFs from the official PA DOC monthly population reports page, excluding the duplicate `Current Monthly Population Report` link and profile/year-end reports
- Constraint: all counted PDFs were official PA DOC PDFs and below 10 MB by actual downloaded size

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/pennsylvania-doc-monthly-population-reports-2026-05-24/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean: `34.00 -> 96.50`
- Median after remediation: `95`
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`
- Rows below `93`: `2`
- Runtime p50/p95/max: `6056ms / 10837ms / 11415ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Sample

| id | title | bytes |
| --- | --- | ---: |
| `padocpop-01` | January 2026 Population Report | 75182 |
| `padocpop-02` | February 2026 Population Report | 75139 |
| `padocpop-03` | March 2026 Population Report | 74617 |
| `padocpop-04` | April 2026 Population Report | 75039 |
| `padocpop-05` | January 2025 Population Report | 75198 |
| `padocpop-06` | February 2025 Population Report | 75098 |
| `padocpop-07` | March 2025 Population Report | 75064 |
| `padocpop-08` | April 2025 Population Report | 74954 |
| `padocpop-09` | May 2025 Population Report | 75096 |
| `padocpop-10` | June 2025 Population Report | 74995 |
| `padocpop-11` | July 2025 Population Report | 75093 |
| `padocpop-12` | August 2025 Population Report | 75138 |
| `padocpop-13` | September 2025 Population Report | 74983 |
| `padocpop-14` | October 2025 Population Report | 75117 |
| `padocpop-15` | November 2025 Population Report | 74784 |
| `padocpop-16` | December 2025 Population Report | 74716 |
| `padocpop-17` | January 2024 Population Report | 74977 |
| `padocpop-18` | February 2024 Population Report | 74948 |
| `padocpop-19` | March 2024 Population Report | 74873 |
| `padocpop-20` | April 2024 Population Report | 74913 |

## Diagnostics

Low-row diagnostic:

- Decision: `holdout_target_met`
- Recommended lane: `none`
- Raw points needed for mean `93`: `0`
- Timeout/error rows: `0`
- Low rows: `padocpop-11` and `padocpop-17`, both `92/A`, both classified as `near_miss_monitor`

## Decision

No remediation, scorer, planner, analyzer, or PAC-gate behavior was accepted from this holdout.

The Pennsylvania DOC monthly population reports meet the mean/median target cleanly, run quickly, and preserve `false_positive_applied=0`. The two residual rows are one-point near misses on heading/PDF-UA evidence and do not justify a new behavior lane.

Because no source behavior changed, original-50 validation was not required. Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.
