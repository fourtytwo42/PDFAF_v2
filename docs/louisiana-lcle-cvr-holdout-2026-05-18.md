# Louisiana LCLE CVR Public Holdout - 2026-05-18

## Source And Sample

- Source: Louisiana Commission on Law Enforcement CVR annual reports
- Source page: https://lcle.la.gov/programs/cvr/cvr-downloads/
- Sample rule: all 20 CVR annual-report PDFs from 2006 through 2025 that downloaded as PDFs and were under 10 MB. Non-annual-report forms on the same page were excluded.
- Local input directory: `Input/louisiana_lcle_cvr_holdout_2026_05_18`
- Public PDFs were temporary holdout artifacts and were deleted after metrics extraction.

| row | file | size | URL |
| --- | --- | ---: | --- |
| 01 | `01-2025_CVR_Annual_Report_03-10-2026.pdf` | 2.0 MB | https://lcle.la.gov/wp-content/uploads/2026/03/2025_CVR_Annual_Report_03-10-2026.pdf |
| 02 | `02-CVR-2024-Annual-Report.pdf` | 0.7 MB | https://lcle.la.gov/wp-content/uploads/2025/12/CVR-2024-Annual-Report.pdf |
| 03 | `03-2023-CVR-Annual-Report.pdf` | 0.6 MB | https://lcle.la.gov/wp-content/uploads/2025/02/2023-CVR-Annual-Report.pdf |
| 04 | `04-CVR_2022_AnnualReportFinalam.pdf` | 0.3 MB | https://lcle.la.gov/wp-content/uploads/2023/03/CVR_2022_AnnualReportFinalam.pdf |
| 05 | `05-2021-CVR-Annual-Report.pdf` | 6.0 MB | https://lcle.la.gov/wp-content/uploads/2022/02/2021-CVR-Annual-Report.pdf |
| 06 | `06-2020-CVR-Annual-Report.pdf` | 6.0 MB | https://lcle.la.gov/wp-content/uploads/2022/02/2020-CVR-Annual-Report.pdf |
| 07 | `07-CVR-Annual-Report-FY-2019.pdf` | 5.8 MB | https://lcle.la.gov/wp-content/uploads/2021/10/CVR-Annual-Report-FY-2019.pdf |
| 08 | `08-CVR-2018-Annual-Report.pdf` | 0.4 MB | https://lcle.la.gov/wp-content/uploads/2020/06/CVR-2018-Annual-Report.pdf |
| 09 | `09-CVR-2017-Annual-Report.pdf` | 0.4 MB | https://lcle.la.gov/wp-content/uploads/2020/06/CVR-2017-Annual-Report.pdf |
| 10 | `10-CVR-2016-Annual-Report.pdf` | 0.4 MB | https://lcle.la.gov/wp-content/uploads/2020/06/CVR-2016-Annual-Report.pdf |
| 11 | `11-2015_CVR_Annual_Report.pdf` | 0.5 MB | https://lcle.la.gov/wp-content/uploads/2020/06/2015_CVR_Annual_Report.pdf |
| 12 | `12-2014_CVR_Annual_Report.pdf` | 0.3 MB | https://lcle.la.gov/wp-content/uploads/2020/06/2014_CVR_Annual_Report.pdf |
| 13 | `13-2013_CVR_Annual_Report.pdf` | 2.0 MB | https://lcle.la.gov/wp-content/uploads/2020/06/2013_CVR_Annual_Report.pdf |
| 14 | `14-2012_CVR_Annual_Report.pdf` | 1.9 MB | https://lcle.la.gov/wp-content/uploads/2020/06/2012_CVR_Annual_Report.pdf |
| 15 | `15-CVR_2011_annual_Report.pdf` | 0.2 MB | https://lcle.la.gov/wp-content/uploads/2020/06/CVR_2011_annual_Report.pdf |
| 16 | `16-CVR_2010_annual_Report.pdf` | 0.1 MB | https://lcle.la.gov/wp-content/uploads/2020/06/CVR_2010_annual_Report.pdf |
| 17 | `17-CVR_2009_annual_Report.pdf` | 0.1 MB | https://lcle.la.gov/wp-content/uploads/2020/06/CVR_2009_annual_Report.pdf |
| 18 | `18-CVR_2008_annual_Report.pdf` | 0.1 MB | https://lcle.la.gov/wp-content/uploads/2020/06/CVR_2008_annual_Report.pdf |
| 19 | `19-CVR_2007_annual_Report.pdf` | 0.1 MB | https://lcle.la.gov/wp-content/uploads/2020/06/CVR_2007_annual_Report.pdf |
| 20 | `20-CVR_2006_annual_Report.pdf` | 0.0 MB | https://lcle.la.gov/wp-content/uploads/2020/06/CVR_2006_annual_Report.pdf |

## Deterministic Holdout Run

Run artifact, local only:

`/mnt/pdf-review/pdfaf-validation/louisiana-lcle-cvr-holdout-2026-05-18-r1/baseline_report.json`

Command:

