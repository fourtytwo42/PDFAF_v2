# Arkansas ACIC Crime Statistics Public Holdout - 2026-05-18

## Source And Sample

- Source: Arkansas Department of Public Safety, Arkansas Crime Information Center crime statistics page
- Source page: https://dps.arkansas.gov/crime-info-support/arkansas-crime-information-center/crime-statistics/
- Sample rule: first 20 unique report-style PDF links that downloaded as PDFs and were under 10 MB.
- Exclusions: system-regulation and NIBRS-definition reference PDFs were skipped so the sample stayed on statistical reports; several agency-wide PDFs over 10 MB were also skipped.
- Local input directory: `Input/arkansas_acic_crime_stats_holdout_2026_05_18`
- Public PDFs were temporary holdout artifacts and were deleted after metrics extraction.

| row | file | size | URL |
| --- | --- | ---: | --- |
| 01 | `01-2025-FT-LEO-And-Civilian-Counts-.pdf` | 0.6 MB | https://dps.arkansas.gov/wp-content/uploads/2025-FT-LEO-And-Civilian-Counts-.pdf |
| 02 | `02-2024-Offense-By-Contributor.pdf` | 0.8 MB | https://dps.arkansas.gov/wp-content/uploads/2024-Offense-By-Contributor.pdf |
| 03 | `03-2024-Arrest-By-Contributor.pdf` | 1.1 MB | https://dps.arkansas.gov/wp-content/uploads/2024-Arrest-By-Contributor.pdf |
| 04 | `04-2024-Race-and-Sex-of-Persons-Arrested-State.pdf` | 0.7 MB | https://dps.arkansas.gov/wp-content/uploads/2024-Race-and-Sex-of-Persons-Arrested-State.pdf |
| 05 | `05-2024-Age-of-Persons-Arrested-State.pdf` | 0.7 MB | https://dps.arkansas.gov/wp-content/uploads/2024-Age-of-Persons-Arrested-State.pdf |
| 06 | `06-2024-Narcotic-Arrests-By-Contributor.pdf` | 0.7 MB | https://dps.arkansas.gov/wp-content/uploads/2024-Narcotic-Arrests-By-Contributor.pdf |
| 07 | `07-2024-Race-and-Sex-of-Persons-Arrested-with-Drugs_Narcotics-State.pdf` | 0.7 MB | https://dps.arkansas.gov/wp-content/uploads/2024-Race-and-Sex-of-Persons-Arrested-with-Drugs_Narcotics-State.pdf |
| 08 | `08-2024-Age-of-Persons-Arrested-with-Drugs_Narcotics-State.pdf` | 0.6 MB | https://dps.arkansas.gov/wp-content/uploads/2024-Age-of-Persons-Arrested-with-Drugs_Narcotics-State.pdf |
| 09 | `09-2023-Age-of-Persons-Arrested-With-Drug-Narcotics-STATE.pdf` | 0.1 MB | https://dps.arkansas.gov/wp-content/uploads/2023-Age-of-Persons-Arrested-With-Drug-Narcotics-STATE.pdf |
| 10 | `10-2023_Value-of-Property-Stolen-and-Recovered_State.pdf` | 0.1 MB | https://dps.arkansas.gov/wp-content/uploads/2023_Value-of-Property-Stolen-and-Recovered_State.pdf |
| 11 | `11-2024-Stolen-and-Recovered-Property.pdf` | 0.7 MB | https://dps.arkansas.gov/wp-content/uploads/2024-Stolen-and-Recovered-Property.pdf |
| 12 | `12-2023_Value-of-Property-Stolen-and-Recovered_All.pdf` | 8.8 MB | https://dps.arkansas.gov/wp-content/uploads/2023_Value-of-Property-Stolen-and-Recovered_All.pdf |
| 13 | `13-2024-Value-of-Property-Stolen-and-Recovered-State.pdf` | 0.7 MB | https://dps.arkansas.gov/wp-content/uploads/2024-Value-of-Property-Stolen-and-Recovered-State.pdf |
| 14 | `14-2024-Value-of-Property-Stolen-and-Recovered-Agency.pdf` | 4.1 MB | https://dps.arkansas.gov/wp-content/uploads/2024-Value-of-Property-Stolen-and-Recovered-Agency.pdf |
| 15 | `15-LEO-Civilian-Counts-Online-Website-2024.pdf` | 0.1 MB | https://dps.arkansas.gov/wp-content/uploads/LEO-Civilian-Counts-Online-Website-2024.pdf |
| 16 | `16-2023-Offense-By-Contributor.pdf` | 0.8 MB | https://dps.arkansas.gov/wp-content/uploads/2023-Offense-By-Contributor.pdf |
| 17 | `17-2023-Arrest-By-Contributor.pdf` | 1.1 MB | https://dps.arkansas.gov/wp-content/uploads/2023-Arrest-By-Contributor.pdf |
| 18 | `18-2023-Race-and-Sex-of-Persons-Arrested-STATE.pdf` | 0.7 MB | https://dps.arkansas.gov/wp-content/uploads/2023-Race-and-Sex-of-Persons-Arrested-STATE.pdf |
| 19 | `19-2023-Age-of-Persons-Arrested-STATE.pdf` | 0.7 MB | https://dps.arkansas.gov/wp-content/uploads/2023-Age-of-Persons-Arrested-STATE.pdf |
| 20 | `20-2023-Narcotic-Arrests-By-Contributor.pdf` | 0.7 MB | https://dps.arkansas.gov/wp-content/uploads/2023-Narcotic-Arrests-By-Contributor.pdf |

