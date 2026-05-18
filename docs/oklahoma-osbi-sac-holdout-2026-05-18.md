# Oklahoma OSBI SAC Outside-Corpus Holdout

Date: 2026-05-18

## Scope

This outside-corpus check uses public PDFs from the Oklahoma State Bureau of Investigation Statistical Analysis Center publications page.

Source page: https://www.oklahoma.gov/osbi/publications/statistical-analysis-center-publications1.html

Local input set:

`Input/oklahoma_osbi_sac_holdout_2026_05_18/`

The folder contained 20 public SAC PDFs from community sentencing, use-of-force, selected findings, and grant-funded report categories. Every selected PDF was below 10 MB; the full sample was about 16.8 MB, with a largest file of about 3.0 MB.

PDFs and generated artifacts are temporary local benchmark inputs and must not be committed.

## Run

Command:

```sh
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= \
  timeout 3600s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/oklahoma_osbi_sac_holdout_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/oklahoma-osbi-sac-holdout-2026-05-18-r1 \
  --no-semantic --no-pdfs
```

Artifact:

`/mnt/pdf-review/pdfaf-validation/oklahoma-osbi-sac-holdout-2026-05-18-r1/baseline_report.json`

## Summary

- PDFs processed: 20/20
- Mean: 55.10 -> 93.70
- Median: 57 -> 95
- Rows below 93: 4
- Rows below 95: 8
- Errors: 0
- `false_positive_applied`: 0
- Total deterministic runtime: 694,680 ms
- p95 runtime: 134,510 ms
- Max runtime: 155,018 ms

The accepted engine clears the requested 93+ mean/median threshold for this Oklahoma OSBI SAC sample without semantic remediation and without any behavior change.

## Row Results

| File | Before | After | Duration ms |
|---|---:|---:|---:|
| `01-ok-osbi-community-sentencing-2024.pdf` | 71/C | 78/C | 76,582 |
| `02-ok-osbi-community-sentencing-2023.pdf` | 71/C | 95/A | 60,470 |
| `03-ok-osbi-community-sentencing-2022.pdf` | 59/F | 83/B | 155,018 |
| `04-ok-osbi-community-sentencing-2021.pdf` | 46/F | 97/A | 52,918 |
| `05-ok-osbi-use-of-force-2022.pdf` | 59/F | 91/A | 18,743 |
| `06-ok-osbi-use-of-force-2021.pdf` | 59/F | 91/A | 19,839 |
| `07-ok-osbi-use-of-force-2020.pdf` | 44/F | 94/A | 16,185 |
| `08-ok-osbi-use-of-force-2019.pdf` | 54/F | 94/A | 14,422 |
| `09-ok-osbi-fatal-officer-involved-shootings-2018.pdf` | 59/F | 97/A | 9,825 |
| `10-ok-osbi-fatal-officer-involved-shootings-2015.pdf` | 59/F | 96/A | 16,575 |
| `11-ok-osbi-selected-findings-domestic-abuse-2024.pdf` | 52/F | 96/A | 16,282 |
| `12-ok-osbi-selected-findings-hate-crime-2024.pdf` | 53/F | 96/A | 10,422 |
| `13-ok-osbi-selected-findings-leoka-2024.pdf` | 51/F | 94/A | 12,005 |
| `14-ok-osbi-selected-findings-property-loss-2024.pdf` | 59/F | 98/A | 9,149 |
| `15-ok-osbi-selected-findings-domestic-abuse-2023.pdf` | 57/F | 96/A | 13,359 |
| `16-ok-osbi-selected-findings-hate-crime-2023.pdf` | 57/F | 96/A | 8,874 |
| `17-ok-osbi-selected-findings-leoka-2023.pdf` | 51/F | 94/A | 11,979 |
| `18-ok-osbi-selected-findings-property-loss-2023.pdf` | 59/F | 98/A | 7,873 |
| `19-ok-osbi-grant-funded-robbery-report.pdf` | 36/F | 95/A | 134,510 |
| `20-ok-osbi-grant-funded-sex-offenses-report.pdf` | 46/F | 95/A | 29,650 |

## Findings

1. The selected findings and grant-funded reports are well covered.

The selected-findings rows finish between `94` and `98`, and both grant-funded reports finish at `95/A`. The fatal officer-involved shooting rows also finish at `96` and `97`.

2. Community sentencing is the main residual family.

Rows `01` and `03` finish below `93`, at `78/C` and `83/B`. The residuals are mixed alt/table/PDF-UA issues:

| Row | Final | Main residual shape |
|---|---:|---|
| `01-ok-osbi-community-sentencing-2024.pdf` | 78/C | alt `20`, table `72`, PDF/UA `57`, strong headings/reading |
| `03-ok-osbi-community-sentencing-2022.pdf` | 83/B | heading `59`, alt `85`, table `68`, PDF/UA `71` |

The row timelines show existing table and structure tools hitting PAC or reading-order regressions. These rows do not justify a narrow source-specific fix, especially because the full source set already clears the mean/median target.

3. Runtime is bounded but not trivial.

The full deterministic run completed in about 11.6 minutes. The two slowest rows were `03` at about 155 seconds and `19` at about 135 seconds. There were no hard timeouts.

## Decision

No behavior change was made or accepted from this source set. Generated public PDFs and public-source benchmark artifacts are removed after extracting the source-tracked metrics above.
