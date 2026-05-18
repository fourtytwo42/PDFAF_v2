# California CJSC Outside-Corpus Holdout

Date: 2026-05-18

## Scope

This outside-corpus check uses public PDFs from the State of California Department of Justice, Criminal Justice Statistics Center publications page.

Source page: https://oag.ca.gov/cjsc/pubs

Local input set:

`Input/california_cjsc_holdout_2026_05_18/`

The folder contained 20 public PDFs across Crime in California, Hate Crime in California, Homicide in California, Juvenile Justice in California, and Use of Force reports for 2021-2024. Every PDF had an HTTP `Content-Length` below 10 MB; the full sample was about 71.3 MB. PDFs and generated artifacts are temporary local benchmark inputs and must not be committed.

## Run

Command:

```sh
PDFAF_RUN_LOCAL_LLM=0 OPENAI_COMPAT_BASE_URL= \
  timeout 5400s npx -y node@22 /usr/bin/pnpm exec tsx scripts/baseline-corpus-batch.ts \
  Input/california_cjsc_holdout_2026_05_18 \
  /mnt/pdf-review/pdfaf-validation/california-cjsc-holdout-2026-05-18-r1 \
  --no-semantic --no-pdfs
```

Artifact:

`/mnt/pdf-review/pdfaf-validation/california-cjsc-holdout-2026-05-18-r1/baseline_report.json`

## Summary

- PDFs processed: 20/20
- Mean: 54.55 -> 84.75
- Median: 59 -> 93.5
- Rows below 93: 9
- Rows below 95: 11
- Errors: 0
- `false_positive_applied`: 0
- Total deterministic runtime: 1,446,700 ms
- p95 runtime: 144,845 ms
- Max runtime: 196,206 ms

This set does not meet the requested 93+ mean target on accepted code. Median is above 93, but the mean is pulled down by repeatable table/PDF-UA residuals on 2023 and 2021 templates.

## Row Results

| File | Before | After | Duration ms |
|---|---:|---:|---:|
| `01-ca-cjsc-crime-in-california-2024.pdf` | 59/F | 96/A | 19,851 |
| `02-ca-cjsc-hate-crime-2024.pdf` | 59/F | 96/A | 16,304 |
| `03-ca-cjsc-homicide-2024.pdf` | 59/F | 96/A | 14,774 |
| `04-ca-cjsc-juvenile-justice-2024.pdf` | 59/F | 94/A | 47,640 |
| `05-ca-cjsc-use-of-force-2024.pdf` | 59/F | 96/A | 25,452 |
| `06-ca-cjsc-crime-in-california-2023.pdf` | 68/D | 69/D | 196,206 |
| `07-ca-cjsc-hate-crime-2023.pdf` | 69/D | 69/D | 144,845 |
| `08-ca-cjsc-homicide-2023.pdf` | 69/D | 69/D | 75,656 |
| `09-ca-cjsc-juvenile-justice-2023.pdf` | 89/B | 92/A | 122,401 |
| `10-ca-cjsc-use-of-force-2023.pdf` | 67/D | 69/D | 127,001 |
| `11-ca-cjsc-crime-in-california-2022.pdf` | 28/F | 96/A | 31,045 |
| `12-ca-cjsc-hate-crime-2022.pdf` | 29/F | 96/A | 20,052 |
| `13-ca-cjsc-homicide-2022.pdf` | 28/F | 96/A | 25,380 |
| `14-ca-cjsc-juvenile-justice-2022.pdf` | 28/F | 96/A | 77,321 |
| `15-ca-cjsc-use-of-force-2022.pdf` | 28/F | 96/A | 31,202 |
| `16-ca-cjsc-crime-in-california-2021.pdf` | 68/D | 69/D | 133,804 |
| `17-ca-cjsc-hate-crime-2021.pdf` | 34/F | 93/A | 17,620 |
| `18-ca-cjsc-homicide-2021.pdf` | 64/D | 69/D | 116,663 |
| `19-ca-cjsc-juvenile-justice-2021.pdf` | 59/F | 69/D | 83,640 |
| `20-ca-cjsc-use-of-force-2021.pdf` | 68/D | 69/D | 119,843 |

