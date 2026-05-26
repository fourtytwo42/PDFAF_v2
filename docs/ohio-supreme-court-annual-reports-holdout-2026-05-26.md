# Ohio Supreme Court Annual Reports Holdout - 2026-05-26

## Source

- Source family: Supreme Court of Ohio annual reports.
- Reports and publications index: `https://www.supremecourt.ohio.gov/courts/judicial-system/supreme-court-of-ohio/reports-publications/`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/ohio-supreme-court-annual-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The sample walked official annual-report PDF links in descending year order and skipped candidates that exceeded the 10 MiB capped download guard.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/ohio-supreme-court-annual-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/ohio-supreme-court-annual-reports-2026-05-26/run-r1 \
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
| Mean before | 32.95 |
| Mean after | 89.15 |
| Median after | 92.5 |
| Grades after | 13 A / 5 B / 0 C / 0 D / 2 F |
| Rows below 93 | 10 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 33,213 ms |
| Runtime p95 | 106,136 ms |
| Runtime max | 139,859 ms |

Rows below 93:

| Row | Baseline after | Runtime | Primary residual |
| --- | ---: | ---: | --- |
| `ohscor-01.pdf` | 91/A | 40,284 ms | Heading/bookmark near miss |
| `ohscor-04.pdf` | 59/F | 30,959 ms | Zero-heading row; volatile on repeat |
| `ohscor-06.pdf` | 88/B | 139,859 ms | Stable reading/link-order residual |
| `ohscor-07.pdf` | 89/B | 91,616 ms | Stable reading/link-order residual |
| `ohscor-08.pdf` | 90/A | 61,659 ms | Stable reading/link-order near miss |
| `ohscor-09.pdf` | 89/B | 67,905 ms | Stable reading/link-order residual |
| `ohscor-11.pdf` | 89/B | 59,200 ms | Stable reading/link-order residual |
| `ohscor-13.pdf` | 59/F | 21,114 ms | Stable zero-heading row |
| `ohscor-16.pdf` | 92/A | 39,048 ms | Heading near miss; volatile on repeat |
| `ohscor-17.pdf` | 89/B | 93,239 ms | Reading/bookmark near miss; volatile on repeat |

## Sample

The 20 valid under-10MiB PDFs downloaded from Supreme Court of Ohio annual-report URLs were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `ohscor-01` | 2023 Annual Report | 9,742,550 |
| `ohscor-02` | 2022 Annual Report | 4,112,919 |
| `ohscor-03` | 2021 Annual Report | 4,233,216 |
| `ohscor-04` | 2020 Annual Report | 7,146,283 |
| `ohscor-05` | 2018 Annual Report | 5,974,132 |
| `ohscor-06` | 2017 Annual Report | 2,699,529 |
| `ohscor-07` | 2016 Annual Report | 1,466,313 |
| `ohscor-08` | 2015 Annual Report | 2,449,272 |
| `ohscor-09` | 2014 Annual Report | 1,994,716 |
| `ohscor-10` | 2013 Annual Report | 1,718,195 |
| `ohscor-11` | 2012 Annual Report | 2,019,257 |
| `ohscor-12` | 2011 Annual Report | 9,407,268 |
| `ohscor-13` | 2010 Annual Report | 4,931,395 |
| `ohscor-14` | 2009 Annual Report | 2,717,380 |
| `ohscor-15` | 2008 Annual Report | 3,892,420 |
| `ohscor-16` | 2005 Annual Report | 7,175,146 |
| `ohscor-17` | 2004 Annual Report | 7,871,806 |
| `ohscor-18` | 2003 Annual Report | 3,035,110 |
| `ohscor-19` | 2002 Annual Report | 2,413,699 |
| `ohscor-20` | 2001 Annual Report | 3,141,053 |

Skipped by the 10MiB capped download guard:

| Candidate | Reason |
| --- | --- |
| 2024 Annual Report | `curl_failed_63` |
| 2019 Annual Report | `curl_failed_63` |
| 2007 Annual Report | `curl_failed_63` |
| 2006 Annual Report | `curl_failed_63` |

`curl_failed_63` is the capped download failure from `curl --max-filesize 10485760`.

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/ohio-supreme-court-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/ohio-supreme-court-annual-reports-2026-05-26/low-row-diagnostic-r1
```

Decision: `no_safe_low_row_lane`

Recommended lane: `reading_link_order_candidate`

Raw points needed for mean 93: `77`

Lane split:

| Lane | Rows | Raw points |
| --- | ---: | ---: |
| `no_safe_predicate` | 2 | 68 |
| `near_miss_monitor` | 7 | 22 |
| `reading_link_order_candidate` | 1 | 5 |

Reading-order shell diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/ohio-supreme-court-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/ohio-supreme-court-annual-reports-2026-05-26/reading-order-shell-diagnostic-r1
```

Result: `0` sequence candidates, `0` safe route controls, `0` final orphan-debt rows, and `0` selected rows. No degenerate native reading-order shell attempts were visible for the low rows.

Visible-title/heading-anchor diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-visible-title-anchor-diagnostic.ts \
  --all-input /mnt/pdf-review/public-holdouts/ohio-supreme-court-annual-reports-2026-05-26/visible-title-input.json \
  --input-root /mnt/pdf-review/public-holdouts/ohio-supreme-court-annual-reports-2026-05-26/input \
  --out /mnt/pdf-review/public-holdouts/ohio-supreme-court-annual-reports-2026-05-26/visible-title-anchor-r1 \
  --file ohscor-04 \
  --file ohscor-13
```

Result: both hard-low rows classified as `not_zero_heading_native_gap`, so this diagnostic did not support heading-anchor behavior promotion.

Figure/alt diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-figure-alt-no-gain-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/ohio-supreme-court-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/ohio-supreme-court-annual-reports-2026-05-26/figure-alt-no-gain-r1 \
  --include-high-alt
```

Decision: `keep_figure_alt_diagnostic_only`; `0` scoring candidates and `0` behavior candidates.

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/ohio-supreme-court-annual-reports-2026-05-26/low-repeat-input \
  /mnt/pdf-review/public-holdouts/ohio-supreme-court-annual-reports-2026-05-26/run-low-repeat-r1 \
  --limit 10 \
  --cleanup-row-artifacts
```

Repeat result:

| Row | Baseline after | Repeat after | Repeat runtime |
| --- | ---: | ---: | ---: |
| `ohscor-01.pdf` | 91/A | 91/A | 41,301 ms |
| `ohscor-04.pdf` | 59/F | 93/A | 23,598 ms |
| `ohscor-06.pdf` | 88/B | 88/B | 105,859 ms |
| `ohscor-07.pdf` | 89/B | 89/B | 91,794 ms |
| `ohscor-08.pdf` | 90/A | 90/A | 62,533 ms |
| `ohscor-09.pdf` | 89/B | 89/B | 68,729 ms |
| `ohscor-11.pdf` | 89/B | 89/B | 58,550 ms |
| `ohscor-13.pdf` | 59/F | 59/F | 20,432 ms |
| `ohscor-16.pdf` | 92/A | 97/A | 32,044 ms |
| `ohscor-17.pdf` | 89/B | 97/A | 63,325 ms |

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source missed the 93 mean target, but the largest remaining gap was not supported by a safe general predicate.
- One hard-low row recovered on repeat, while the other hard-low row stayed at `59/F`; the heading-anchor diagnostic did not identify a safe visible-title/native-heading lane.
- The stable reading/link-order cluster was real but low-upside by itself, and the reading-order shell diagnostic found no sequence candidate or selected row.
- Figure/alt diagnostics found no behavior or scoring candidates.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
