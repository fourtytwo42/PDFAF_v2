# Missouri MSHP SAC Public Holdout - 2026-05-18

## Source And Sample

- Source: Missouri State Highway Patrol, Statistical Analysis Center Crime Publications
- Source page: https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/publication_crime_960grid.html
- Sample rule: all 20 direct PDF links on the source page that downloaded as PDFs and were under 10 MB.
- Local input directory: `Input/missouri_mshp_sac_holdout_2026_05_18`
- Public PDFs were temporary holdout artifacts and were deleted after metrics extraction.

| row | file | size | URL |
| --- | --- | ---: | --- |
| 01 | `01-2001CrimeInMO.pdf` | 1.4 MB | https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/pdf/2001CrimeInMO.pdf |
| 02 | `02-2002CrimeInMO.pdf` | 1.5 MB | https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/pdf/2002CrimeInMO.pdf |
| 03 | `03-2003CrimeInMO.pdf` | 0.6 MB | https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/pdf/2003CrimeInMO.pdf |
| 04 | `04-2004CrimeInMO.pdf` | 0.8 MB | https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/pdf/2004CrimeInMO.pdf |
| 05 | `05-2005CrimeInMO.pdf` | 1.9 MB | https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/pdf/2005CrimeInMO.pdf |
| 06 | `06-2006CrimeInMO.pdf` | 1.0 MB | https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/pdf/2006CrimeInMO.pdf |
| 07 | `07-2007CrimeInMO.pdf` | 0.7 MB | https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/pdf/2007CrimeInMO.pdf |
| 08 | `08-2008CrimeInMO.pdf` | 1.1 MB | https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/pdf/2008CrimeInMO.pdf |
| 09 | `09-2009CrimeInMO.pdf` | 8.5 MB | https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/pdf/2009CrimeInMO.pdf |
| 10 | `10-2010CrimeInMO.pdf` | 1.2 MB | https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/pdf/2010CrimeInMO.pdf |
| 11 | `11-2011CrimeInMO.pdf` | 0.9 MB | https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/pdf/2011CrimeInMO.pdf |
| 12 | `12-2012CrimeInMO.pdf` | 1.7 MB | https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/pdf/2012CrimeInMO.pdf |
| 13 | `13-Crime_in_Missouri_2013_ver_5.pdf` | 4.1 MB | https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/pdf/Crime%20in%20Missouri%202013%20ver%205.pdf |
| 14 | `14-DomesticViolenceFinalReport.pdf` | 0.7 MB | https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/pdf/DomesticViolenceFinalReport.pdf |
| 15 | `15-Missouri_Hate_Crime_Report.pdf` | 1.4 MB | https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/pdf/Missouri%20Hate%20Crime%20Report.pdf |
| 16 | `16-2010_Hate_Crime_in_Missouri_Dashboard.pdf` | 0.9 MB | https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/pdf/2010%20Hate%20Crime%20in%20Missouri%20Dashboard.pdf |
| 17 | `17-2008-2010_Hate_Crime_in_Missouri_Dashboard.pdf` | 0.9 MB | https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/pdf/2008-2010%20Hate%20Crime%20in%20Missouri%20Dashboard.pdf |
| 18 | `18-Missouri_Hate_Crime_2011.pdf` | 3.3 MB | https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/pdf/Missouri%20Hate%20Crime%202011.pdf |
| 19 | `19-Missouri_Hate_Crime_Report_2012.pdf` | 3.5 MB | https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/pdf/Missouri%20Hate%20Crime%20Report%202012.pdf |
| 20 | `20-Missouri_Hate_Crime_Report_2013.pdf` | 1.5 MB | https://apps.mshp.dps.mo.gov/MSHPWeb/SAC/pdf/Missouri%20Hate%20Crime%20Report%202013.pdf |

## Deterministic Holdout Run

Run artifact, local only:

`/mnt/pdf-review/pdfaf-validation/missouri-mshp-sac-holdout-2026-05-18-r1/baseline_report.json`

Command:

```bash
PDFAF_RUN_LOCAL_LLM=0 \
OPENAI_COMPAT_BASE_URL= \
PDFAF_CHECK_ANALYSIS_TIMEOUT_MS=15000 \
REQUEST_TIMEOUT_ANALYZE_MS=15000 \
PDFAF_REMEDIATION_PDF_TIMEOUT_MS=300000 \
REQUEST_TIMEOUT_REMEDIATE_MS=300000 \
timeout 3000s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/missouri_mshp_sac_holdout_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/missouri-mshp-sac-holdout-2026-05-18-r1 \
  --no-semantic \
  --no-pdfs
```

Summary:

- Processed: `20/20`
- All-row mean: `35.20 -> 78.50`
- Completed-row mean after remediation: `82.63`
- Median after remediation: `87.5` all rows, `90` completed rows
- Rows below `93`: `12`
- Rows below `95`: `19`
- Minimum final score: `0` all rows, `52` completed rows
- `false_positive_applied`: `0`
- Hard timeouts/errors: `1`
- p95/max runtime: `230580ms / 300007ms`

