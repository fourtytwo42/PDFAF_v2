# Tennessee TBI CJIS Outside-Corpus Holdout

Date: 2026-05-18

## Scope

This outside-corpus check uses public PDFs from the Tennessee Bureau of Investigation Criminal Justice Information Services recent publications page and historical TBI-hosted report links.

Source page: https://www.tn.gov/tbi/divisions/cjis-division/recent-publications.html

Local input set:

`Input/tennessee_tbi_cjis_holdout_2026_05_18/`

The folder contained 20 public TBI report PDFs from Domestic Violence, Crime on Campus, Law Enforcement-Related Deaths, School Crime, Use of Force, Hate Crime, and LEOKA report families for 2022-2024. Every selected PDF was below 10 MB; the full sample was about 25.0 MB, with a largest file of about 6.7 MB. Larger Crime in Tennessee annual PDFs were not included because they exceeded the 10 MB cap.

PDFs and generated artifacts are temporary local benchmark inputs and must not be committed.

## Run

Command:

```sh
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= \
  timeout 3600s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/tennessee_tbi_cjis_holdout_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/tennessee-tbi-cjis-holdout-2026-05-18-r1 \
  --no-semantic --no-pdfs
```

Artifact:

`/mnt/pdf-review/pdfaf-validation/tennessee-tbi-cjis-holdout-2026-05-18-r1/baseline_report.json`

## Summary

- PDFs processed: 20/20
- Mean: 50.30 -> 93.10
- Median: 54 -> 94.5
- Rows below 93: 4
- Rows below 95: 10
- Errors: 0
- `false_positive_applied`: 0
- Total deterministic runtime: 510,282 ms
- p95 runtime: 69,637 ms
- Max runtime: 69,703 ms

The accepted engine clears the requested 93+ mean/median threshold for this Tennessee TBI sample without semantic remediation and without any behavior change.

## Row Results

| File | Before | After | Duration ms |
|---|---:|---:|---:|
| `01-tn-tbi-domestic-violence-2024.pdf` | 54/F | 96/A | 12,853 |
| `02-tn-tbi-crime-on-campus-2024.pdf` | 41/F | 93/A | 69,703 |
| `03-tn-tbi-law-enforcement-related-deaths-2024.pdf` | 41/F | 97/A | 17,518 |
| `04-tn-tbi-school-crime-2024.pdf` | 54/F | 96/A | 11,857 |
| `05-tn-tbi-use-of-force-2024.pdf` | 49/F | 95/A | 14,716 |
| `06-tn-tbi-hate-crime-2024.pdf` | 46/F | 97/A | 16,325 |
| `07-tn-tbi-leoka-2024.pdf` | 54/F | 96/A | 11,570 |
| `08-tn-tbi-domestic-violence-2023.pdf` | 54/F | 94/A | 16,451 |
| `09-tn-tbi-crime-on-campus-2023.pdf` | 38/F | 91/A | 69,637 |
| `10-tn-tbi-law-enforcement-related-deaths-2023.pdf` | 41/F | 97/A | 23,397 |
| `11-tn-tbi-school-crime-2023.pdf` | 54/F | 94/A | 14,173 |
| `12-tn-tbi-use-of-force-2023.pdf` | 54/F | 95/A | 15,101 |
| `13-tn-tbi-hate-crime-2023.pdf` | 46/F | 90/A | 42,748 |
| `14-tn-tbi-leoka-2023.pdf` | 57/F | 95/A | 14,459 |
| `15-tn-tbi-domestic-violence-2022.pdf` | 54/F | 94/A | 15,923 |
| `16-tn-tbi-crime-on-campus-2022.pdf` | 56/F | 93/A | 51,620 |
| `17-tn-tbi-school-crime-2022.pdf` | 64/D | 91/A | 24,275 |
| `18-tn-tbi-use-of-force-2022.pdf` | 54/F | 95/A | 14,323 |
| `19-tn-tbi-hate-crime-2022.pdf` | 46/F | 69/D | 39,294 |
| `20-tn-tbi-leoka-2022.pdf` | 49/F | 94/A | 14,339 |

## Findings

1. This public source is mostly covered.

Sixteen of twenty rows finish at or above `93`, and twelve finish at or above `95`. The newest 2024 rows are especially strong: all seven selected 2024 PDFs finish between `93` and `97`.

2. Runtime is bounded.

The full deterministic run finished in about 8.5 minutes. The slowest two rows are the 2024 and 2023 Crime on Campus reports, both around 70 seconds. There are no hard timeouts.

3. Residuals are mostly table/PDF-UA cleanup, not missing broad remediation.

Rows below `93`:

| Row | Final | Main residual shape |
|---|---:|---|
| `09-tn-tbi-crime-on-campus-2023.pdf` | 91/A | table `70`, PDF/UA `67`, reading `80` |
| `13-tn-tbi-hate-crime-2023.pdf` | 90/A | table `44`, PDF/UA `71`; Stage 180 header regularization improves the row but not to 93 |
| `17-tn-tbi-school-crime-2022.pdf` | 91/A | heading `75`, table `79`; later table normalization is PAC-rejected |
| `19-tn-tbi-hate-crime-2022.pdf` | 69/D | table `16`, PDF/UA `71`; Stage 180 header regularization applies but has no score gain |

The lowest row reinforces the same general table/header/PDF-UA residual family seen in Virginia and California, but the source set already clears the requested threshold. There is not enough evidence here to justify a new behavior change without a more focused general large-table transaction design and original-50 validation.

## Decision

No behavior change was made or accepted from this source set. Generated public PDFs and public-source benchmark artifacts are removed after extracting the source-tracked metrics above.