```bash
PDFAF_RUN_LOCAL_LLM=0 \
OPENAI_COMPAT_BASE_URL= \
PDFAF_CHECK_ANALYSIS_TIMEOUT_MS=15000 \
REQUEST_TIMEOUT_ANALYZE_MS=15000 \
PDFAF_REMEDIATION_PDF_TIMEOUT_MS=300000 \
REQUEST_TIMEOUT_REMEDIATE_MS=300000 \
timeout 3000s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/louisiana_lcle_cvr_holdout_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/louisiana-lcle-cvr-holdout-2026-05-18-r1 \
  --no-semantic \
  --no-pdfs
```

Summary:

- Processed: `20/20`
- Mean: `25.50 -> 92.35`
- Median after remediation: `94`
- Rows below `93`: `1`
- Rows below `95`: `17`
- Minimum final score: `59`
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`
- p95/max runtime: `85432ms / 85455ms`

| row | file | before | final | delta | runtime |
| --- | --- | ---: | ---: | ---: | ---: |
| 01 | `01-2025_CVR_Annual_Report_03-10-2026.pdf` | 34/F | 94/A | +60 | 36.1s |
| 02 | `02-CVR-2024-Annual-Report.pdf` | 34/F | 98/A | +64 | 11.9s |
| 03 | `03-2023-CVR-Annual-Report.pdf` | 40/F | 59/F | +19 | 78.3s |
| 04 | `04-CVR_2022_AnnualReportFinalam.pdf` | 41/F | 97/A | +56 | 31.4s |
| 05 | `05-2021-CVR-Annual-Report.pdf` | 10/F | 93/A | +83 | 85.5s |
| 06 | `06-2020-CVR-Annual-Report.pdf` | 10/F | 93/A | +83 | 85.4s |
| 07 | `07-CVR-Annual-Report-FY-2019.pdf` | 10/F | 93/A | +83 | 82.9s |
| 08 | `08-CVR-2018-Annual-Report.pdf` | 10/F | 93/A | +83 | 83.0s |
| 09 | `09-CVR-2017-Annual-Report.pdf` | 10/F | 93/A | +83 | 76.3s |
| 10 | `10-CVR-2016-Annual-Report.pdf` | 10/F | 93/A | +83 | 77.7s |
| 11 | `11-2015_CVR_Annual_Report.pdf` | 43/F | 97/A | +54 | 25.9s |
| 12 | `12-2014_CVR_Annual_Report.pdf` | 34/F | 94/A | +60 | 22.8s |
| 13 | `13-2013_CVR_Annual_Report.pdf` | 10/F | 93/A | +83 | 71.5s |
| 14 | `14-2012_CVR_Annual_Report.pdf` | 10/F | 93/A | +83 | 71.6s |
| 15 | `15-CVR_2011_annual_Report.pdf` | 34/F | 94/A | +60 | 9.3s |
| 16 | `16-CVR_2010_annual_Report.pdf` | 34/F | 94/A | +60 | 8.0s |
| 17 | `17-CVR_2009_annual_Report.pdf` | 34/F | 94/A | +60 | 8.0s |
| 18 | `18-CVR_2008_annual_Report.pdf` | 34/F | 94/A | +60 | 9.8s |
| 19 | `19-CVR_2007_annual_Report.pdf` | 34/F | 94/A | +60 | 9.8s |
| 20 | `20-CVR_2006_annual_Report.pdf` | 34/F | 94/A | +60 | 8.3s |

## Focus Repeat

Run artifact, local only:

`/mnt/pdf-review/pdfaf-validation/louisiana-lcle-cvr-focus-2026-05-18-r1/baseline_report.json`

The two-row focus repeat included low row `03` plus row `02` as an A-grade control.

Results:

- Row `03` repeated at `59/F`; this is not a one-run volatility miss.
- Row `02` remained A-grade at `95/A`, down from `98/A` in the full run but still above target.
- Focus `false_positive_applied`: `0`
- Focus max runtime: `80658ms`

## Failure Shape

The Louisiana source misses the requested `93+` mean target by `13` raw points, while clearing the requested median target.

The single blocker is row `03`, which ends with:

- `heading_structure=0`
- `table_markup=0`
- `pdf_ua_compliance=67`
- `reading_order=96`
- `alt_text=100`
- `link_quality=100`

Tool evidence shows a native-tagged document with zero extracted/tree headings, six checker-visible figures with alt fixed, one strongly irregular table target, and table/header debt that current tools do not safely reduce. `set_table_header_cells` no-effects, while orphan/PDF-UA cleanup can regress `pdfua.content.orphan_mcids_absent`. This matches the broader parked real table/header transaction lane plus zero-heading native-tagged shell debt; it is not a Louisiana-specific issue.

## Decision

No source behavior change is accepted from this holdout.

The set fails the source mean target (`92.35`) despite a passing median (`94`). Lifting the source above `93` would require only one row to improve, but the repeated failure shape needs a general transaction that can rebuild table header associations and/or recover heading structure without PAC regressions. A source/year/PDF-specific patch or relaxed PAC acceptance would violate the current goal.

No original-50 regression run was required because no source change was accepted.

## Cleanup

Deleted after metrics extraction:

- `Input/louisiana_lcle_cvr_holdout_2026_05_18`
- `Input/louisiana_lcle_cvr_focus_2026_05_18`
- `/mnt/pdf-review/pdfaf-validation/louisiana-lcle-cvr-holdout-2026-05-18-r1`
- `/mnt/pdf-review/pdfaf-validation/louisiana-lcle-cvr-focus-2026-05-18-r1`
