# Colorado ORS PPP Outside-Corpus Holdout

Date: 2026-05-18

## Scope

This is a second outside-corpus check against public PDFs from the Colorado Division of Criminal Justice, Office of Research and Statistics (ORS), a state Statistical Analysis Center-style source.

Source page: https://dcj.colorado.gov/dcj-offices/ors/doc-rpt

PDF host: https://cdpsdocs.state.co.us/ors/data/PPP/

Local input set:

`Input/colorado_ors_ppp_holdout_2026_05_18/`

The folder contained 20 public correctional population forecast PDFs. Every PDF had an HTTP `Content-Length` below 10 MB. PDFs and generated artifacts are local benchmark inputs and must not be committed.

## Run

Command:

```sh
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= \
  timeout 3600s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/colorado_ors_ppp_holdout_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/colorado-ors-ppp-holdout-2026-05-18-r2 \
  --no-semantic --no-pdfs
```

Artifact:

`/mnt/pdf-review/pdfaf-validation/colorado-ors-ppp-holdout-2026-05-18-r2/baseline_report.json`

## Summary

- PDFs processed: 20/20
- Mean: 63.85 -> 90.80
- Median: 63 -> 94
- Rows below 93: 5
- Rows below 95: 13
- Errors: 0
- `false_positive_applied`: 0
- Total deterministic runtime: 1,849,871 ms
- p95 runtime: 173,290 ms
- Max runtime: 207,565 ms

The engine performs well on most current Colorado ORS forecast PDFs, but this first run did not meet the 93+ mean/median holdout target on accepted code.

## Row Results

| File | Before | After | Duration ms |
|---|---:|---:|---:|
| `01-co-ors-ppp-2025.pdf` | 92/A | 97/A | 83,199 |
| `02-co-ors-ppp-2025-interim.pdf` | 94/A | 96/A | 8,861 |
| `03-co-ors-ppp-2024.pdf` | 59/F | 92/A | 207,565 |
| `04-co-ors-ppp-2024-interim.pdf` | 96/A | 96/A | 6,166 |
| `05-co-ors-ppp-2023.pdf` | 59/F | 94/A | 118,198 |
| `06-co-ors-ppp-2023-interim.pdf` | 91/A | 94/A | 9,906 |
| `07-co-ors-ppp-2022.pdf` | 66/D | 94/A | 108,003 |
| `08-co-ors-ppp-2022-interim.pdf` | 59/F | 93/A | 13,165 |
| `09-co-ors-ppp-2021.pdf` | 62/D | 95/A | 86,964 |
| `10-co-ors-ppp-2020.pdf` | 59/F | 95/A | 89,201 |
| `11-co-ors-ppp-2019.pdf` | 34/F | 93/A | 52,591 |
| `12-co-ors-ppp-2018.pdf` | 59/F | 95/A | 94,811 |
| `13-co-ors-ppp-2017.pdf` | 42/F | 79/C | 37,138 |
| `14-co-ors-ppp-2016.pdf` | 42/F | 95/A | 34,286 |
| `15-co-ors-ppp-2015.pdf` | 66/D | 94/A | 128,733 |
| `16-co-ors-ppp-2014.pdf` | 66/D | 94/A | 133,975 |
| `17-co-ors-ppp-2013.pdf` | 66/D | 88/B | 145,966 |
| `18-co-ors-ppp-2012.pdf` | 66/D | 69/D | 152,748 |
| `19-co-ors-ppp-2011.pdf` | 35/F | 69/D | 165,105 |
| `20-co-ors-ppp-2009.pdf` | 64/D | 94/A | 173,290 |

## Findings

1. The newest ORS reports are mostly handled.

The 2025, 2025 interim, 2024 interim, 2023, 2023 interim, 2022, 2022 interim, 2021, 2020, 2019, 2018, 2016, 2015, 2014, and 2009 rows all finished at A grade. The strongest current-template rows finish between 93 and 97 without semantic remediation.

2. The older forecast template is the main residual.

