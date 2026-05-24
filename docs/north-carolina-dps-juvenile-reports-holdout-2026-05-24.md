# North Carolina DPS Juvenile Reports Public Holdout

Date: 2026-05-24

Sources:

- https://www.ncdps.gov/our-organization/juvenile-justice-and-delinquency-prevention
- https://www.ncdps.gov/document-collection/legislative-reports
- https://www.ncdps.gov/division/juvenile-justice/2024-djjdp-annual-report
- https://www.ncdps.gov/division/juvenile-justice/ydc-annual-report-2023-2024-final

This is a public-source outside-corpus diagnostic run. It used 20 public North Carolina Department of Public Safety juvenile justice PDFs, each under 10MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: DJJDP annual reports, Youth Development Center annual reports, PREA/sexual-abuse annual reports, JCPC reports, and juvenile community-program evaluation reports.
- Excluded by the under-10MB rule: two 2020 juvenile evaluation candidates exceeded the cap and were replaced with smaller official NC DPS reports.
- Validation: one bounded deterministic 20-file run plus a focused repeat on the timeout/low-row family.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

- Processed: `20/20`.
- Completed without timeout/error: `19/20`.
- Mean: `48.37 -> 89.95` all rows, or `94.68` completed rows.
- Median after remediation: `95`.
- Grades after remediation: `18 A / 1 B / 0 C / 0 D / 0 F / 1 timeout`.
- Points needed for all-row mean 93: `61`.
- Runtime p50/p95/max: `22831ms / 190018ms / 300078ms`.
- Timeout/error rows: `1`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic returned `no_safe_low_row_lane`.

| Candidate class | Rows | Raw points to target | Notes |
| --- | ---: | ---: | --- |
| Timeout/error | `1` | `93` | `ncdpsjj-15-jcpc-annual-report-grants-fy2019-2020.pdf` timed out at the 300s wall. |
| No safe predicate | `1` | `4` | `ncdpsjj-19-community-programs-evaluation-2016.pdf` finished `89/B` with mixed mild alt/PDF-UA/table debt. |
| Near-miss monitor | `2` | `3` | `ncdpsjj-02` and `ncdpsjj-14` finished `91-92/A`. |

## Focus Repeat

A focused repeat on the timeout row plus nearby controls reproduced the runtime-risk shape:

| File | Repeat score | Notes |
| --- | ---: | --- |
| `ncdpsjj-14-jcpc-annual-report-2020-2021.pdf` | `84/B` | Repeated lower than the full run's `92/A`, suggesting route/analyzer volatility in this family. |
| `ncdpsjj-15-jcpc-annual-report-grants-fy2019-2020.pdf` | `0/?` | Repeated the `per_pdf_timeout_300000ms` failure. |
| `ncdpsjj-16-community-programs-evaluation-2022.pdf` | `97/A` | Control remained stable. |
| `ncdpsjj-19-community-programs-evaluation-2016.pdf` | `89/B` | Low row repeated at the same score. |

Direct source-only analysis of the repeated timeout row completed quickly and showed a `439` page PDF with initial `58/F`, `heading_structure=0`, `text_extractability=62`, `pdf_ua_compliance=67`, and `table_markup=79`.

## Decision

No source behavior change is accepted from this source. The all-row source misses 93 because one long JCPC grants report repeatedly hits the per-PDF remediation wall. The completed-row mean is already above 93, and the other low rows are near misses or mixed mild debt without a clean object-backed predicate.

This source reinforces the parked long-report runtime/analyzer lane and the broader native zero-heading/text-extractability debt, but it does not justify a scoring, planner, mutator, PAC-gate, timeout-checkpoint, or semantic behavior change. Because no source behavior changed, no original-50 regression validation was required for this source.
