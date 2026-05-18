# Maryland GOCPP Publications Holdout

Date: 2026-05-18

Source: Maryland Governor's Office of Crime Prevention and Policy reports and publications page, `https://gocpp.maryland.gov/reports-and-publications/`.

Decision: failed the public-source target on accepted code. No remediation behavior change was made.

## Sample

Twenty public PDFs under 10 MB were sampled from the first direct PDF links on the GOCPP reports page:

| Row | PDF |
| --- | --- |
| 01 | `FINAL-State-Summit-Report-2025.pdf` |
| 02 | `2024-State-Summit-Report.pdf` |
| 03 | `2023-State-Summit-Report.pdf` |
| 04 | `State-Summit-Report-FINAL-2022.pdf` |
| 05 | `Centers-of-Excellence-2025-Report.pdf` |
| 06 | `Centers-of-Excellence-2024-Report.pdf` |
| 07 | `Crisis-Intervention-Team-Center-of-Excellence-2023-Annual-Report.pdf` |
| 08 | `HG13-4204_2022.pdf` |
| 09 | `PS3-522(e)_2022.pdf` |
| 10 | `PS3-522(e)_2021.pdf` |
| 11 | `PS3-522(e)_2020.pdf` |
| 12 | `Scorecard-of-Quantifiable-Safety-Indicators-2025-Letter.pdf` |
| 13 | `Governors-Council-on-Gangs-and-Violent-Criminal-Networks-2025-Letter.pdf` |
| 14 | `Governors-Council-on-Gangs-and-Violent-Criminal-Networks-2024-Letter.pdf` |
| 15 | `Governors-Council-on-Gangs-and-Violent-Criminal-Networks-2023-Letter.pdf` |
| 16 | `EXORD01.01.2017.30A_2022.pdf` |
| 17 | `EXORD01.01.2017.30A_2021.pdf` |
| 18 | `EXORD01.01.2017.30A_2020.pdf` |
| 19 | `EXORD01.01.2017.30A_2019.pdf` |
| 20 | `EXORD01.01.2017.30A_2018.pdf` |

All downloaded files were between `0.18 MB` and `2.02 MB`.

## Run

Temporary input:

```text
Input/maryland_gocpp_publications_holdout_2026_05_18
```

Temporary output:

```text
/mnt/pdf-review/pdfaf-validation/maryland-gocpp-publications-holdout-2026-05-18-r1
```

Command:

```bash
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= \
PDFAF_CHECK_ANALYSIS_TIMEOUT_MS=15000 REQUEST_TIMEOUT_ANALYZE_MS=15000 \
PDFAF_REMEDIATION_PDF_TIMEOUT_MS=300000 REQUEST_TIMEOUT_REMEDIATE_MS=300000 \
timeout 2400s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/maryland_gocpp_publications_holdout_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/maryland-gocpp-publications-holdout-2026-05-18-r1 \
  --no-semantic --no-pdfs
```

## Results

- processed: `20/20`
- mean: `43.00 -> 78.80`
- completed-row mean after remediation: `82.95`
- median: `40 -> 79`
- rows below `93`: `15`
- rows below `95`: `15`
- hard errors: `1`
- `false_positive_applied=0`
- p95/max runtime: `215900ms / 300006ms`

Rows:

| Row | Before | After | Runtime | Error |
| --- | ---: | ---: | ---: | --- |
| 01 | 52/F | 69/D | 209.4s |  |
| 02 | 58/F | 99/A | 130.6s |  |
| 03 | 40/F | 78/C | 215.9s |  |
| 04 | 40/F | 0/? | 300.0s | `per_pdf_timeout_300000ms` |
| 05 | 51/F | 69/D | 51.7s |  |
| 06 | 40/F | 79/C | 209.0s |  |
| 07 | 40/F | 79/C | 87.4s |  |
| 08 | 41/F | 79/C | 15.0s |  |
| 09 | 40/F | 79/C | 12.5s |  |
| 10 | 40/F | 79/C | 14.2s |  |
| 11 | 35/F | 95/A | 11.9s |  |
| 12 | 59/F | 99/A | 8.5s |  |
| 13 | 59/F | 99/A | 8.6s |  |
| 14 | 40/F | 79/C | 37.0s |  |
| 15 | 40/F | 79/C | 39.1s |  |
| 16 | 40/F | 79/C | 12.4s |  |
| 17 | 40/F | 79/C | 13.2s |  |
| 18 | 35/F | 79/C | 14.0s |  |
| 19 | 35/F | 99/A | 13.1s |  |
| 20 | 35/F | 79/C | 177.6s |  |

## Failure Shape

This source exposes three residual families.

Newer summit and centers reports:

- row `01` finishes `69/D` with `table_markup=35` and remaining PDF/UA/table debt
- row `05` finishes `69/D` with `table_markup=0`
- table tools often no-effect or reject on `pdfua.table.header_association_present` or `pdfua.content.orphan_mcids_absent`
- figure-alt repairs move some score but do not resolve the table/PDF-UA floor

Legacy letter-style reports:

- rows `06-10`, `14-18`, and `20` mostly plateau at `79/C`
- common final residuals are `link_quality=73`, `reading_order` around `55-79`, and `pdf_ua_compliance` around `71-79`
- many rows recover from `40/F` through `synthesize_basic_structure_from_layout`, then later link/annotation/artifact repairs reject on `pdfua.parent_tree.mcid_entries_valid`, `pdfua.content.orphan_mcids_absent`, or guarded core-category regression

Runtime:

- row `04` hard-times out after reaching an intermediate `79/C` route
- rows `01`, `03`, `06`, and `20` also take about `178s-216s`

The evidence does not point to a small safe acceptance change. It reinforces two general lanes already seen elsewhere:

- table/header/PDF-UA transaction design for report-style rows with table debt
- parent-tree/link/reading-order transaction design for synthesized legacy letters

## Decision

No source change was made. This set should not be counted as passing. A candidate to lift it must be general and must clear original-50 quality and speed gates before acceptance.

## Cleanup

The downloaded public PDFs and generated benchmark artifact were deleted after metrics extraction. This document is the durable source-tracked record.

