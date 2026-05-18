# Georgia GBI Public Holdout - 2026-05-18

## Source And Sample

- Source: Georgia Bureau of Investigation public PDF pages
- Source pages:
  - https://gbi.georgia.gov/georgia-crime-information-center-0
  - https://gbi.georgia.gov/services/crime-statistics/gbi-crime-statistics-database
  - https://gbi.georgia.gov/
  - https://gbi.georgia.gov/georgia-crime-information-center
- Sample rule: first 20 unique GBI-hosted PDF links from the source pages that downloaded as PDFs and were under 10 MB.
- Local input directory: `Input/georgia_gbi_holdout_2026_05_18`
- Public PDFs were temporary holdout artifacts and were deleted after metrics extraction.

| row | file | size | URL |
| --- | --- | ---: | --- |
| 01 | `01-2024_Crime_Statistics_Summary.pdf` | 1.8 MB | https://gbi.georgia.gov/document/document/2024-crime-statistics-summary/download |
| 02 | `02-2023_Crime_Statistics_Summary__updated_1-27-2025_.pdf` | 1.5 MB | https://gbi.georgia.gov/document/document/2023-crime-statistics-summary/download |
| 03 | `03-2022_Crime_Statistics_Summary.pdf` | 1.7 MB | https://gbi.georgia.gov/document/document/2022-crime-statistics-summary-report/download |
| 04 | `04-2021_Crime_Statistics_Summary.pdf` | 1.6 MB | https://gbi.georgia.gov/document/document/2021-crime-statistics-summary-report/download |
| 05 | `05-2020_Crime_Statistics_Summary.pdf` | 1.7 MB | https://gbi.georgia.gov/document/document/2020-crime-statistics-summary-report/download |
| 06 | `06-09.2019_Crime_Statistics_Summary_Report.pdf` | 1.5 MB | https://gbi.georgia.gov/document/document/2019-crime-statistics-summary-report/download-0 |
| 07 | `07-10.2018_Crime_Statistics_Summary_Report.pdf` | 1.8 MB | https://gbi.georgia.gov/document/document/2018-crime-statistics-summary-report/download-0 |
| 08 | `08-2017_Crime_Statistics_Summary_Report.pdf` | 0.7 MB | https://gbi.georgia.gov/document/publication/2017-crime-statistics-summary-report/download |
| 09 | `09-2016_Crime_Statistics_Summary_Report_Revised.pdf` | 0.5 MB | https://gbi.georgia.gov/document/publication/2016-crime-statistics-summary-report/download |
| 10 | `10-2015_Crime_Statistics_Summary_Report.pdf` | 0.5 MB | https://gbi.georgia.gov/document/publication/2015-crime-statistics-summary-report/download |
| 11 | `11-2014CrimeStatisticsSummaryReport.pdf` | 0.3 MB | https://gbi.georgia.gov/document/publication/2014-crime-statistics-summary-report/download |
| 12 | `12-2013_Crimes_Statistics_Summary_Report.pdf` | 0.1 MB | https://gbi.georgia.gov/document/publication/2013-crime-statistics-summary-report/download |
| 13 | `13-2012_Crime_Statistics_Summary_Report.pdf` | 0.1 MB | https://gbi.georgia.gov/document/publication/2012-crime-statistics-summary-report/download |
| 14 | `14-2011UCRSummaryReport1.pdf` | 0.2 MB | https://gbi.georgia.gov/document/publication/2011-crime-statistics-summary-report/download |
| 15 | `15-1734093362010_Summary_Report.pdf` | 0.1 MB | https://gbi.georgia.gov/document/publication/2010-crime-statistics-summary-report/download |
| 16 | `16-1598322302009_Summary_Report.pdf` | 0.1 MB | https://gbi.georgia.gov/document/publication/2009-crime-statistics-summary-report/download |
| 17 | `17-Request_to_Restrict_Record_Application_and_Instructions_form.pdf` | 0.4 MB | https://gbi.georgia.gov/document/publication/request-restrict-arrest-record-instructions-and-request-form/download |
| 18 | `18-Georgia_Law_Regarding_Time_Expired_Restriction_Notifications.pdf` | 0.2 MB | https://gbi.georgia.gov/document/document/georgia-law-regarding-time-expired-restriction-notifications/download |
| 19 | `19-182115224afis_changes_memo.pdf` | 0.0 MB | https://gbi.georgia.gov/document/publication/afis-changes-memo-non-criminal-justice-agencies/download |
| 20 | `20-182115318afis_changes_memo030912.pdf` | 0.0 MB | https://gbi.georgia.gov/document/publication/afis-changes-memo-non-criminal-justice-agencies-march-9-2012/download |

## Deterministic Holdout Run

Run artifact, local only:

