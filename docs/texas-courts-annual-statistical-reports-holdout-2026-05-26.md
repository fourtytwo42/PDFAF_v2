# Texas Courts Annual Statistical Reports Holdout - 2026-05-26

## Source

- Source family: Texas Office of Court Administration annual statistical reports.
- Source index: `https://www.txcourts.gov/statistics/annual-statistical-reports/`
- Older reports index: `https://www.txcourts.gov/statistics/annual-statistical-reports/older-reports/`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/texas-courts-annual-statistical-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The direct annual-report archive yielded 16 under-cap full annual statistical report PDFs. Five direct annual-report candidates exceeded the 10 MiB capped-download guard. To complete a 20-row same-source sample, the remaining four rows use official archived statewide activity summary PDFs from the same Texas annual-statistical archive.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/texas-courts-annual-statistical-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/texas-courts-annual-statistical-reports-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Run mode:

- deterministic
- `--no-semantic`
- `--no-pdfs`
- single bounded holdout worker

Results:

| Metric | Value |
| --- | ---: |
| Processed | 20/20 |
| Completed without row error | 18/20 |
| Mean before | 33.75 |
| Mean after | 83.05 |
| Median after | 96.5 |
| Grades after | 16 A / 0 B / 0 C / 0 D / 4 F |
| Rows below 93 | 4 |
| Timeout/error rows | 2 |
| `false_positive_applied` | 0 |
| Runtime p50 | 30,679 ms |
| Runtime p95 | 300,038 ms |
| Runtime max | 300,062 ms |

Rows below 93:

| Row | Baseline after | Runtime | Primary residual |
| --- | ---: | ---: | --- |
| `txcourtsar-02.pdf` | 59/F | 284,802 ms | `heading_structure=0`, title/language and PDF/UA catalog debt already score-active |
| `txcourtsar-03.pdf` | 59/F | 296,561 ms | `heading_structure=0`, title/language and PDF/UA catalog debt already score-active |
| `txcourtsar-04.pdf` | 0/? | 300,062 ms | `per_pdf_timeout_300000ms` |
| `txcourtsar-06.pdf` | 0/? | 300,038 ms | `per_pdf_timeout_300000ms` |

## Sample

The 20 valid under-10MiB PDFs downloaded from Texas Courts annual statistical reports were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `txcourtsar-01` | FY 2023 | 1,214,661 |
| `txcourtsar-02` | FY 2022 | 7,548,336 |
| `txcourtsar-03` | FY 2021 | 9,410,007 |
| `txcourtsar-04` | FY 2020 | 4,232,935 |
| `txcourtsar-05` | 2018 | 1,462,219 |
| `txcourtsar-06` | 2015 | 9,499,516 |
| `txcourtsar-07` | 2013 | 7,282,841 |
| `txcourtsar-08` | 2012 | 5,456,622 |
| `txcourtsar-09` | 2011 | 3,522,890 |
| `txcourtsar-10` | 2010 | 1,513,113 |
| `txcourtsar-11` | 2009 | 1,585,911 |
| `txcourtsar-12` | 2008 | 933,595 |
| `txcourtsar-13` | 2007 | 2,275,425 |
| `txcourtsar-14` | 2006 | 2,534,278 |
| `txcourtsar-15` | 2005 | 2,511,701 |
| `txcourtsar-16` | 2004 | 1,292,398 |
| `txcourtsar-17` | 2003 statewide activity summary | 10,002 |
| `txcourtsar-18` | 2002 statewide activity summary | 9,862 |
| `txcourtsar-19` | 2001 statewide activity summary | 11,429 |
| `txcourtsar-20` | 2000 Texas court activity summary | 11,000 |

Skipped candidates:

| Title | Reason |
| --- | --- |
| FY 2024 | Capped download failed or exceeded 10 MiB |
| 2019 | Capped download failed or exceeded 10 MiB |
| 2017 | Capped download failed or exceeded 10 MiB |
| 2016 | Capped download failed or exceeded 10 MiB |
| 2014 | Capped download failed or exceeded 10 MiB |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/texas-courts-annual-statistical-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/texas-courts-annual-statistical-reports-2026-05-26/low-row-diagnostic-r1
```

Decision: `plan_high_impact_targeted_diagnostic`

Recommended lane: `metadata_pdfua_candidate`

Raw points needed for mean 93: `199`

Lane split:

| Lane | Rows | Raw points |
| --- | ---: | ---: |
| `timeout_or_error` | 2 | 186 |
| `metadata_pdfua_candidate` | 2 | 68 |

PDF/UA catalog/syntax diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/pdfua-catalog-syntax-diagnostic.ts \
  --pdf /mnt/pdf-review/public-holdouts/texas-courts-annual-statistical-reports-2026-05-26/input/txcourtsar-02.pdf \
  --pdf /mnt/pdf-review/public-holdouts/texas-courts-annual-statistical-reports-2026-05-26/input/txcourtsar-03.pdf \
  --pdf /mnt/pdf-review/public-holdouts/texas-courts-annual-statistical-reports-2026-05-26/input/txcourtsar-01.pdf \
  --pdf /mnt/pdf-review/public-holdouts/texas-courts-annual-statistical-reports-2026-05-26/input/txcourtsar-05.pdf \
  --pdf /mnt/pdf-review/public-holdouts/texas-courts-annual-statistical-reports-2026-05-26/input/txcourtsar-07.pdf \
  --out /mnt/pdf-review/public-holdouts/texas-courts-annual-statistical-reports-2026-05-26/pdfua-catalog-syntax-r1
```

Decision: `keep_pdfua_catalog_syntax_diagnostic_only`

The PDF/UA catalog settings are already score-active and the same baseline catalog debt shape appears on same-source controls, so this lane does not justify scoring or planner changes.

Reading-order shell diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/texas-courts-annual-statistical-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/texas-courts-annual-statistical-reports-2026-05-26/reading-order-shell-diagnostic-r1
```

Result: `0` sequence candidates, `0` safe route controls, and `0` recovered routes with final orphan debt.

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/texas-courts-annual-statistical-reports-2026-05-26/low-repeat-input \
  /mnt/pdf-review/public-holdouts/texas-courts-annual-statistical-reports-2026-05-26/run-low-repeat-r1 \
  --limit 2 \
  --cleanup-row-artifacts
```

Repeat result:

| Row | Baseline after | Repeat after | Repeat runtime |
| --- | ---: | ---: | ---: |
| `txcourtsar-02.pdf` | 59/F | 59/F | 287,315 ms |
| `txcourtsar-03.pdf` | 59/F | 59/F | 231,948 ms |

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The two completed low rows are stable `59/F` outcomes, but current diagnostics show zero-heading/PDF-UA debt without an object-backed safe heading/reading route.
- PDF/UA catalog debt is already score-active and not a safe scoring gap.
- Same-source controls also carry catalog baseline debt shapes, so broad catalog behavior would be risky.
- The largest score deficit is from two 300s row timeouts, which should be treated as runtime/analyzer debt rather than remediation breadth.
- `false_positive_applied=0`, and the bounded harness advanced cleanly through the timeout rows.

This source is useful evidence for future runtime-tail and zero-heading/object-target diagnostics, not for an immediate production remediation change.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