| row | file | before | final | delta | runtime | error |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 01 | `01-2001CrimeInMO.pdf` | 34/F | 94/A | +60 | 17.6s |  |
| 02 | `02-2002CrimeInMO.pdf` | 34/F | 94/A | +60 | 22.7s |  |
| 03 | `03-2003CrimeInMO.pdf` | 28/F | 95/A | +67 | 16.8s |  |
| 04 | `04-2004CrimeInMO.pdf` | 34/F | 94/A | +60 | 20.0s |  |
| 05 | `05-2005CrimeInMO.pdf` | 34/F | 90/A | +56 | 19.5s |  |
| 06 | `06-2006CrimeInMO.pdf` | 34/F | 94/A | +60 | 22.2s |  |
| 07 | `07-2007CrimeInMO.pdf` | 40/F | 79/C | +39 | 20.1s |  |
| 08 | `08-2008CrimeInMO.pdf` | 40/F | 93/A | +53 | 22.0s |  |
| 09 | `09-2009CrimeInMO.pdf` | 30/F | 0/? | -30 | 300.0s | `per_pdf_timeout_300000ms` |
| 10 | `10-2010CrimeInMO.pdf` | 38/F | 69/D | +31 | 66.2s |  |
| 11 | `11-2011CrimeInMO.pdf` | 31/F | 59/F | +28 | 18.8s |  |
| 12 | `12-2012CrimeInMO.pdf` | 31/F | 92/A | +61 | 88.3s |  |
| 13 | `13-Crime_in_Missouri_2013_ver_5.pdf` | 24/F | 52/F | +28 | 230.6s |  |
| 14 | `14-DomesticViolenceFinalReport.pdf` | 69/D | 69/D | +0 | 75.6s |  |
| 15 | `15-Missouri_Hate_Crime_Report.pdf` | 42/F | 69/D | +27 | 127.6s |  |
| 16 | `16-2010_Hate_Crime_in_Missouri_Dashboard.pdf` | 36/F | 85/B | +49 | 10.9s |  |
| 17 | `17-2008-2010_Hate_Crime_in_Missouri_Dashboard.pdf` | 36/F | 85/B | +49 | 10.8s |  |
| 18 | `18-Missouri_Hate_Crime_2011.pdf` | 34/F | 94/A | +60 | 90.5s |  |
| 19 | `19-Missouri_Hate_Crime_Report_2012.pdf` | 34/F | 94/A | +60 | 29.2s |  |
| 20 | `20-Missouri_Hate_Crime_Report_2013.pdf` | 58/F | 69/D | +11 | 156.3s |  |

## Focus Repeat

Run artifact, local only:

`/mnt/pdf-review/pdfaf-validation/missouri-mshp-sac-focus-2026-05-18-r1/baseline_report.json`

The eight-row focus repeat included low rows `09`, `11`, `13`, `14`, `15`, `16`, and `20`, plus `03` as an A-grade control.

Results:

- Row `03` stayed high at `95/A`.
- Row `09` avoided the full-run hard timeout but still only reached `56/F`, with `heading_structure=0`, `reading_order=27`, and `pdf_ua_compliance=79`.
- Row `11` repeated at `59/F`, with `heading_structure=0`, `reading_order=80`, and no table/alt deficit.
- Row `13` improved from full-run `52/F` to `71/C` but still had mixed table, alt, PDF/UA, and reading-order residuals.
- Rows `14`, `15`, and `20` repeated at `69/D`, with table markup `0` and table/header tools rejected by `pdfua.table.header_association_present`.
- Row `16` repeated at `85/B`, matching the OCR dashboard plateau.
- Focus p95/max runtime: `290587ms / 290587ms`

## Failure Shape

The Missouri source fails the requested 93+ mean/median target and does not expose a small safe production fix.

The main blockers are:

- Runtime/analyzer tail: row `09` hard-timed out in the full run and returned only `56/F` near the wall in focus.
- Deep native-tagged zero-heading shells: row `11` repeats at `59/F` with heading `0` and otherwise high PDF/UA/reading evidence.
- Table/header transaction debt: rows `14`, `15`, and `20` repeat at `69/D`, with `normalize_table_structure` and `repair_native_table_headers` rejected by `pdfua.table.header_association_present`.
- Mixed table/alt/reading/PDF-UA debt: row `13` moves variably but remains far below target.
- OCR dashboard plateau: rows `16` and `17` reach `85/B`; re-OCR and parent-link attempts are rejected because they would regress score.

## Decision

No source behavior change is accepted from this holdout.

The failures reinforce parked general lanes already seen across public sources: bounded timeout/checkpoint recovery, deep native-tagged marked-content shell heading recovery, OCR post-pass cleanup, and real table/header transactions that reduce final header-association debt. A source/year/PDF-specific patch or PAC relaxation would violate the current goal.

No original-50 regression run was required because no source change was accepted.

## Cleanup

Deleted after metrics extraction:

- `Input/missouri_mshp_sac_holdout_2026_05_18`
- `Input/missouri_mshp_sac_focus_2026_05_18`
- `/mnt/pdf-review/pdfaf-validation/missouri-mshp-sac-holdout-2026-05-18-r1`
- `/mnt/pdf-review/pdfaf-validation/missouri-mshp-sac-focus-2026-05-18-r1`