`/mnt/pdf-review/pdfaf-validation/georgia-gbi-holdout-2026-05-18-r1/baseline_report.json`

Command:

```bash
PDFAF_RUN_LOCAL_LLM=0 \
OPENAI_COMPAT_BASE_URL= \
PDFAF_CHECK_ANALYSIS_TIMEOUT_MS=15000 \
REQUEST_TIMEOUT_ANALYZE_MS=15000 \
PDFAF_REMEDIATION_PDF_TIMEOUT_MS=300000 \
REQUEST_TIMEOUT_REMEDIATE_MS=300000 \
timeout 3000s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/georgia_gbi_holdout_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/georgia-gbi-holdout-2026-05-18-r1 \
  --no-semantic \
  --no-pdfs
```

Summary:

- Processed: `20/20`
- Mean: `35.70 -> 93.45`
- Median after remediation: `95`
- Rows below `93`: `2`
- Rows below `95`: `9`
- Minimum final score: `59`
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`
- p95/max runtime: `139169ms / 148900ms`

| row | file | before | final | delta | runtime |
| --- | --- | ---: | ---: | ---: | ---: |
| 01 | `01-2024_Crime_Statistics_Summary.pdf` | 59/F | 94/A | +35 | 139.2s |
| 02 | `02-2023_Crime_Statistics_Summary__updated_1-27-2025_.pdf` | 28/F | 94/A | +66 | 12.2s |
| 03 | `03-2022_Crime_Statistics_Summary.pdf` | 52/F | 92/A | +40 | 148.9s |
| 04 | `04-2021_Crime_Statistics_Summary.pdf` | 28/F | 94/A | +66 | 12.8s |
| 05 | `05-2020_Crime_Statistics_Summary.pdf` | 28/F | 93/A | +65 | 13.7s |
| 06 | `06-09.2019_Crime_Statistics_Summary_Report.pdf` | 28/F | 94/A | +66 | 12.0s |
| 07 | `07-10.2018_Crime_Statistics_Summary_Report.pdf` | 28/F | 94/A | +66 | 13.0s |
| 08 | `08-2017_Crime_Statistics_Summary_Report.pdf` | 31/F | 59/F | +28 | 11.7s |
| 09 | `09-2016_Crime_Statistics_Summary_Report_Revised.pdf` | 28/F | 98/A | +70 | 9.0s |
| 10 | `10-2015_Crime_Statistics_Summary_Report.pdf` | 28/F | 98/A | +70 | 8.8s |
| 11 | `11-2014CrimeStatisticsSummaryReport.pdf` | 36/F | 94/A | +58 | 63.7s |
| 12 | `12-2013_Crimes_Statistics_Summary_Report.pdf` | 28/F | 95/A | +67 | 34.6s |
| 13 | `13-2012_Crime_Statistics_Summary_Report.pdf` | 28/F | 95/A | +67 | 49.8s |
| 14 | `14-2011UCRSummaryReport1.pdf` | 28/F | 95/A | +67 | 46.0s |
| 15 | `15-1734093362010_Summary_Report.pdf` | 34/F | 95/A | +61 | 31.0s |
| 16 | `16-1598322302009_Summary_Report.pdf` | 28/F | 95/A | +67 | 27.0s |
| 17 | `17-Request_to_Restrict_Record_Application_and_Instructions_form.pdf` | 44/F | 98/A | +54 | 7.8s |
| 18 | `18-Georgia_Law_Regarding_Time_Expired_Restriction_Notifications.pdf` | 34/F | 99/A | +65 | 7.6s |
| 19 | `19-182115224afis_changes_memo.pdf` | 39/F | 95/A | +56 | 9.2s |
| 20 | `20-182115318afis_changes_memo030912.pdf` | 39/F | 98/A | +59 | 9.2s |

## Residuals

The source clears the requested mean and median target on accepted code. The two below-93 rows still point to broader parked lanes:

- Row `03` reaches `92/A` after `normalize_table_structure` moves `69 -> 91` and local font substitution moves `91 -> 92`, but subsequent table normalization and orphan cleanup are rejected by `pdfua.table.header_association_present`; final table markup is `44` and PDF/UA is `63`.
- Row `08` stays `59/F` with `heading_structure=0`, `reading_order=96`, `pdf_ua_compliance=100`, and no table/alt debt. This is another deep native-tagged zero-heading shell where current tools do not find a safe heading creation path.

## Decision

No source behavior change is accepted from this holdout.

The engine already clears this public source set at mean `93.45` and median `95` with no hard errors and `false_positive_applied=0`. No original-50 regression run was required because no source change was accepted.

## Cleanup

Deleted after metrics extraction:

- `Input/georgia_gbi_holdout_2026_05_18`
- `/mnt/pdf-review/pdfaf-validation/georgia-gbi-holdout-2026-05-18-r1`
