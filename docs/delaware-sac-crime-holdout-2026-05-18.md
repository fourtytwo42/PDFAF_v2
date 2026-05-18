# Delaware SAC Crime Holdout

Date: 2026-05-18

Source: Delaware Statistical Analysis Center crime publications page, `https://sac.delaware.gov/crime/`.

Decision: failed the public-source target on accepted code. No remediation behavior change was made.

## Sample

Twenty public PDFs under 10 MB were sampled from the first direct PDF links on the Delaware SAC crime page:

| Row | PDF |
| --- | --- |
| 01 | `Crime in Delaware 2020-2024` |
| 02 | `Crime in Delaware 2020-2024 Executive Brief` |
| 03 | `Crime in Delaware 2020-2024 Wilmington Supplement` |
| 04 | `Crime in Delaware 2019-2023` |
| 05 | `Crime in Delaware 2019-2023 Executive Brief` |
| 06 | `Crime in Delaware 2019-2023 Wilmington Supplement` |
| 07 | `Crime in Delaware 2018-2022` |
| 08 | `Crime in Delaware 2018-2022 Executive Brief` |
| 09 | `Crime in Delaware 2018-2022 Wilmington Supplement` |
| 10 | `Crime in Delaware 2017-2021` |
| 11 | `Crime in Delaware 2017-2021 Executive Brief` |
| 12 | `Crime in Delaware 2017-2021 Wilmington Supplement` |
| 13 | `Crime in Delaware 2017-2021 Mapping Report` |
| 14 | `Crime in Delaware 2016-2020` |
| 15 | `Crime in Delaware 2016-2020 Executive Brief` |
| 16 | `Crime in Delaware 2016-2020 Wilmington Supplement` |
| 17 | `Crime in Delaware 2016-2020 Mapping Report` |
| 18 | `Fact Sheet Aggravated Assault 2020` |
| 19 | `Fact Sheet Burglary 2020` |
| 20 | `Fact Sheet Drug 2020` |

All downloaded files were between `0.30 MB` and `7.70 MB`.

## Run

Temporary input:

```text
Input/delaware_sac_crime_holdout_2026_05_18
```

Temporary output:

```text
/mnt/pdf-review/pdfaf-validation/delaware-sac-crime-holdout-2026-05-18-r1
```

Command:

```bash
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= \
PDFAF_CHECK_ANALYSIS_TIMEOUT_MS=15000 REQUEST_TIMEOUT_ANALYZE_MS=15000 \
PDFAF_REMEDIATION_PDF_TIMEOUT_MS=300000 REQUEST_TIMEOUT_REMEDIATE_MS=300000 \
timeout 3000s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/delaware_sac_crime_holdout_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/delaware-sac-crime-holdout-2026-05-18-r1 \
  --no-semantic --no-pdfs
```

The first main report emitted analyzer/bridge warnings before recording as a hard timeout:

```text
[analyzer] pdfjs failed for 01-de-sac-crime-in-delaware-2020-2024.pdf: pdfjs extraction aborted
[bridge] python script produced no output (exit null)
```

## Results

- processed: `20/20`
- mean: `57.55 -> 81.90`
- completed-row mean after remediation: `86.21`
- median: `59 -> 90`
- rows below `93`: `12`
- rows below `95`: `14`
- hard errors: `1`
- `false_positive_applied=0`
- p95/max runtime: `300003ms / 300048ms`

Rows:

| Row | Before | After | Runtime | Error |
| --- | ---: | ---: | ---: | --- |
| 01 | 56/F | 0/? | 300.0s | `per_pdf_timeout_300000ms` |
| 02 | 59/F | 95/A | 19.7s |  |
| 03 | 59/F | 95/A | 79.7s |  |
| 04 | 50/F | 53/F | 300.0s |  |
| 05 | 59/F | 95/A | 19.2s |  |
| 06 | 59/F | 95/A | 82.7s |  |
| 07 | 50/F | 69/D | 285.3s |  |
| 08 | 59/F | 87/B | 29.9s |  |
| 09 | 59/F | 86/B | 122.2s |  |
| 10 | 50/F | 69/D | 285.6s |  |
| 11 | 69/D | 88/B | 25.0s |  |
| 12 | 59/F | 86/B | 126.2s |  |
| 13 | 59/F | 94/A | 21.7s |  |
| 14 | 50/F | 69/D | 277.6s |  |
| 15 | 59/F | 95/A | 26.6s |  |
| 16 | 59/F | 90/A | 114.6s |  |
| 17 | 59/F | 97/A | 19.7s |  |
| 18 | 59/F | 93/A | 13.4s |  |
| 19 | 59/F | 90/A | 19.4s |  |
| 20 | 59/F | 92/A | 18.7s |  |

## Failure Shape

This source is a clear fail against the requested `93+` mean/median target.

The main multi-year reports are the dominant blockers:

- row `01` hard-times out at the five-minute wall
- row `04` finishes at `53/F` with `heading_structure=35`, `alt_text=0`, `table_markup=0`, and table/header PAC rejection
- rows `07`, `10`, and `14` finish at `69/D` with `heading_structure=100`, `alt_text=100`, but `table_markup=0` and low PDF/UA
- table tools either no-effect or reject on `pdfua.table.header_association_present`

The executive briefs, Wilmington supplements, and fact sheets mostly recover but expose near-miss residuals:

- rows `08`, `09`, `11`, `12`, `16`, `19`, and `20` land between `86` and `92`
- Stage 180-style header regularization fires on some supplement rows but does not clear enough table/PDF-UA debt
- near-miss fact sheets have link/PDF-UA/heading residuals around the same shape as other public fact-sheet sets

This set reinforces the same general lanes already seen in Washington, Maryland, Utah, California, Oregon, Michigan, and the public table transaction probe:

- bounded runtime/checkpoint work for long annual reports that reach the wall
- a real general table/header transaction that reduces final `pdfua.table.header_association_present` debt
- smaller near-miss cleanup for fact-sheet/link/PDF-UA residuals only after broad table/runtime blockers are stable

## Decision

No source change was made. The tempting shortcut would be to widen Stage 180 admission or accept table normalization despite unresolved PAC table debt, but this source shows that existing table normalization still fails to produce a 93+ source result and can remain runtime-heavy.

Any accepted Delaware improvement must be general, must target structural/PAC evidence rather than Delaware/source/year names, and must pass original-50 quality and speed validation before being considered positive.

## Cleanup

The downloaded public PDFs and generated benchmark artifact were deleted after metrics extraction. This document is the durable source-tracked record.
