# Colorado DCJ ORS Public Holdout - 2026-05-18

## Source And Sample

- Source: Colorado Division of Criminal Justice, Office of Research and Statistics reports
- Source page: https://dcj.colorado.gov/dcj-offices/ors/doc-rpt
- Sample rule: first 20 unique direct `cdpsdocs.state.co.us` PDF links from the source page that downloaded as PDFs and were under 10 MB.
- Skipped as over the size limit: `2025_SB13-283-MJRpt.pdf` at about `17.3 MB`.
- Local input directory: `Input/colorado_dcj_ors_holdout_2026_05_18`
- Public PDFs were temporary holdout artifacts and were deleted after metrics extraction.

| row | file | size | URL |
| --- | --- | ---: | --- |
| 01 | `01-2025_DUI-HB17-1315-CY2022.pdf` | 4.1 MB | https://cdpsdocs.state.co.us/ors/docs/reports/2025_DUI-HB17-1315-CY2022.pdf |
| 02 | `02-2025_LEI-Rpt-CY2024.pdf` | 0.9 MB | https://cdpsdocs.state.co.us/ors/Docs/Reports/2025_LEI-Rpt-CY2024.pdf |
| 03 | `03-2025_PPP-Interim.pdf` | 0.3 MB | https://cdpsdocs.state.co.us/ors/data/PPP/2025_PPP-Interim.pdf |
| 04 | `04-2025_LEI-Rpt-CY2023.pdf` | 0.9 MB | https://cdpsdocs.state.co.us/ors/Docs/Reports/2025_LEI-Rpt-CY2023.pdf |
| 05 | `05-2025_HB15-1273-StudentContacts.pdf` | 1.0 MB | https://cdpsdocs.state.co.us/ors/Docs/Reports/2025_HB15-1273-StudentContacts.pdf |
| 06 | `06-2025_YOSRpt-CY2024.pdf` | 1.3 MB | https://cdpsdocs.state.co.us/ors/docs/Reports/2025_YOSRpt-CY2024.pdf |
| 07 | `07-2025_HVE-Rpt-FY2024.pdf` | 2.1 MB | https://cdpsdocs.state.co.us/ors/Docs/Reports/2025_HVE-Rpt-FY2024.pdf |
| 08 | `08-2025_PPP.pdf` | 1.2 MB | https://cdpsdocs.state.co.us/ors/data/PPP/2025_PPP.pdf |
| 09 | `09-2024_PPP-Interim.pdf` | 0.2 MB | https://cdpsdocs.state.co.us/ors/data/PPP/2024_PPP-Interim.pdf |
| 10 | `10-2024_DUI-HB17-1315.pdf` | 3.1 MB | https://cdpsdocs.state.co.us/ors/docs/reports/2024_DUI-HB17-1315.pdf |
| 11 | `11-2024_HB15-1273-StudentContacts.pdf` | 1.0 MB | https://cdpsdocs.state.co.us/ors/Docs/Reports/2024_HB15-1273-StudentContacts.pdf |
| 12 | `12-2024_PPP.pdf` | 1.7 MB | https://cdpsdocs.state.co.us/ors/data/PPP/2024_PPP.pdf |
| 13 | `13-2024-LEI-Rpt.pdf` | 0.7 MB | https://cdpsdocs.state.co.us/ors/Docs/Reports/2024-LEI-Rpt.pdf |
| 14 | `14-2023_PBDecRpt_17-22.5-404.6.pdf` | 1.4 MB | https://cdpsdocs.state.co.us/ors/Docs/Reports/2023_PBDecRpt_17-22.5-404.6.pdf |
| 15 | `15-2022_YOSRpt.pdf` | 1.0 MB | https://cdpsdocs.state.co.us/ors/Docs/Reports/2022_YOSRpt.pdf |
| 16 | `16-2023-HB15-1273StudentContacts.pdf` | 0.9 MB | https://cdpsdocs.state.co.us/ors/Docs/Reports/2023-HB15-1273StudentContacts.pdf |
| 17 | `17-2023_DUI_HB17-1315.pdf` | 3.2 MB | https://cdpsdocs.state.co.us/ors/docs/reports/2023_DUI_HB17-1315.pdf |
| 18 | `18-2022_CCJJAnnRpt.pdf` | 3.3 MB | https://cdpsdocs.state.co.us/ors/docs/reports/2022_CCJJAnnRpt.pdf |
| 19 | `19-2023_PPP.pdf` | 1.8 MB | https://cdpsdocs.state.co.us/ors/data/PPP/2023_PPP.pdf |
| 20 | `20-2022_PBDecRpt_17-22.5-404.6.pdf` | 1.3 MB | https://cdpsdocs.state.co.us/ors/Docs/Reports/2022_PBDecRpt_17-22.5-404.6.pdf |

## Deterministic Holdout Run

Run artifact, local only:

`/mnt/pdf-review/pdfaf-validation/colorado-dcj-ors-holdout-2026-05-18-r1/baseline_report.json`

Command:

