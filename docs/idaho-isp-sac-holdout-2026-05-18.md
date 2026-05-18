# Idaho ISP SAC Public Holdout - 2026-05-18

## Source And Sample

- Source: Idaho State Police, Idaho Statistical Analysis Center
- Source page: https://isp.idaho.gov/pgr/isac/
- Sample rule: first 20 unique direct PDF links from the source page that downloaded as PDFs and were under 10 MB.
- Local input directory: `Input/idaho_sac_holdout_2026_05_18`
- Public PDFs were temporary holdout artifacts and were deleted after metrics extraction.

| row | file | size | URL |
| --- | --- | ---: | --- |
| 01 | `01-Intimate-Partner-Violence-in-Idaho-2024.pdf` | 0.7 MB | https://isp.idaho.gov/wp-content/uploads/PGR/ISAC-Library/Research-Briefs/Intimate-Partner-Violence-in-Idaho-2024.pdf |
| 02 | `02-Sexual-Violence-in-Idaho-2024.pdf` | 0.7 MB | https://isp.idaho.gov/wp-content/uploads/PGR/ISAC-Library/Research-Briefs/Sexual-Violence-in-Idaho-2024.pdf |
| 03 | `03-Drug_Alcohol-Related-Crime-Trends-2005_2024.pdf` | 1.7 MB | https://isp.idaho.gov/wp-content/uploads/PGR/ISAC-Library/Research-Briefs/Drug_Alcohol-Related-Crime-Trends-2005_2024.pdf |
| 04 | `04-TFCSO-In-Car-Cameras.pdf` | 0.7 MB | https://isp.idaho.gov/wp-content/uploads/PGR/ISAC-Library/Program-Evaluations/TFCSO-In-Car-Cameras.pdf |
| 05 | `05-School-Resource-Officers-in-Idaho.pdf` | 1.1 MB | https://isp.idaho.gov/wp-content/uploads/PGR/ISAC-Library/Juvenile-Crime/School-Resource-Officers-in-Idaho.pdf |
| 06 | `06-Crime-Victimization-in-Idaho.pdf` | 0.6 MB | https://isp.idaho.gov/wp-content/uploads/PGR/ISAC-Library/Victimization/Crime-Victimization-in-Idaho.pdf |
| 07 | `07-Idaho-Sexual-Violence-Surveillance-System-Initial-Development-and-Data-Analysis.pdf` | 0.8 MB | https://isp.idaho.gov/wp-content/uploads/PGR/ISAC-Library/Justice-System-Performance/Idaho-Sexual-Violence-Surveillance-System-Initial-Development-and-Data-Analysis.pdf |
| 08 | `08-Forensic-Interviews-in-Idaho.pdf` | 0.3 MB | https://isp.idaho.gov/wp-content/uploads/PGR/ISAC-Library/Victimization/Forensic-Interviews-in-Idaho.pdf |
| 09 | `09-Byrne-Supported-Local-Task-Forces-in-Idaho-2001-Yearly-Review.pdf` | 0.2 MB | https://isp.idaho.gov/wp-content/uploads/PGR/ISAC-Library/Byrne-Task-Force-Reports/Byrne-Supported-Local-Task-Forces-in-Idaho-2001-Yearly-Review.pdf |
| 10 | `10-Byrne-Supported-Local-Task-Forces-in-Idaho-2002-Yearly-Review.pdf` | 0.1 MB | https://isp.idaho.gov/wp-content/uploads/PGR/ISAC-Library/Byrne-Task-Force-Reports/Byrne-Supported-Local-Task-Forces-in-Idaho-2002-Yearly-Review.pdf |
| 11 | `11-Byrne-Supported-Local-Task-Forces-in-Idaho-2003-Yearly-Review.pdf` | 0.3 MB | https://isp.idaho.gov/wp-content/uploads/PGR/ISAC-Library/Byrne-Task-Force-Reports/Byrne-Supported-Local-Task-Forces-in-Idaho-2003-Yearly-Review.pdf |
| 12 | `12-Byrne-Supported-Local-Task-Forces-in-Idaho-2004-Yearly-Review.pdf` | 0.2 MB | https://isp.idaho.gov/wp-content/uploads/PGR/ISAC-Library/Byrne-Task-Force-Reports/Byrne-Supported-Local-Task-Forces-in-Idaho-2004-Yearly-Review.pdf |
| 13 | `13-Byrne-Supported-Local-Task-Forces-in-Idaho-2006-Yearly-Review.pdf` | 0.2 MB | https://isp.idaho.gov/wp-content/uploads/PGR/ISAC-Library/Byrne-Task-Force-Reports/Byrne-Supported-Local-Task-Forces-in-Idaho-2006-Yearly-Review.pdf |
| 14 | `14-American-Indian-Crime-in-Idaho-Victims-Offenders-and-Arrestees.pdf` | 1.8 MB | https://isp.idaho.gov/wp-content/uploads/PGR/ISAC-Library/Crime-Trends/American-Indian-Crime-in-Idaho-Victims-Offenders-and-Arrestees.pdf |
| 15 | `15-Domestic-Violence-in-Idaho-2005-2010.pdf` | 1.5 MB | https://isp.idaho.gov/wp-content/uploads/PGR/ISAC-Library/Crime-Trends/Domestic-Violence-in-Idaho-2005-2010.pdf |
| 16 | `16-Domestic-Violence-in-Idaho-2007-2012.pdf` | 1.5 MB | https://isp.idaho.gov/wp-content/uploads/PGR/ISAC-Library/Crime-Trends/Domestic-Violence-in-Idaho-2007-2012.pdf |
| 17 | `17-Domestic-Violence-in-Idaho-2008-2013.pdf` | 0.8 MB | https://isp.idaho.gov/wp-content/uploads/PGR/ISAC-Library/Crime-Trends/Domestic-Violence-in-Idaho-2008-2013.pdf |
| 18 | `18-Drug-Arrests-and-Violent-Crime-Trends-2004.pdf` | 0.7 MB | https://isp.idaho.gov/wp-content/uploads/PGR/ISAC-Library/Crime-Trends/Drug-Arrests-and-Violent-Crime-Trends-2004.pdf |
| 19 | `19-Drug-Offenses-Seizures-and-Arrests-in-Idaho-1998-2006.pdf` | 0.3 MB | https://isp.idaho.gov/wp-content/uploads/PGR/ISAC-Library/Crime-Trends/Drug-Offenses-Seizures-and-Arrests-in-Idaho-1998-2006.pdf |
| 20 | `20-Drug-Related-Arrests-1998-2004.pdf` | 0.7 MB | https://isp.idaho.gov/wp-content/uploads/PGR/ISAC-Library/Crime-Trends/Drug-Related-Arrests-1998-2004.pdf |

