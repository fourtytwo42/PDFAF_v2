# Delaware Judiciary Annual Reports Holdout - 2026-05-26

## Source

- Source family: Delaware Judiciary annual reports.
- Annual reports index: `https://courts.delaware.gov/aoc/annualreports.aspx`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/delaware-judiciary-annual-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The sample walked official annual-report `forms/download.aspx` links in descending year order and skipped candidates that failed the 10 MiB capped download guard.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/delaware-judiciary-annual-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/delaware-judiciary-annual-reports-2026-05-26/run-r1 \
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
| Mean before | 23.65 |
| Mean after | 79.65 |
| Median after | 94.5 |
| Grades after | 11 A / 0 B / 0 C / 0 D / 9 F |
| Rows below 93 | 9 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 18,824 ms |
| Runtime p95 | 45,438 ms |
| Runtime max | 66,262 ms |

Rows below 93:

| Row | Baseline after | Runtime | Primary residual |
| --- | ---: | ---: | --- |
| `decourtsar-02.pdf` | 59/F | 66,262 ms | Stable zero-heading/no-safe-predicate residual |
| `decourtsar-03.pdf` | 59/F | 27,856 ms | Stable zero-heading/no-safe-predicate residual |
| `decourtsar-04.pdf` | 59/F | 26,372 ms | Stable zero-heading/no-safe-predicate residual |
| `decourtsar-05.pdf` | 59/F | 23,148 ms | Stable zero-heading/no-safe-predicate residual |
| `decourtsar-06.pdf` | 59/F | 19,140 ms | Stable zero-heading/no-safe-predicate residual |
| `decourtsar-07.pdf` | 59/F | 29,652 ms | Stable zero-heading/no-safe-predicate residual |
| `decourtsar-08.pdf` | 59/F | 20,440 ms | Stable zero-heading/no-safe-predicate residual |
| `decourtsar-09.pdf` | 59/F | 20,482 ms | Stable zero-heading/no-safe-predicate residual |
| `decourtsar-11.pdf` | 59/F | 18,824 ms | Stable zero-heading/no-safe-predicate residual |

## Sample

The 20 valid under-10MiB PDFs downloaded from Delaware Judiciary annual-report URLs were:

| Row | Year | Title | Bytes |
| --- | --- | --- | ---: |
| `decourtsar-01` | 2016 | 2016 Annual Report and Statistical Report of the Delaware Judiciary | 5,318,287 |
| `decourtsar-02` | 2015 | 2015 Annual Report and Statistical Report of the Delaware Judiciary | 5,962,212 |
| `decourtsar-03` | 2014 | 2014 Annual Report and Statistical Report of the Delaware Judiciary | 4,104,339 |
| `decourtsar-04` | 2013 | 2013 Annual Report and Statistical Report of the Delaware Judiciary | 4,096,416 |
| `decourtsar-05` | 2009 | 2009 Annual Report and Statistical Report of the Delaware Judiciary | 3,768,551 |
| `decourtsar-06` | 2008 | 2008 Annual Report and Statistical Report of the Delaware Judiciary | 8,947,416 |
| `decourtsar-07` | 2007 | 2007 Annual Report and Statistical Report of the Delaware Judiciary | 3,934,097 |
| `decourtsar-08` | 2006 | 2006 Annual Report and Statistical Report of the Delaware Judiciary | 7,432,194 |
| `decourtsar-09` | 2005 | 2005 Annual Report and Statistical Report of the Delaware Judiciary | 2,106,427 |
| `decourtsar-10` | 2004 | 2004 Annual Report of the Delaware Judiciary | 1,434,020 |
| `decourtsar-11` | 2003 | 2003 Annual Report and Statistical Report of the Delaware Judiciary | 2,462,968 |
| `decourtsar-12` | 2002 | 2002 Annual Report of the Delaware Judiciary | 2,708,424 |
| `decourtsar-13` | 1998 | 1998 Annual Report of the Delaware Judiciary | 7,379,420 |
| `decourtsar-14` | 1996 | 1996 Annual Report of the Delaware Judiciary | 8,848,721 |
| `decourtsar-15` | 1990 | 1990 Annual Report of the Delaware Judiciary | 9,858,512 |
| `decourtsar-16` | 1988 | 1988 Annual Report of the Delaware Judiciary | 5,986,649 |
| `decourtsar-17` | 1987 | 1987 Annual Report of the Delaware Judiciary | 4,206,962 |
| `decourtsar-18` | 1986 | 1986 Annual Report of the Delaware Judiciary | 4,090,554 |
| `decourtsar-19` | 1985 | 1985 Annual Report of the Delaware Judiciary | 4,068,158 |
| `decourtsar-20` | 1984 | 1984 Annual Report of the Delaware Judiciary | 4,462,037 |