## Findings

1. Current 2024 and 2022 CJSC templates are already handled.

Rows `01`-`05` and `11`-`15` finish at A grade, generally between `94` and `96`, using deterministic remediation only. The 2021 Hate Crime row also reaches `93/A`.

2. The main residual is a large-table/header/PDF-UA shape.

Rows `06`, `07`, `08`, `10`, `16`, `18`, `19`, and `20` plateau at `69/D`. Their final category shape is mostly strong alt text and headings, with table markup and PDF/UA compliance still low:

| Row | Final | Heading | Alt | Table | PDF/UA | Reading | Link |
|---|---:|---:|---:|---:|---:|---:|---:|
| `06` | 69/D | 97 | 100 | 0 | 71 | 80 | 79 |
| `07` | 69/D | 96 | 100 | 35 | 71 | 88 | 50 |
| `08` | 69/D | 79 | 100 | 5 | 79 | 86 | 79 |
| `10` | 69/D | 79 | 100 | 0 | 71 | 88 | 50 |
| `16` | 69/D | 96 | 100 | 0 | 71 | 80 | 79 |
| `18` | 69/D | 98 | 100 | 5 | 79 | 78 | 79 |
| `19` | 69/D | 97 | 100 | 0 | 79 | 86 | 79 |
| `20` | 69/D | 79 | 100 | 0 | 71 | 86 | 79 |

3. Existing table repairs see the right family but do not produce a safe accepted state.

The row timelines show repeated `normalize_table_structure`, `repair_native_table_headers`, and `set_table_header_cells` attempts. Most table tools are `no_effect`; later `normalize_table_structure` attempts are rejected by PAC gates such as `pdfua.table.header_association_present`, `pdfua.table.rows_regular`, or `pdfua.content.orphan_mcids_absent`.

A focused PDF-output diagnostic on rows `01`, `06`, `10`, `11`, `16`, and `20` confirmed that the low rows retain substantial table/header debt after remediation. Examples:

- Row `06` remediated state: about 150 tables, `62` irregular tables, `32` strongly irregular tables, `72` missing header-association tables, and `4178` data cells without headers.
- Row `10` source/remediated shape: strongly irregular table class with about 65 tables, `35` strongly irregular tables, and `2829` data cells without headers; link quality remains `50`, so the current Stage 180 table-only predicate correctly stays conservative.
- Row `16` remediated state: about 160 tables, `63` irregular tables, `32` strongly irregular tables, and `3841` data cells without headers.
- Row `20` remediated state: about 70 tables, `39` irregular tables, `32` strongly irregular tables, and `2656` data cells without headers.

The already accepted Stage 180 table/header regularization is intentionally bounded to avoid broad table sweeps. These California residuals exceed those bounded assumptions, so simply widening Stage 180 would be a runtime and PAC-regression risk rather than a proven general fix.

4. The broad table sequence probe is too expensive as currently written.

A diagnostic run of `scripts/all-input-table-structure-sequence-probe.ts` against focus rows `06` and `10` was stopped after more than ten minutes without completing the first row or writing a report. This matches the earlier all-input table-probe experience: broad replay is not the right next default path for this table family.

## Decision

No behavior change is accepted from this California source set.

The next useful lane is a focused general table transaction design for large native/tagged report tables with:

- large but bounded header-association debt,
- rowless-dense or strongly-irregular table evidence,
- no direct or misplaced cell shape,
- explicit preservation of orphan-MCID and header-association PAC invariants,
- target validation on California low rows,
- nearby controls such as California rows `01` and `11`,
- original-50 quality and speed validation before any commit.

Until that design exists, this source set should be treated as a durable outside-corpus gap rather than a reason to force a source/year/template-specific rule.