```bash
PDFAF_RUN_LOCAL_LLM=0 \
OPENAI_COMPAT_BASE_URL= \
PDFAF_CHECK_ANALYSIS_TIMEOUT_MS=15000 \
REQUEST_TIMEOUT_ANALYZE_MS=15000 \
PDFAF_REMEDIATION_PDF_TIMEOUT_MS=300000 \
REQUEST_TIMEOUT_REMEDIATE_MS=300000 \
timeout 3000s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/colorado_dcj_ors_holdout_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/colorado-dcj-ors-holdout-2026-05-18-r1 \
  --no-semantic \
  --no-pdfs
```

Summary:

- Processed: `20/20`
- Mean: `76.45 -> 91.35`
- Median after remediation: `96`
- Rows below `93`: `5`
- Rows below `95`: `7`
- Minimum final score: `69`
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`
- p95/max runtime: `256901ms / 300073ms`
- Grades after remediation: `17 A / 3 D`

| row | file | before | final | delta | runtime |
| --- | --- | ---: | ---: | ---: | ---: |
| 01 | `01-2025_DUI-HB17-1315-CY2022.pdf` | 36/F | 69/D | +33 | 300.1s |
| 02 | `02-2025_LEI-Rpt-CY2024.pdf` | 97/A | 97/A | +0 | 58.2s |
| 03 | `03-2025_PPP-Interim.pdf` | 94/A | 96/A | +2 | 8.8s |
| 04 | `04-2025_LEI-Rpt-CY2023.pdf` | 97/A | 97/A | +0 | 105.6s |
| 05 | `05-2025_HB15-1273-StudentContacts.pdf` | 84/B | 96/A | +12 | 128.8s |
| 06 | `06-2025_YOSRpt-CY2024.pdf` | 92/A | 94/A | +2 | 54.5s |
| 07 | `07-2025_HVE-Rpt-FY2024.pdf` | 39/F | 91/A | +52 | 256.9s |
| 08 | `08-2025_PPP.pdf` | 92/A | 97/A | +5 | 82.6s |
| 09 | `09-2024_PPP-Interim.pdf` | 96/A | 96/A | +0 | 6.3s |
| 10 | `10-2024_DUI-HB17-1315.pdf` | 87/B | 97/A | +10 | 245.8s |
| 11 | `11-2024_HB15-1273-StudentContacts.pdf` | 87/B | 96/A | +9 | 71.0s |
| 12 | `12-2024_PPP.pdf` | 59/F | 92/A | +33 | 201.5s |
| 13 | `13-2024-LEI-Rpt.pdf` | 79/C | 96/A | +17 | 48.8s |
| 14 | `14-2023_PBDecRpt_17-22.5-404.6.pdf` | 59/F | 69/D | +10 | 185.9s |
| 15 | `15-2022_YOSRpt.pdf` | 84/B | 96/A | +12 | 70.6s |
| 16 | `16-2023-HB15-1273StudentContacts.pdf` | 87/B | 96/A | +9 | 61.3s |
| 17 | `17-2023_DUI_HB17-1315.pdf` | 87/B | 95/A | +8 | 173.2s |
| 18 | `18-2022_CCJJAnnRpt.pdf` | 46/F | 93/A | +47 | 16.7s |
| 19 | `19-2023_PPP.pdf` | 68/D | 95/A | +27 | 109.3s |
| 20 | `20-2022_PBDecRpt_17-22.5-404.6.pdf` | 59/F | 69/D | +10 | 183.2s |

## Failure Shape

The Colorado source fails the requested `93+` mean target by `33` raw points, while clearing the requested median target.

The low rows split into two familiar general lanes:

- Row `01` returns `69/D` at the 300s wall without a hard error. It improves after catalog/language/title setup, but it does not get through later cleanup. Final residuals include `table_markup=16`, `pdf_ua_compliance=57`, `reading_order=55`, `link_quality=79`, and incomplete alt coverage.
- Rows `14` and `20` plateau at `69/D` with `table_markup=0`, `pdf_ua_compliance=57/50`, and `link_quality=79`. `repair_native_table_headers` applies but does not improve score, `normalize_table_structure` no-effects, and `set_table_header_cells` no-effects even after alt gains.
- Near-misses `07` and `12` reach `91/A` and `92/A`, but fixing those alone cannot bring the source over mean `93`.

The table rows look like the same real table/header transaction debt seen across Oregon, Michigan, New York, Washington, Utah, Delaware, Idaho, Louisiana, and Missouri: current tools can identify table/header state but do not rebuild final `/Scope`, `/ID`, `/Headers`, parent-tree/link, and PAC-visible table associations enough to reduce the checker debt.

## Decision

No source behavior change is accepted from this holdout.

The set does not meet the source mean target, but the failure is not a small safe patch. The likely useful fix would be a general table/header transaction and runtime-control project, followed by original-50 quality and speed validation. A Colorado/report/year/PDF-specific patch, PAC relaxation, or acceptance of unresolved table/link debt would violate the current goal.

No original-50 regression run was required because no source change was accepted.

## Cleanup

Deleted after metrics extraction:

- `Input/colorado_dcj_ors_holdout_2026_05_18`
- `/mnt/pdf-review/pdfaf-validation/colorado-dcj-ors-holdout-2026-05-18-r1`