## Deterministic Holdout Run

Run artifact, local only:

`/mnt/pdf-review/pdfaf-validation/arkansas-acic-crime-stats-holdout-2026-05-18-r1/baseline_report.json`

Command:

```bash
PDFAF_RUN_LOCAL_LLM=0 \
OPENAI_COMPAT_BASE_URL= \
PDFAF_CHECK_ANALYSIS_TIMEOUT_MS=15000 \
REQUEST_TIMEOUT_ANALYZE_MS=15000 \
PDFAF_REMEDIATION_PDF_TIMEOUT_MS=300000 \
REQUEST_TIMEOUT_REMEDIATE_MS=300000 \
timeout 3000s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/arkansas_acic_crime_stats_holdout_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/arkansas-acic-crime-stats-holdout-2026-05-18-r1 \
  --no-semantic \
  --no-pdfs
```

Summary:

- Processed: `20/20`
- Mean: `34.70 -> 73.60`
- Median after remediation: `73`
- Rows below `93`: `10`
- Rows below `95`: `12`
- Minimum final score: `41`
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`
- p95/max runtime: `247785ms / 274057ms`

The run emitted repeated 45-second Python analysis timeout warnings on temporary repair-state PDFs, but every row returned a scored result under the outer batch timeout.

| row | file | before | final | delta | runtime |
| --- | --- | ---: | ---: | ---: | ---: |
| 01 | `01-2025-FT-LEO-And-Civilian-Counts-.pdf` | 34/F | 52/F | +18 | 12.3s |
| 02 | `02-2024-Offense-By-Contributor.pdf` | 34/F | 52/F | +18 | 13.4s |
| 03 | `03-2024-Arrest-By-Contributor.pdf` | 34/F | 52/F | +18 | 16.3s |
| 04 | `04-2024-Race-and-Sex-of-Persons-Arrested-State.pdf` | 34/F | 96/A | +62 | 112.5s |
| 05 | `05-2024-Age-of-Persons-Arrested-State.pdf` | 34/F | 99/A | +65 | 139.5s |
| 06 | `06-2024-Narcotic-Arrests-By-Contributor.pdf` | 34/F | 52/F | +18 | 11.9s |
| 07 | `07-2024-Race-and-Sex-of-Persons-Arrested-with-Drugs_Narcotics-State.pdf` | 34/F | 94/A | +60 | 7.2s |
| 08 | `08-2024-Age-of-Persons-Arrested-with-Drugs_Narcotics-State.pdf` | 34/F | 99/A | +65 | 6.2s |
| 09 | `09-2023-Age-of-Persons-Arrested-With-Drug-Narcotics-STATE.pdf` | 34/F | 99/A | +65 | 6.0s |
| 10 | `10-2023_Value-of-Property-Stolen-and-Recovered_State.pdf` | 48/F | 94/A | +46 | 10.6s |
| 11 | `11-2024-Stolen-and-Recovered-Property.pdf` | 34/F | 52/F | +18 | 10.9s |
| 12 | `12-2023_Value-of-Property-Stolen-and-Recovered_All.pdf` | 34/F | 41/F | +7 | 274.1s |
| 13 | `13-2024-Value-of-Property-Stolen-and-Recovered-State.pdf` | 34/F | 99/A | +65 | 6.0s |
| 14 | `14-2024-Value-of-Property-Stolen-and-Recovered-Agency.pdf` | 34/F | 52/F | +18 | 57.2s |
| 15 | `15-LEO-Civilian-Counts-Online-Website-2024.pdf` | 34/F | 95/A | +61 | 6.3s |
| 16 | `16-2023-Offense-By-Contributor.pdf` | 34/F | 51/F | +17 | 14.0s |
| 17 | `17-2023-Arrest-By-Contributor.pdf` | 34/F | 51/F | +17 | 17.0s |
| 18 | `18-2023-Race-and-Sex-of-Persons-Arrested-STATE.pdf` | 34/F | 96/A | +62 | 120.2s |
| 19 | `19-2023-Age-of-Persons-Arrested-STATE.pdf` | 34/F | 95/A | +61 | 247.8s |
| 20 | `20-2023-Narcotic-Arrests-By-Contributor.pdf` | 34/F | 51/F | +17 | 13.0s |

## Failure Shape

The low rows have a very consistent shape:

- `heading_structure=0`
- `reading_order=30`
- `title_language=100`
- `alt_text=100`
- `table_markup=100`
- `pdf_ua_compliance=100` on all low rows except row `12`, which remains `pdf_ua_compliance=20`

Representative tool outcomes:

- `synthesize_basic_structure_from_layout` returns `no_effect` with `existing_marked_content_blocks_without_promotable_structure`.
- `tag_native_text_blocks` returns `no_effect` with `existing_marked_content_blocks_without_promotable_bt_et;existing_marked_content_blocks_without_promotable_structure`.
- `normalize_annotation_tab_order` can expose `parityReadingOrder=30` but is rejected as externally incomplete.
- Later metadata/PDF-UA/bookmark/font post-pass tools do not create heading structure.

This is not a table/header or figure-alt issue. It matches the parked deep native-tagged marked-content shell family already seen in New Jersey and Minnesota: there is marked content and extractable text, but the current repair path does not find a safe promotable structure/heading transaction.

## Decision

No source behavior change is accepted from this holdout.

The source failure is high-impact, but the needed fix is not a quick predicate tweak. A candidate must be a general native-tagged marked-content shell transaction that can create or recover heading/reading structure from structural evidence while preserving false-positive truth and original-50 speed. Row/source/year/PDF-specific gates would violate the current goal, and accepting incomplete `normalize_annotation_tab_order` or no-effect native tagging would not be honest.

No original-50 regression run was required because no source change was accepted.

## Cleanup

Deleted after metrics extraction:

- `Input/arkansas_acic_crime_stats_holdout_2026_05_18`
- `/mnt/pdf-review/pdfaf-validation/arkansas-acic-crime-stats-holdout-2026-05-18-r1`
