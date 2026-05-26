# Pennsylvania JCJC Annual and Outcome Measures Reports Holdout - 2026-05-26

## Source

- Source pages:
  - https://www.pa.gov/agencies/jcjc/publications
  - https://www.pa.gov/agencies/jcjc/publications/search-publications
- Sample: 20 official Pennsylvania Juvenile Court Judges' Commission PDFs from the public publication search results.
- Size gate: every selected PDF was verified as an actual PDF under the strict decimal `10,000,000` byte cap before validation.
- Selection note: seven available 2018-2024 Juvenile Court Annual Reports plus thirteen 2012-2024 Statewide Outcome Measures reports.

## Sample

| Row | PDF |
| --- | --- |
| `pajcjc-01` | 2024 Juvenile Court Annual Report |
| `pajcjc-02` | 2023 Juvenile Court Annual Report |
| `pajcjc-03` | 2022 Juvenile Court Annual Report |
| `pajcjc-04` | 2021 Juvenile Court Annual Report |
| `pajcjc-05` | 2020 Juvenile Court Annual Report |
| `pajcjc-06` | 2019 Juvenile Court Annual Report |
| `pajcjc-07` | 2018 Juvenile Court Annual Report |
| `pajcjc-08` | 2024 Statewide Outcome Measures Report |
| `pajcjc-09` | 2023 Statewide Outcome Measures Report |
| `pajcjc-10` | 2022 Statewide Outcome Measures Report |
| `pajcjc-11` | 2021 Statewide Outcome Measures Report |
| `pajcjc-12` | 2020 Pennsylvania Juvenile Justice Outcome Measures Report |
| `pajcjc-13` | 2019 Pennsylvania Juvenile Justice Outcome Measures Report |
| `pajcjc-14` | 2018 Pennsylvania Juvenile Justice Outcome Measures Report |
| `pajcjc-15` | 2017 Pennsylvania Juvenile Justice Outcome Measures Report |
| `pajcjc-16` | 2016 Pennsylvania Juvenile Justice Outcome Measures Report |
| `pajcjc-17` | 2015 Pennsylvania Juvenile Justice Outcome Measures Report |
| `pajcjc-18` | 2014 Pennsylvania Juvenile Justice Outcome Measures Report |
| `pajcjc-19` | 2013 Pennsylvania Juvenile Justice Outcome Measures Report |
| `pajcjc-20` | 2012 Pennsylvania Juvenile Justice Outcome Measures Report |

## Validation

The initial sequential run was stopped after the first two large annual reports both hit the normal `300000ms` per-PDF wall. The completed validation used four balanced chunks with the same deterministic no-semantic/no-remediated-PDF path:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/pennsylvania-jcjc-juvenile-court-annual-reports-2026-05-26/chunks/chunk-N \
  /mnt/pdf-review/public-holdouts/pennsylvania-jcjc-juvenile-court-annual-reports-2026-05-26/run-parallel-r1/chunk-N \
  --limit 5 \
  --cleanup-row-artifacts
```

The chunk reports were merged locally into `run-parallel-r1/baseline_report.json`.

Result:

- Processed: `20/20`
- Completed without timeout: `15/20`
- All-row mean: `69.30`
- Completed-row mean: `92.40`
- Median: `95`
- Grades: `12 A / 2 B / 0 C / 1 D / 0 F / 5 timeout`
- Rows below `93`: `8`
- p50/p95/max: `26202ms / 300028ms / 300030ms`
- `false_positive_applied`: `0`

Rows:

| Row | Score | Note |
| --- | ---: | --- |
| `pajcjc-01` | `0/?` | `per_pdf_timeout_300000ms` |
| `pajcjc-02` | `0/?` | `per_pdf_timeout_300000ms` |
| `pajcjc-03` | `0/?` | `per_pdf_timeout_300000ms` |
| `pajcjc-04` | `0/?` | `per_pdf_timeout_300000ms` |
| `pajcjc-05` | `0/?` | `per_pdf_timeout_300000ms` |
| `pajcjc-06` | `95/A` | completed in `271778ms` |
| `pajcjc-07` | `97/A` | completed in `188953ms` |
| `pajcjc-08` | `81/B` | table/header and heading debt |
| `pajcjc-09` | `81/B` | table/header and heading debt |
| `pajcjc-10` | `69/D` | table/header debt |
| `pajcjc-11` | `96/A` | completed |
| `pajcjc-12` | `96/A` | completed |
| `pajcjc-13` | `96/A` | completed |
| `pajcjc-14` | `95/A` | completed |
| `pajcjc-15` | `95/A` | completed |
| `pajcjc-16` | `95/A` | completed |
| `pajcjc-17` | `96/A` | completed |
| `pajcjc-18` | `96/A` | completed |
| `pajcjc-19` | `99/A` | completed |
| `pajcjc-20` | `99/A` | completed |

## Diagnostics

Low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for source mean `93`: `474`
- Timeout/error rows: `5`
- Timeout rows alone account for `465` raw points.

Timeout rows:

- The five timeout rows are the 2020-2024 Juvenile Court Annual Reports.
- Their initial analysis completed in about `14s-24s`; the timeout happens during deterministic remediation/mutation, not during download or initial analysis.
- The 2019 and 2018 annual reports did complete at `95/A` and `97/A`, but they were still expensive (`271778ms` and `188953ms`), so this is a runtime-tail family rather than a missing score rule.

Table target-resolution diagnostic:

- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: `pajcjc-08`, `pajcjc-09`, `pajcjc-10`
- Unsafe same-source controls: `pajcjc-11`, `pajcjc-12`, `pajcjc-14`
- The focus rows have real table/header debt and stable normalize/header targets, but several A-grade controls also match the same table evidence. Existing table operations on the low rows either rejected on `pdfua.table.header_association_present` PAC regression or returned `no_effect`.

## Decision

No source change was accepted for this holdout.

This source reinforces two already-parked lanes: runtime-tail control on large report-style PDFs, and a real table/header transaction that can preserve or rebuild header associations after shape normalization. It does not justify a new broad behavior change because the high-impact movement is dominated by hard timeouts, and the table predicate is not selective enough against same-source controls.

No original-50 validation was required because no scoring, planning, remediation, API, or Docker behavior changed. Downloaded PDFs and generated validation artifacts are local scratch only and should be deleted after this report is recorded.
