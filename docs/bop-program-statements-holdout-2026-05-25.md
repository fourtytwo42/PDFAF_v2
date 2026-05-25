# Federal Bureau of Prisons Program Statements Public Holdout

Date: 2026-05-25

Source: Federal Bureau of Prisons policy search page: `https://www.bop.gov/PublicInfo/execute/policysearch?todo=query`

This was a 20-PDF public holdout sample from official BOP Program Statement PDFs under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the first 20 English-titled `/policy/progstat/` PDFs from the BOP policy search page after filtering out Spanish-titled/Spanish-path links.
- Size cap: all selected PDFs were under `10 MB`; the sample totaled about `4.2 MB`.
- Validation: one bounded deterministic 20-file run plus the standard low-row diagnostic.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run: `/mnt/pdf-review/public-holdouts/bop-program-statements-2026-05-25/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `40.00 -> 95.75`.
- Median after remediation: `95`.
- Minimum after remediation: `94`.
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`.
- Rows below mean target `93`: `0`.
- Rows below bounded-runner target `95`: `4`.
- Runtime p50/p95/max: `8514ms / 15505ms / 22053ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Sample

| id | title | bytes |
| --- | --- | ---: |
| `bopps-01` | Acceptance of Donations | 304860 |
| `bopps-02` | Acceptance of Travel Funding from Outside Sources | 294612 |
| `bopps-03` | Accounting For Real Property, Depreciation, and B&F Projects | 409758 |
| `bopps-04` | Accounting for the Cost of Incarceration Fee | 80046 |
| `bopps-05` | Accounting Management Manual, Part 1 | 277805 |
| `bopps-06` | Accounting Management Manual, Part 2 | 149754 |
| `bopps-07` | Accounting Management Manual, Part 3 | 149158 |
| `bopps-08` | Accounting Management Manual, Part 4 | 164418 |
| `bopps-09` | Accounting Management Manual, Part 5 | 164536 |
| `bopps-10` | Accounting Management Manual, Part 6 | 63290 |
| `bopps-11` | Accounting Management Manual, Part 7 | 148351 |
| `bopps-12` | Accounting Management Manual, Part 8 | 686988 |
| `bopps-13` | Accounting Procedures for Civilian & Inmate Payrolls, FPI | 97549 |
| `bopps-14` | Accounting-Recording Obligations | 465198 |
| `bopps-15` | Accounts Payable - Internal Control Procedures, Prompt Payment and Processing Vendor Payments (FPI) | 124919 |
| `bopps-16` | Administration of Sentence for Military Inmates | 257780 |
| `bopps-17` | Administrative Remedy Program | 178754 |
| `bopps-18` | Admission and Orientation Program | 78721 |
| `bopps-19` | American Flag Protocol | 283215 |
| `bopps-20` | Appropriations, Use Of | 63736 |

## Low-Row Diagnostic

The low-row diagnostic classified the source as `holdout_target_met` with recommended lane `none`.

No targeted fixer or behavior promotion is justified from this source. The four lowest rows finished at `94/A`, which is above the source mean target and does not expose a high-impact failure lane.

## Decision

No remediation, scorer, planner, analyzer, or PAC-gate behavior was accepted from this holdout.

The accepted engine already clears the 93+ mean/median target on this BOP Program Statements sample with bounded runtime, no hard errors, and `false_positive_applied=0`. Because no source behavior changed, original-50 validation was not required.