## Deterministic Holdout Run

Run artifact, local only:

`/mnt/pdf-review/pdfaf-validation/idaho-sac-holdout-2026-05-18-r1/baseline_report.json`

Command:

```bash
PDFAF_RUN_LOCAL_LLM=0 \
OPENAI_COMPAT_BASE_URL= \
PDFAF_CHECK_ANALYSIS_TIMEOUT_MS=15000 \
REQUEST_TIMEOUT_ANALYZE_MS=15000 \
PDFAF_REMEDIATION_PDF_TIMEOUT_MS=300000 \
REQUEST_TIMEOUT_REMEDIATE_MS=300000 \
timeout 3000s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/idaho_sac_holdout_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/idaho-sac-holdout-2026-05-18-r1 \
  --no-semantic \
  --no-pdfs
```

Summary:

- Processed: `20/20`
- Mean: `50.85 -> 92.75`
- Median after remediation: `95`
- Rows below `93`: `2`
- Rows below `95`: `9`
- Minimum final score: `69`
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`
- p95/max runtime: `131039ms / 136512ms`

| row | file | before | final | delta | runtime |
| --- | --- | ---: | ---: | ---: | ---: |
| 01 | `01-Intimate-Partner-Violence-in-Idaho-2024.pdf` | 77/C | 99/A | +22 | 13.0s |
| 02 | `02-Sexual-Violence-in-Idaho-2024.pdf` | 77/C | 99/A | +22 | 13.2s |
| 03 | `03-Drug_Alcohol-Related-Crime-Trends-2005_2024.pdf` | 75/C | 97/A | +22 | 16.5s |
| 04 | `04-TFCSO-In-Car-Cameras.pdf` | 68/D | 95/A | +27 | 16.0s |
| 05 | `05-School-Resource-Officers-in-Idaho.pdf` | 68/D | 95/A | +27 | 48.3s |
| 06 | `06-Crime-Victimization-in-Idaho.pdf` | 68/D | 94/A | +26 | 12.6s |
| 07 | `07-Idaho-Sexual-Violence-Surveillance-System-Initial-Development-and-Data-Analysis.pdf` | 66/D | 96/A | +30 | 38.6s |
| 08 | `08-Forensic-Interviews-in-Idaho.pdf` | 59/F | 96/A | +37 | 17.4s |
| 09 | `09-Byrne-Supported-Local-Task-Forces-in-Idaho-2001-Yearly-Review.pdf` | 28/F | 95/A | +67 | 14.0s |
| 10 | `10-Byrne-Supported-Local-Task-Forces-in-Idaho-2002-Yearly-Review.pdf` | 50/F | 96/A | +46 | 10.0s |
| 11 | `11-Byrne-Supported-Local-Task-Forces-in-Idaho-2003-Yearly-Review.pdf` | 34/F | 95/A | +61 | 8.2s |
| 12 | `12-Byrne-Supported-Local-Task-Forces-in-Idaho-2004-Yearly-Review.pdf` | 34/F | 94/A | +60 | 7.2s |
| 13 | `13-Byrne-Supported-Local-Task-Forces-in-Idaho-2006-Yearly-Review.pdf` | 34/F | 94/A | +60 | 7.8s |
| 14 | `14-American-Indian-Crime-in-Idaho-Victims-Offenders-and-Arrestees.pdf` | 60/D | 69/D | +9 | 131.0s |
| 15 | `15-Domestic-Violence-in-Idaho-2005-2010.pdf` | 34/F | 93/A | +59 | 73.5s |
| 16 | `16-Domestic-Violence-in-Idaho-2007-2012.pdf` | 55/F | 71/C | +16 | 58.2s |
| 17 | `17-Domestic-Violence-in-Idaho-2008-2013.pdf` | 28/F | 94/A | +66 | 136.5s |
| 18 | `18-Drug-Arrests-and-Violent-Crime-Trends-2004.pdf` | 34/F | 94/A | +60 | 10.2s |
| 19 | `19-Drug-Offenses-Seizures-and-Arrests-in-Idaho-1998-2006.pdf` | 34/F | 95/A | +61 | 8.5s |
| 20 | `20-Drug-Related-Arrests-1998-2004.pdf` | 34/F | 94/A | +60 | 11.7s |

## Diagnostics

The source missed the requested 93+ mean threshold by `5` raw points while passing median. Only rows `14` and `16` were below `93`.

Row `14` is not an alt-text problem after remediation. A focused PDF-writing repeat and alt-object diagnostic showed:

- Repeat result: `69/D`
- Reanalysis categories: `alt_text=100`, `table_markup=0`, `pdf_ua_compliance=63`, `heading_structure=78`, `reading_order=86`
- Checker-visible missing alt: `0/10`
- Table/structure/alt tools repeatedly reject because `pdfua.table.header_association_present` worsens.

Row `16` is repeat/route volatile and has mixed table plus large figure-alt debt:

- Full holdout result: `71/C`
- Focus repeat result: `64/D`
- Alt-object diagnostic on the focus artifact: `alt_text=20`, `table_markup=0`, `pdf_ua_compliance=71`, checker-visible missing alt `124/127`
- The existing three direct `set_figure_alt_text` applications were accepted, but a manual continuation probe from the remediated state did not improve score:
  - Extra alt step 1: score `63 -> 62`, no PAC regression
  - Extra alt step 2: score stayed `62`, no PAC regression
  - Extra alt step 3: score stayed `62`, but introduced `pdfua.figure.alt_present` regression `119 -> 121`

That rules out a simple general "apply more direct alt targets even with table debt" change from this evidence.

## Decision

No source behavior change is accepted from this holdout.

The useful evidence is:

- The current engine handles most Idaho SAC PDFs well: `18/20` rows reached `93+`, median `95`, no hard timeouts, and `false_positive_applied=0`.
- The remaining blocker is the same general table/header transaction debt seen across other public annual-report sources. The engine needs a real general transaction that reduces final `pdfua.table.header_association_present` debt, not a wider Stage 180 admission rule or a PAC exception.
- Row `16` also shows direct missing-alt debt, but extra alt targets from the post-remediation state were score-flat or harmful and cannot justify a planner broadening.

No original-50 regression run was required because no source change was accepted.

## Cleanup

Deleted after metrics extraction:

- `Input/idaho_sac_holdout_2026_05_18`
- `Input/idaho_sac_focus_2026_05_18`
- `/mnt/pdf-review/pdfaf-validation/idaho-sac-holdout-2026-05-18-r1`
- `/mnt/pdf-review/pdfaf-validation/idaho-sac-focus-lowrows-2026-05-18-r1`
- `/mnt/pdf-review/pdfaf-validation/idaho-sac-alt-object-diagnostic-2026-05-18-r1`
- `/mnt/pdf-review/pdfaf-validation/idaho-sac-row16-alt-continuation-probe-2026-05-18-r1`
