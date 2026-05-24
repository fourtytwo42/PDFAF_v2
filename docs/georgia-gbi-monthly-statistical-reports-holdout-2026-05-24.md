# Georgia GBI Monthly Statistical Reports Holdout - 2026-05-24

## Source

- Source page: `https://gbi.georgia.gov/gbi-monthly-statistical-report`
- Agency: Georgia Bureau of Investigation
- Sample: first 20 monthly statistical report PDFs from current 2026, 2025, and 2024 report pages
- Constraint: all counted PDFs were official Georgia.gov PDFs and below 10 MB by actual downloaded size

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/georgia-gbi-monthly-statistical-reports-2026-05-24/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean: `47.65 -> 94.70`
- Median after remediation: `96`
- Grades after remediation: `19 A / 1 B / 0 C / 0 D / 0 F`
- Rows below `93`: `2`
- Runtime p50/p95/max: `28397ms / 30237ms / 31151ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Sample

| id | year | title | bytes |
| --- | --- | --- | ---: |
| `gagbi-01` | 2026 | January 2026 Statistical Report | 751426 |
| `gagbi-02` | 2026 | February 2026 Statistical Report | 3531793 |
| `gagbi-03` | 2026 | March 2026 Statistical Report | 3402058 |
| `gagbi-04` | 2026 | April 2026 Statistical Report | 807904 |
| `gagbi-05` | 2026 | May 2026 Statistical Report | 3471532 |
| `gagbi-06` | 2025 | December 2025 Statistical Report | 3326617 |
| `gagbi-07` | 2025 | November 2025 Statistical Report | 3387772 |
| `gagbi-08` | 2025 | October 2025 Statistical Report | 789318 |
| `gagbi-09` | 2025 | September 2025 Statistical Report | 770153 |
| `gagbi-10` | 2025 | August 2025 Statistical Report | 868536 |
| `gagbi-11` | 2025 | June 2025 Statistical Report | 844725 |
| `gagbi-12` | 2025 | May 2025 Statistical Report | 851013 |
| `gagbi-13` | 2025 | April 2025 Statistical Report | 828682 |
| `gagbi-14` | 2025 | March 2025 Statistical Report | 826226 |
| `gagbi-15` | 2025 | February 2025 Statistical Report | 821640 |
| `gagbi-16` | 2025 | January 2025 Statistical Report | 817500 |
| `gagbi-17` | 2024 | November 2024 Statistical Report | 800282 |
| `gagbi-18` | 2024 | October 2024 Statistical Report | 872418 |
| `gagbi-19` | 2024 | September 2024 Statistical Report | 786120 |
| `gagbi-20` | 2024 | August 2024 Statistical Report | 883262 |

## Diagnostics

Low-row diagnostic:

- Decision: `holdout_target_met`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `0`
- Table-target residual: `gagbi-16` at `88/B`, carrying `5` points to `93`
- Near-miss residual: `gagbi-04` at `92/A`, carrying `1` point to `93`
- Timeout/error rows: `0`

## Decision

No remediation, scorer, planner, analyzer, or PAC-gate behavior was accepted from this holdout.

The Georgia GBI monthly statistical reports meet the target cleanly and run quickly. The only material residual is a single low-priority table/header row, and the holdout already exceeds the requested mean/median threshold. This source therefore does not justify a new table transaction proof or any broader behavior change.

Because no source behavior changed, original-50 validation was not required. Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.
