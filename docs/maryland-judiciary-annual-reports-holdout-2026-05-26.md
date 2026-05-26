# Maryland Judiciary Annual Reports Holdout - 2026-05-26

## Source

- Source family: Maryland Judiciary annual reports, Judicial Council annual reports, and statistical abstracts.
- Annual reports index: `https://www.mdcourts.gov/publications/annualreports`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The sample walked official PDF links from the Maryland Judiciary annual reports index in descending page order and skipped candidates that exceeded the 10 MiB capped download guard.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/run-r1 \
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
| Mean before | 43.60 |
| Mean after | 86.65 |
| Median after | 94 |
| Grades after | 15 A / 0 B / 0 C / 1 D / 4 F |
| Rows below 93 | 6 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 28,917 ms |
| Runtime p95 | 192,318 ms |
| Runtime max | 229,587 ms |

Rows below 93:

| Row | Baseline after | Runtime | Primary residual |
| --- | ---: | ---: | --- |
| `mdcourts-04.pdf` | 92/A | 71,186 ms | Near miss; repeat volatility |
| `mdcourts-12.pdf` | 59/F | 192,318 ms | Stable zero-heading/no-safe-predicate residual |
| `mdcourts-13.pdf` | 59/F | 183,210 ms | Layout table evidence without stable table ref |
| `mdcourts-16.pdf` | 69/D | 160,353 ms | Stable table-shape target, but unsafe control shape exists |
| `mdcourts-17.pdf` | 59/F | 229,587 ms | Stable table-shape target, but unsafe control shape exists |
| `mdcourts-19.pdf` | 59/F | 83,481 ms | Layout table/no-safe-predicate residual with text-extractability debt |

## Sample

The 20 valid under-10MiB PDFs downloaded from Maryland Judiciary URLs were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `mdcourts-01` | Judicial Council Annual Report 2020 | 4,377,746 |
| `mdcourts-02` | FY2020 Statistical Abstract | 1,542,870 |
| `mdcourts-03` | Judicial Council Annual Report 2019 | 2,738,112 |
| `mdcourts-04` | FY2019 Statistical Abstract | 2,286,950 |
| `mdcourts-05` | Judicial Council Annual Report 2018 | 2,853,301 |
| `mdcourts-06` | FY2018 Statistical Abstract | 797,898 |
| `mdcourts-07` | 2017 Strategic Plan Update | 2,011,607 |
| `mdcourts-08` | FY2017 Statistical Abstract | 4,334,711 |
| `mdcourts-09` | 2016 Progress Report | 9,502,462 |
| `mdcourts-10` | FY2016 Statistical Abstract | 3,175,111 |
| `mdcourts-11` | FY2015 Statistical Abstract | 1,715,277 |
| `mdcourts-12` | FY2014 Statistical Abstract | 1,688,251 |
| `mdcourts-13` | FY2013 Statistical Abstract | 1,342,555 |
| `mdcourts-14` | 2012 Annual Report | 1,441,942 |
| `mdcourts-15` | 2011 Annual Report | 1,179,331 |
| `mdcourts-16` | 2010 Annual Report | 1,263,563 |
| `mdcourts-17` | 2008-2009 Statistical Digest | 1,389,068 |
| `mdcourts-18` | 2006-2007 Annual Report | 1,201,629 |
| `mdcourts-19` | 2007 Annual Report | 3,442,530 |
| `mdcourts-20` | 2005-2006 Annual Report | 839,111 |

Skipped by the 10MiB capped download guard:

| Candidate | Reason |
| --- | --- |
| 2020 Strategic Plan Update | `curl_failed_63` |
| 2019 Strategic Plan Update | `curl_failed_63` |
| 2018 Strategic Plan Update | `curl_failed_63` |
| Judicial Council Annual Report 2017 | `curl_failed_63` |
| 2017 Strategic Plan Update | `curl_failed_63` |
| Judicial Council Annual Report 2016 | `curl_failed_63` |

`curl_failed_63` is the capped download failure from `curl --max-filesize 10485760`.

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/low-row-diagnostic-r1
```

Decision: `plan_high_impact_targeted_diagnostic`

Recommended lane: `table_target_resolution_needed`

Raw points needed for mean 93: `127`

Lane split:

| Lane | Rows | Raw points |
| --- | ---: | ---: |
| `table_target_resolution_needed` | 3 | 92 |
| `no_safe_predicate` | 2 | 68 |
| `near_miss_monitor` | 1 | 1 |

Table target-resolution diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/table-target-resolution-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/table-target-resolution-r1 \
  --pdf mdcourts-13=/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/input/mdcourts-13.pdf \
  --pdf mdcourts-17=/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/input/mdcourts-17.pdf \
  --pdf mdcourts-16=/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/input/mdcourts-16.pdf \
  --pdf mdcourts-12=/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/input/mdcourts-12.pdf \
  --pdf mdcourts-19=/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/input/mdcourts-19.pdf \
  --control mdcourts-11=/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/input/mdcourts-11.pdf \
  --control mdcourts-14=/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/input/mdcourts-14.pdf \
  --control mdcourts-15=/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/input/mdcourts-15.pdf \
  --control mdcourts-18=/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/input/mdcourts-18.pdf \
  --control mdcourts-20=/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/input/mdcourts-20.pdf
```

Decision: `keep_table_target_resolution_diagnostic_only`

Stable focus candidates: `mdcourts-16`, `mdcourts-17`

Unsafe control candidates: `mdcourts-15`

Reason: object-backed table-shape targets exist on two focus rows, but an A-grade same-source control also matched the stable normalization shape. Rows `mdcourts-12`, `mdcourts-13`, and `mdcourts-19` had native layout table evidence without stable table structure references.

Reading-order shell diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/reading-order-shell-diagnostic-r1
```

Result: `0` sequence candidates, `0` safe route controls, `4` final orphan-debt rows, and `0` selected rows.

Figure/alt diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-figure-alt-no-gain-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/figure-alt-no-gain-r1 \
  --include-high-alt
```

Decision: `keep_figure_alt_diagnostic_only`; `0` scoring candidates and `0` behavior candidates.

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/low-repeat-input \
  /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-26/run-low-repeat-r1 \
  --limit 6 \
  --cleanup-row-artifacts
```

Repeat result:

| Row | Baseline after | Repeat after | Repeat runtime |
| --- | ---: | ---: | ---: |
| `mdcourts-04.pdf` | 92/A | 96/A | 44,151 ms |
| `mdcourts-12.pdf` | 59/F | 59/F | 152,616 ms |
| `mdcourts-13.pdf` | 59/F | 59/F | 207,613 ms |
| `mdcourts-16.pdf` | 69/D | 69/D | 159,842 ms |
| `mdcourts-17.pdf` | 59/F | 59/F | 233,550 ms |
| `mdcourts-19.pdf` | 59/F | 68/D | 93,783 ms |

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source missed the 93 mean target, but the high-impact table lane was not clean enough to promote: only two focus rows had stable object-backed normalize targets and a same-source A-grade control also triggered.
- The no-safe-predicate lows had zero-heading/layout-table evidence but no safe reading-order shell route and no stable table structure reference.
- Figure/alt diagnostics found no behavior or scoring candidates.
- The low-row repeat confirmed stable quality debt and a repeatable runtime tail, but not a general low-risk fix.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
