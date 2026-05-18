# Utah CCJJ Statutory Reports Holdout

Date: 2026-05-18

Source: Utah Commission on Criminal and Juvenile Justice statutory reports page, `https://justice.utah.gov/research-and-reports/statutory-reports/`.

Decision: failed the public-source target on accepted code. No remediation behavior change was made.

## Sample

Twenty public PDFs under 10 MB were sampled from unique direct PDF links on the CCJJ statutory reports page:

| Row | PDF |
| --- | --- |
| 01 | `2024-DUI-Annual-Report-Final.pdf` |
| 02 | `JRI-2025-Annual-Update-for-Legislature.pdf` |
| 03 | `2024-Utah-Annual-Forfeiture-Report.pdf` |
| 04 | `2023-Utah-Annual-Forfeiture-Report.pdf` |
| 05 | `2022-Utah-Annual-Forfeiture-Report.pdf` |
| 06 | `2021-Utah-Annual-Forfeiture-Report.pdf` |
| 07 | `2020-Utah-Annual-Forfeiture-Report.pdf` |
| 08 | `2019-Utah-Annual-Forfeiture-Report.pdf` |
| 09 | `2018-Utah-Annual-Forfeiture-Report.pdf` |
| 10 | `JRI-2024-Annual-Update-for-Legislature-Draft-Final-Edits-12-4.pdf` |
| 11 | `JRI-2023-Annual-Update-for-Legislature-Final-Complete-Draft.pdf` |
| 12 | `JRI-2022-Annual-Update-for-Legislature-Integrated-Draft-Final-Updated-March-2023.pdf` |
| 13 | `JRI-Listening-Tour-Transparency-Report-3.pdf` |
| 14 | `JRI-2021-Annual.pdf` |
| 15 | `JRI-2020-Annual-Update-for-Legislature-Condensed-Summary-with-Supplemental-Pages-Updated-2021.pdf` |
| 16 | `Public-Safety-Portal-Report-2025.pdf` |
| 17 | `Domestic-Violence-Data-in-Utah-2025-Statutory-Report-with-Supplementary-Docs-Jan2026-Update.pdf` |
| 18 | `DVOMG-Final-Report.pdf` |
| 19 | `2025-DUI-Annual-Report-Final-Oct2025.pdf` |
| 20 | `2023-DUI-Annual-Report-Final.pdf` |

All downloaded files were between `0.14 MB` and `3.73 MB`.

## Run

Temporary input:

```text
Input/utah_ccjj_statutory_reports_holdout_2026_05_18
```

Temporary output:

```text
/mnt/pdf-review/pdfaf-validation/utah-ccjj-statutory-reports-holdout-2026-05-18-r1
```

Command:

```bash
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= \
PDFAF_CHECK_ANALYSIS_TIMEOUT_MS=15000 REQUEST_TIMEOUT_ANALYZE_MS=15000 \
PDFAF_REMEDIATION_PDF_TIMEOUT_MS=300000 REQUEST_TIMEOUT_REMEDIATE_MS=300000 \
timeout 2400s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/utah_ccjj_statutory_reports_holdout_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/utah-ccjj-statutory-reports-holdout-2026-05-18-r1 \
  --no-semantic --no-pdfs
```

## Results

- processed: `20/20`
- mean: `44.60 -> 86.70`
- median: `44 -> 93`
- rows below `93`: `9`
- rows below `95`: `15`
- hard errors: `0`
- `false_positive_applied=0`
- p95/max runtime: `247970ms / 271637ms`

Rows:

| Row | Before | After | Runtime |
| --- | ---: | ---: | ---: |
| 01 | 51/F | 69/D | 188.1s |
| 02 | 46/F | 75/C | 271.6s |
| 03 | 53/F | 95/A | 11.2s |
| 04 | 53/F | 95/A | 11.3s |
| 05 | 42/F | 94/A | 13.5s |
| 06 | 42/F | 94/A | 13.8s |
| 07 | 36/F | 97/A | 17.3s |
| 08 | 34/F | 94/A | 12.5s |
| 09 | 38/F | 96/A | 12.3s |
| 10 | 46/F | 75/C | 208.8s |
| 11 | 46/F | 75/C | 248.0s |
| 12 | 46/F | 90/A | 232.5s |
| 13 | 41/F | 95/A | 21.2s |
| 14 | 40/F | 93/A | 24.8s |
| 15 | 40/F | 93/A | 22.0s |
| 16 | 44/F | 82/B | 15.7s |
| 17 | 44/F | 91/A | 31.2s |
| 18 | 34/F | 93/A | 49.1s |
| 19 | 58/F | 69/D | 203.0s |
| 20 | 58/F | 69/D | 219.7s |

## Failure Shape

The forfeiture-report subset is mostly healthy: rows `03-09` all reach `94-97/A`.

The low rows split into three general residual families:

- DUI annual reports (`01`, `19`, `20`) finish at `69/D` with `table_markup=0`, remaining table/PDF-UA debt, and `pdfua.table.header_association_present` blocking heading/table/list/table-header repairs.
- JRI annual updates (`02`, `10`, `11`, `12`) are runtime-heavy and plateau between `75/C` and `90/A`, with figure-alt, link, reading-order, and PDF/UA residuals.
- Public safety/domestic violence rows (`16`, `17`) are near-but-below target and expose link/reading-order plus figure-alt ownership gaps, including `target_not_checker_visible_figure` and figure-stage regression guards.

This does not justify a quick source change. The report strengthens the same general lanes already identified by other public sources:

- table/header/PDF-UA transaction work for rows blocked by `pdfua.table.header_association_present`
- bounded figure-alt ownership/top-up that can handle checker-visible ownership without regressing PAC
- link/reading-order/parent-tree cleanup for non-table reports
- runtime control for long JRI/DUI paths before broad validation

## Decision

No source change was made. The source is below the requested `93+` mean target and should remain a failed holdout until a general fixer clears targeted Utah rows and the original-50 quality/speed gates.

## Cleanup

The downloaded public PDFs and generated benchmark artifact were deleted after metrics extraction. This document is the durable source-tracked record.