Skipped during the capped download pass:

| Candidate | Reason |
| --- | --- |
| 2025 Annual Report and Statistical Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 2024 Annual Report and Statistical Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 2023 Annual Report and Statistical Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 2022 Annual Report and Statistical Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 2021 Annual Report and Statistical Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 2020 Annual Report and Statistical Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 2019 Annual Report and Statistical Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 2018 Annual Report and Statistical Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 2017 Annual Report and Statistical Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 2012 Annual Report and Statistical Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 2011 Annual Report and Statistical Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 2010 Annual Report and Statistical Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 2001 Annual Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 2000 Annual Report and Statistical Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 1999 Annual Report and Statistical Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 1997 Annual Report and Statistical Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 1995 Annual Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 1994 Annual Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 1993 Annual Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 1992 Annual Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 1991 Annual Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |
| 1989 Annual Report of the Delaware Judiciary | Capped fetch failed or exceeded 10 MiB |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/delaware-judiciary-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/delaware-judiciary-annual-reports-2026-05-26/low-row-diagnostic-r1
```

Decision: `no_safe_low_row_lane`

Recommended lane: `none`

Raw points needed for mean 93: `267`

Lane split:

| Lane | Rows | Raw points |
| --- | ---: | ---: |
| `no_safe_predicate` | 9 | 306 |

Reading-order shell diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/delaware-judiciary-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/delaware-judiciary-annual-reports-2026-05-26/reading-order-shell-diagnostic-r1
```

Result: `0` sequence candidates, `0` safe route controls, `0` final orphan-debt rows, and `0` selected rows.

Visible-title/heading-anchor diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-visible-title-anchor-diagnostic.ts \
  --all-input /mnt/pdf-review/public-holdouts/delaware-judiciary-annual-reports-2026-05-26/visible-title-input.json \
  --input-root /mnt/pdf-review/public-holdouts/delaware-judiciary-annual-reports-2026-05-26/input \
  --out /mnt/pdf-review/public-holdouts/delaware-judiciary-annual-reports-2026-05-26/visible-title-anchor-r1 \
  --file decourtsar-02 \
  --file decourtsar-03 \
  --file decourtsar-04 \
  --file decourtsar-05 \
  --file decourtsar-06 \
  --file decourtsar-07 \
  --file decourtsar-08 \
  --file decourtsar-09 \
  --file decourtsar-11 \
  --file decourtsar-10 \
  --file decourtsar-12
```

Result: all nine hard-low rows classified as `not_zero_heading_native_gap`; the two same-source A controls classified as `no_visible_title_evidence`. No selected heading-anchor candidates were found.

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/delaware-judiciary-annual-reports-2026-05-26/low-repeat-input \
  /mnt/pdf-review/public-holdouts/delaware-judiciary-annual-reports-2026-05-26/run-low-repeat-r1 \
  --limit 9 \
  --cleanup-row-artifacts
```

Repeat result:

| Row | Baseline after | Repeat after | Repeat runtime |
| --- | ---: | ---: | ---: |
| `decourtsar-02.pdf` | 59/F | 59/F | 66,798 ms |
| `decourtsar-03.pdf` | 59/F | 59/F | 28,008 ms |
| `decourtsar-04.pdf` | 59/F | 59/F | 26,237 ms |
| `decourtsar-05.pdf` | 59/F | 59/F | 27,114 ms |
| `decourtsar-06.pdf` | 59/F | 59/F | 19,028 ms |
| `decourtsar-07.pdf` | 59/F | 59/F | 26,731 ms |
| `decourtsar-08.pdf` | 59/F | 59/F | 20,103 ms |
| `decourtsar-09.pdf` | 59/F | 59/F | 20,027 ms |
| `decourtsar-11.pdf` | 59/F | 59/F | 18,730 ms |

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source missed the 93 mean target by a large margin, but every low row fell into `no_safe_predicate` zero-heading debt.
- The hard-low rows all repeated at `59/F`, confirming stable quality debt rather than one-off route volatility.
- Reading-order shell and visible-title/heading-anchor diagnostics found no safe existing route, title seed, or content-backed heading predicate.
- Same-source A rows prove the source family itself is not a sufficient production gate.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
