# Hawaii Judiciary Reports Holdout - 2026-05-26

## Source

- Source family: Hawaii State Judiciary reports archive.
- Reports archive: `https://www.courts.state.hi.us/news_and_reports/reports/annual_report_stat_sup_archive`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/hawaii-judiciary-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The sample walked official PDF links on the archive page, preferred annual reports, statistical supplements, CADR annual reports, and Judiciary History Center annual reports, and skipped candidates that failed the 10 MiB capped download guard.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/hawaii-judiciary-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/hawaii-judiciary-reports-2026-05-26/run-r1 \
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
| Mean before | 62.40 |
| Mean after | 91.00 |
| Median after | 91 |
| Grades after | 13 A / 6 B / 0 C / 1 D / 0 F |
| Rows below 93 | 10 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 21,545 ms |
| Runtime p95 | 32,728 ms |
| Runtime max | 89,887 ms |

Rows below 93:

| Row | Baseline after | Runtime | Primary residual |
| --- | ---: | ---: | --- |
| `hijud-02.pdf` | 85/B | 23,590 ms | Stable reading/link-order residual |
| `hijud-03.pdf` | 85/B | 28,724 ms | Stable reading/link-order residual |
| `hijud-04.pdf` | 85/B | 15,961 ms | Stable reading/link-order residual |
| `hijud-09.pdf` | 86/B | 31,866 ms | Stable reading/link-order residual |
| `hijud-11.pdf` | 82/B | 32,728 ms | Stable reading/link-order residual |
| `hijud-13.pdf` | 69/D | 89,887 ms | Stable table target/transaction residual |
| `hijud-15.pdf` | 91/A | 18,033 ms | Near-miss reading/link-order monitor |
| `hijud-16.pdf` | 90/A | 28,221 ms | Near-miss mixed table/reading/alt monitor |
| `hijud-18.pdf` | 91/A | 28,671 ms | Near-miss link/heading/alt monitor |
| `hijud-20.pdf` | 84/B | 27,114 ms | Stable reading/link-order residual |

## Sample

The 20 valid under-10MiB PDFs downloaded from the Hawaii Judiciary archive were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `hijud-01` | 2013 CADR Annual Report | 102,151 |
| `hijud-02` | 2014-2015 Judiciary History Center Annual Report | 3,531,256 |
| `hijud-03` | 2011-2012 Judiciary History Center Annual Report | 6,239,423 |
| `hijud-04` | 2013-2014 Judiciary History Center Annual Report | 5,218,979 |
| `hijud-05` | 2014 Hawaii State Judiciary Annual Report | 6,213,724 |
| `hijud-06` | 2013 Hawaii State Judiciary Annual Report | 1,830,482 |
| `hijud-07` | 2015 Statistical Supplement | 1,073,137 |
| `hijud-08` | 2015 CADR Annual Report | 60,074 |
| `hijud-09` | 2015-2016 Judiciary History Center Annual Report | 4,450,698 |
| `hijud-10` | 2018 CADR Annual Report | 226,648 |
| `hijud-11` | 2016-2017 Judiciary History Center Annual Report | 5,418,668 |
| `hijud-12` | 2017 CADR Annual Report | 65,788 |
| `hijud-13` | 2018 Annual Report Statistical Supplement | 756,662 |
| `hijud-14` | 2019 CADR Annual Report | 73,400 |
| `hijud-15` | 2017-2018 Judiciary History Center Annual Report | 4,125,599 |
| `hijud-16` | 2018-2019 Judiciary History Center Annual Report | 8,527,860 |
| `hijud-17` | 2020 CADR Annual Report | 414,855 |
| `hijud-18` | 2019-2020 Judiciary History Center Annual Report | 7,420,043 |
| `hijud-19` | FY2021 CADR Annual Report | 932,536 |
| `hijud-20` | 2020-2021 Judiciary History Center Annual Report | 5,856,286 |

The capped download pass selected 20 under-cap PDFs from 86 archive PDF candidates after 27 attempted downloads.

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/hawaii-judiciary-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/hawaii-judiciary-reports-2026-05-26/low-row-diagnostic-r1
```

Decision: `plan_high_impact_targeted_diagnostic`

Recommended lane: `reading_link_order_candidate`

Raw points needed for mean 93: `40`

Lane split:

| Lane | Rows | Raw points |
| --- | ---: | ---: |
| `reading_link_order_candidate` | 6 | 51 |
| `table_target_resolution_needed` | 1 | 24 |
| `near_miss_monitor` | 3 | 7 |

Reading-order shell diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/hawaii-judiciary-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/hawaii-judiciary-reports-2026-05-26/reading-order-shell-diagnostic-r1
```

Result:

- `sequenceCandidateCount=0`
- `selectedRows=[]`
- one safe A-grade shell route was observed on `hijud-05`
- one recovered route with final orphan debt was observed on `hijud-10`

This does not justify broadening reading-order shell behavior for the six low reading/link rows.

Table target-resolution diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/table-target-resolution-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/hawaii-judiciary-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/hawaii-judiciary-reports-2026-05-26/table-target-resolution-r1 \
  --pdf hijud-13=/mnt/pdf-review/public-holdouts/hawaii-judiciary-reports-2026-05-26/input/hijud-13.pdf \
  --control hijud-01=/mnt/pdf-review/public-holdouts/hawaii-judiciary-reports-2026-05-26/input/hijud-01.pdf \
  --control hijud-05=/mnt/pdf-review/public-holdouts/hawaii-judiciary-reports-2026-05-26/input/hijud-05.pdf \
  --control hijud-08=/mnt/pdf-review/public-holdouts/hawaii-judiciary-reports-2026-05-26/input/hijud-08.pdf \
  --control hijud-14=/mnt/pdf-review/public-holdouts/hawaii-judiciary-reports-2026-05-26/input/hijud-14.pdf \
  --control hijud-19=/mnt/pdf-review/public-holdouts/hawaii-judiciary-reports-2026-05-26/input/hijud-19.pdf
```

Decision: `keep_table_target_resolution_diagnostic_only`

Evidence:

- `hijud-13` had a stable normalize target (`956_0`) with table score debt, header debt, and shape debt.
- Current table mutations on `hijud-13` had already no-effected or failed to move final debt.
- Same-source controls did not produce unsafe stable normalize candidates, but a single D-grade focus row is not enough to accept a new table transaction rule.

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/hawaii-judiciary-reports-2026-05-26/low-repeat-input \
  /mnt/pdf-review/public-holdouts/hawaii-judiciary-reports-2026-05-26/run-low-repeat-r1 \
  --limit 10 \
  --cleanup-row-artifacts
```

The ten sub-93 or near-miss rows repeated with mean `84.6000`, no errors/timeouts, and `false_positive_applied=0`. The stable repeats were `hijud-02 85/B`, `hijud-03 85/B`, `hijud-04 85/B`, `hijud-09 86/B`, `hijud-11 82/B`, `hijud-13 69/D`, `hijud-15 91/A`, `hijud-16 90/A`, `hijud-18 91/A`, and `hijud-20 82/B`.

## Decision

No source behavior was accepted from this holdout.

The source misses the 93 mean target by `40` raw points, but the reading/link cluster has no existing safe shell sequence candidate, and the one table row is a stable real debt case without an accepted mutation transaction. This reinforces two parked general lanes:

- native reading/link-order evidence and repair predicates that can separate report positives from controls;
- a real table/header transaction that can preserve or rebuild table header association after shape normalization.

No original-50 regression validation was required because no scoring, planning, analyzer, or remediation behavior changed. Downloaded public PDFs and generated artifacts should remain local only and were deleted after metrics extraction.