Rows `18-co-ors-ppp-2012.pdf` and `19-co-ors-ppp-2011.pdf` both finish at 69/D after long runs. Rows `17-co-ors-ppp-2013.pdf` and `13-co-ors-ppp-2017.pdf` also remain below target. The row timelines show repeated structure, table, alt, annotation, and PDF/UA cleanup attempts, but the score plateaus rather than converging.

3. This reinforces the Virginia table-template debt.

Like the Virginia DCJS holdout, several lower rows start with table markup at 0 and heavy PDF/UA structure debt. The accepted engine can recover many such rows, but older table-heavy agency templates still have repeatable low-score residuals. The rejected Virginia table-sequence candidate should not be reintroduced from this evidence alone because it failed fixed-50 validation.

4. Runtime is material but bounded.

The full 20-PDF deterministic run completed under the one-hour shell guard. Total runtime was about 30.8 minutes. The slowest rows were `03` at 207.6 seconds and `20` at 173.3 seconds.

## Accepted Follow-up

A general Stage 180 table regularization follow-up was accepted from this source set. The change is not Colorado-specific: it applies only to native/tagged structured PDFs with low table markup, stable non-table categories, no direct/misplaced table shape, bounded table/header debt, and remaining irregular-row/header-association evidence. The post-pass runs a bounded same-handle header-association and irregular-table sequence so object references do not go stale between Python mutations.

Candidate command:

```sh
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= \
  timeout 3600s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/colorado_ors_ppp_holdout_2026_05_18_candidate \
  /mnt/pdf-review/pdfaf-validation/colorado-ors-ppp-stage180-candidate-2026-05-18-r1 \
  --no-semantic --no-pdfs
```

Candidate summary:

- PDFs processed: 20/20
- Mean: 63.70 -> 93.65
- Median: 63 -> 95
- Rows below 93: 4
- Rows below 95: 7
- Errors: 0
- `false_positive_applied`: 0
- Total deterministic runtime: 1,817,861 ms
- p95 runtime: 168,075 ms
- Max runtime: 200,375 ms

This moved the Colorado ORS PPP set above the requested 93 mean/median threshold while reducing total, p95, and max runtime versus the first Colorado run.

Largest accepted gains:

| File | First run | Candidate | Delta |
|---|---:|---:|---:|
| `18-co-ors-ppp-2012.pdf` | 69 | 95 | +26 |
| `19-co-ors-ppp-2011.pdf` | 69 | 88 | +19 |
| `17-co-ors-ppp-2013.pdf` | 88 | 92 | +4 |
| `20-co-ors-ppp-2009.pdf` | 94 | 94 | +0 |

The 2017 row remains the main low-score residual at `79/C`; it did not match the accepted table/header regularization shape and was not forced through a PDF-specific rule.

## Original-50 Check

The candidate was checked against the original 50-file corpus through a temporary flat symlink input directory:

```sh
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= \
  timeout 5400s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  /tmp/pdfaf-original50-flat-2026-05-18 \
  /mnt/pdf-review/pdfaf-validation/original50-stage180-candidate-2026-05-18-r1 \
  --no-semantic --no-pdfs
```

Validation summary:

- PDFs processed: 50/50
- Row mean including the known hard timeout: 91.92
- Completed-row report mean: 93.80
- Median: 94.5
- `false_positive_applied`: 0
- Errors: 1 known `structure-4438` `per_pdf_timeout_300000ms`
- Total deterministic runtime: 2,384,455 ms
- p95 runtime: 248,304 ms
- Max runtime: 300,021 ms

Stage 180 fired on one original-50 row, `font-4057`, where the accepted table regularization moved the row to `93/A`. The Stage 180 tool itself took about two seconds; the original-50 runtime tail remains dominated by pre-existing long/structure rows (`structure-4438`, `long-4516`, `long-4683`, `structure-4076`, and `long-4680`). This validation preserves mutation truth and does not show a Stage 180-specific speed regression, but it does not resolve the older original-50 runtime-tail debt.

## Decision

Accept the bounded Stage 180 table/header regularization follow-up. Generated public PDFs and public-source benchmark artifacts remain local only and are removed after extracting the source-tracked metrics above.
