# New York DCJS Publications Holdout

Date: 2026-05-18

Source: New York State Division of Criminal Justice Services publications page, `https://www.criminaljustice.ny.gov/crimnet/pubs.htm`.

Decision: passed on accepted code. No remediation behavior change was made.

## Sample

Twenty public PDFs under 10 MB were sampled from the DCJS publications page:

| Row | PDF |
| --- | --- |
| 01 | `FINAL 2024 DCJS Annual Performance Report - 6-12-2025.pdf` |
| 02 | `Crime in New York State 2023 Final Data.pdf` |
| 03 | `FINAL 2024 LEAAP Annual Report w appendices.pdf` |
| 04 | `2025 Asset Forfeiture Report_FINAL.pdf` |
| 05 | `2024 Insurance Fraud Annual Report.pdf` |
| 06 | `2024 Environmental Conservation Law Annual Report.pdf` |
| 07 | `dar-3q-2025-newyorkstate.pdf` |
| 08 | `dar-2q-2025-newyorkstate.pdf` |
| 09 | `dar-1q-2025-newyorkstate.pdf` |
| 10 | `dar-4q-2024-newyorkstate.pdf` |
| 11 | `FINAL 2022 Domestic Homicide Report.pdf` |
| 12 | `FINAL 2024 Hate Crime Report 05_06_26.pdf` |
| 13 | `2024-Human-Traffiking-Report.pdf` |
| 14 | `FINAL 2024 Missing Persons Clearinghouse Annual Report.pdf` |
| 15 | `2024 MVTIFP Annual Report with footnotes added.pdf` |
| 16 | `FINAL 13-A Legislative Report 2024-2025.pdf` |
| 17 | `2023 Probation Population Report.pdf` |
| 18 | `FINAL 2025 Sex Offender Registry Annual Report.pdf` |
| 19 | `FINAL 2025 Sexual Offense Evidence Kit Inventory Report.pdf` |
| 20 | `FINAL 2024 NYS JJAG Annual Report 12-2024.pdf` |

All downloaded files were between `0.17 MB` and `2.66 MB`.

## Run

Temporary input:

```text
Input/new_york_dcjs_publications_holdout_2026_05_18
```

Temporary output:

```text
/mnt/pdf-review/pdfaf-validation/new-york-dcjs-publications-holdout-2026-05-18-r1
```

Command:

```bash
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= \
PDFAF_CHECK_ANALYSIS_TIMEOUT_MS=15000 REQUEST_TIMEOUT_ANALYZE_MS=15000 \
PDFAF_REMEDIATION_PDF_TIMEOUT_MS=300000 REQUEST_TIMEOUT_REMEDIATE_MS=300000 \
timeout 2400s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/new_york_dcjs_publications_holdout_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/new-york-dcjs-publications-holdout-2026-05-18-r1 \
  --no-semantic --no-pdfs
```

## Results

- processed: `20/20`
- mean: `48.65 -> 94.25`
- median: `41 -> 96`
- rows below `93`: `3`
- rows below `95`: `7`
- `false_positive_applied=0`
- p95/max runtime: `102485ms / 213128ms`

Rows:

| Row | Before | After | Runtime |
| --- | ---: | ---: | ---: |
| 01 | 79/C | 96/A | 19.0s |
| 02 | 34/F | 98/A | 14.9s |
| 03 | 63/D | 97/A | 102.5s |
| 04 | 40/F | 95/A | 8.4s |
| 05 | 39/F | 97/A | 12.0s |
| 06 | 39/F | 98/A | 11.9s |
| 07 | 35/F | 94/A | 42.9s |
| 08 | 38/F | 96/A | 40.6s |
| 09 | 38/F | 96/A | 40.4s |
| 10 | 35/F | 93/A | 43.4s |
| 11 | 41/F | 94/A | 213.1s |
| 12 | 47/F | 94/A | 14.7s |
| 13 | 90/A | 92/A | 43.8s |
| 14 | 55/F | 69/D | 51.2s |
| 15 | 59/F | 95/A | 39.9s |
| 16 | 34/F | 99/A | 6.6s |
| 17 | 38/F | 97/A | 21.1s |
| 18 | 59/F | 97/A | 12.5s |
| 19 | 51/F | 96/A | 15.4s |
| 20 | 59/F | 92/A | 17.8s |

## Residuals

The three rows below `93` do not justify a new behavior change from this source alone:

- Row 13 finished at `92/A` with heading/table scores `79`; table header association improved once, then later table and artifact tools were no-effect or rejected.
- Row 14 finished at `69/D` with `table_markup=0`; `normalize_heading_hierarchy`, `normalize_table_structure`, and `repair_native_table_headers` were rejected by `pdfua.table.header_association_present`, and `set_table_header_cells` was no-effect.
- Row 20 finished at `92/A`; early figure/table tools were blocked by `pdfua.figure.alt_present`, and later structural/table tools were rejected for structural-confidence regression or no-effect.

The only material low row is another instance of the broader table/header transaction debt already seen in California, Oregon, and Michigan. Because the source already clears mean and median targets, no original-50 gate was run and no source change was made.

## Cleanup

The downloaded public PDFs and generated benchmark artifact were deleted after metrics extraction. This document is the durable source-tracked record.

