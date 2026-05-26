# Washington Courts Caseload Reports Holdout - 2026-05-25

## Source

- Source family: Washington State Courts archived caseload annual reports.
- Source index: `https://www.courts.wa.gov/caseload/?fa=caseload.showArchived`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/washington-courts-caseload-reports-2026-05-25/` during validation only; PDFs and generated run artifacts are not source-tracked.

The sample used the first 20 valid under-cap PDF links from the archived Supreme Court annual reports section, covering report years 1998 through 2017.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/washington-courts-caseload-reports-2026-05-25/input \
  /mnt/pdf-review/public-holdouts/washington-courts-caseload-reports-2026-05-25/run-r1 \
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
| Mean before | 43.15 |
| Mean after | 91.00 |
| Median after | 94 |
| Grades after | 13 A / 6 B / 0 C / 0 D / 1 F |
| Rows below 93 | 9 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 15,048 ms |
| Runtime p95 | 34,506 ms |
| Runtime max | 36,393 ms |

Rows below 93:

| Class | Rows | Raw points |
| --- | ---: | ---: |
| `no_safe_predicate` | 5 | 58 |
| `near_miss_monitor` | 4 | 11 |

## Sample

The 20 valid under-10MiB PDFs downloaded from Washington State Courts archived caseload reports were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `wacourts-01` | `1998` | 74,941 |
| `wacourts-02` | `1999` | 77,727 |
| `wacourts-03` | `2000` | 66,046 |
| `wacourts-04` | `2001` | 66,584 |
| `wacourts-05` | `2002` | 61,242 |
| `wacourts-06` | `2003` | 75,946 |
| `wacourts-07` | `2004` | 69,839 |
| `wacourts-08` | `2005` | 51,057 |
| `wacourts-09` | `2006` | 50,321 |
| `wacourts-10` | `2007` | 64,913 |
| `wacourts-11` | `2008` | 65,128 |
| `wacourts-12` | `2009` | 72,152 |
| `wacourts-13` | `2010` | 321,692 |
| `wacourts-14` | `2011` | 320,087 |
| `wacourts-15` | `2012` | 318,796 |
| `wacourts-16` | `2013` | 322,547 |
| `wacourts-17` | `2014` | 324,019 |
| `wacourts-18` | `2015` | 319,748 |
| `wacourts-19` | `2016` | 329,642 |
| `wacourts-20` | `2017` | 315,423 |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/washington-courts-caseload-reports-2026-05-25/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/washington-courts-caseload-reports-2026-05-25/low-row-diagnostic-r1
```

Decision: `no_safe_low_row_lane`

Recommended lane: `none`

Raw points needed for mean 93: `40`

The high-impact row, `wacourts-12`, scored `59/F` with `heading_structure=0`, `reading_order=79`, `text_extractability=96`, and `pdf_ua_compliance=100`, but the run artifact exposed no object-backed safe heading predicate. Other low rows were mostly low-upside heading/table/PDF-UA near misses.

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/washington-courts-caseload-reports-2026-05-25/low-repeat-input \
  /mnt/pdf-review/public-holdouts/washington-courts-caseload-reports-2026-05-25/low-repeat-r1 \
  --limit 9 \
  --cleanup-row-artifacts
```

Repeat result over the 9 sub-93 baseline rows:

| Metric | Value |
| --- | ---: |
| Rows | 9 |
| Mean after | 85.00 |
| Median after | 87 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p95 | 15,792 ms |

The repeat reproduced the main zero-heading failure and the low-B cluster:

| Row | Baseline after | Repeat after |
| --- | ---: | ---: |
| `wacourts-02.pdf` | 87/B | 87/B |
| `wacourts-03.pdf` | 91/A | 89/B |
| `wacourts-04.pdf` | 92/A | 91/A |
| `wacourts-05.pdf` | 87/B | 87/B |
| `wacourts-06.pdf` | 87/B | 87/B |
| `wacourts-07.pdf` | 87/B | 87/B |
| `wacourts-10.pdf` | 89/B | 89/B |
| `wacourts-11.pdf` | 89/B | 89/B |
| `wacourts-12.pdf` | 59/F | 59/F |

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source does not clear the 93 mean target: mean `91.00`, median `94`.
- Low-row diagnostic found no safe behavior lane.
- The high-impact row is a stable zero-heading failure, but no object-backed heading predicate is visible from the artifact.
- The remaining lows are low-upside near misses; broad heading/table admission would risk overfitting and previous PAC regression patterns.
- `false_positive_applied=0`, with no timeout/error rows and bounded runtime.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
