# Virginia Judicial Council Reports Holdout - 2026-05-26

## Source

- Source family: Judicial Council of Virginia reports.
- Source index: `https://www.courts.state.va.us/courtadmin/judpolicies/home`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/virginia-judicial-council-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

This source was selected after skipping two unsuitable candidates during source discovery: New York Court of Appeals annual reports returned Cloudflare 403 responses for direct PDF fetches, and the Virginia Criminal Sentencing Commission page repeatedly timed out under the bounded fetch guard.

## Validation

Primary run:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/virginia-judicial-council-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/virginia-judicial-council-reports-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Run mode:

- deterministic
- `--no-semantic`
- `--no-pdfs`
- single bounded holdout worker

Primary run results:

| Metric | Value |
| --- | ---: |
| Processed | 20/20 |
| Mean before | 33.20 |
| Mean after | 91.75 |
| Median after | 95.5 |
| Grades after | 18 A / 0 B / 0 C / 0 D / 2 F |
| Rows below 93 | 2 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 15,376 ms |
| Runtime p95 | 23,965 ms |
| Runtime max | 32,186 ms |

Rows below 93 in the primary run:

| Row | Before | After | Main debt |
| --- | ---: | ---: | --- |
| `vajcv-12.pdf` | 31 | 59/F | zero heading structure |
| `vajcv-16.pdf` | 38 | 59/F | zero heading structure |

Repeat run:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/virginia-judicial-council-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/virginia-judicial-council-reports-2026-05-26/run-r2 \
  --limit 20 \
  --cleanup-row-artifacts
```

Repeat run results:

| Metric | Value |
| --- | ---: |
| Processed | 20/20 |
| Mean before | 33.80 |
| Mean after | 85.80 |
| Median after | 94 |
| Grades after | 15 A / 0 B / 0 C / 0 D / 5 F |
| Rows below 93 | 6 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 15,381 ms |
| Runtime p95 | 28,079 ms |
| Runtime max | 43,604 ms |

Repeat instability:

| Row | Primary | Repeat | Delta |
| --- | ---: | ---: | ---: |
| `vajcv-09.pdf` | 97/A | 59/F | -38 |
| `vajcv-15.pdf` | 97/A | 59/F | -38 |
| `vajcv-19.pdf` | 97/A | 59/F | -38 |
| `vajcv-20.pdf` | 97/A | 92/A | -5 |

## Sample

The 20 valid under-10MiB PDFs downloaded from the Virginia Court System page were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `vajcv-01` | Judicial Council of Virginia Report 2024 | 1,092,246 |
| `vajcv-02` | Judicial Council of Virginia Report 2023 | 714,053 |
| `vajcv-03` | Judicial Council of Virginia Report 2022 | 589,889 |
| `vajcv-04` | Judicial Council of Virginia Report 2021 | 388,331 |
| `vajcv-05` | Judicial Council of Virginia Report 2020 | 402,586 |
| `vajcv-06` | Judicial Council of Virginia Report 2019 | 515,352 |
| `vajcv-07` | Judicial Council of Virginia Report 2018 | 549,847 |
| `vajcv-08` | Judicial Council of Virginia Report 2017 | 896,738 |
| `vajcv-09` | Judicial Council of Virginia Report 2016 | 1,039,361 |
| `vajcv-10` | Judicial Council of Virginia Report 2015 | 339,243 |
| `vajcv-11` | Judicial Council of Virginia Report 2014 | 365,885 |
| `vajcv-12` | Judicial Council of Virginia Report 2013 | 290,379 |
| `vajcv-13` | Judicial Council of Virginia Report 2012 | 210,010 |
| `vajcv-14` | Judicial Council of Virginia Report 2011 | 328,495 |
| `vajcv-15` | Judicial Council of Virginia Report 2010 | 3,140,337 |
| `vajcv-16` | Judicial Council of Virginia Report 2009 | 1,802,522 |
| `vajcv-17` | Judicial Council of Virginia Report 2008 | 983,967 |
| `vajcv-18` | Judicial Council of Virginia Report 2007 | 652,767 |
| `vajcv-19` | Judicial Council of Virginia Report 2006 | 882,829 |
| `vajcv-20` | Judicial Council of Virginia Report 2005 | 819,132 |

## Diagnostics

Primary low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/virginia-judicial-council-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/virginia-judicial-council-reports-2026-05-26/low-row-diagnostic-r1
```

Result:

- decision: `no_safe_low_row_lane`
- recommended lane: `none`
- raw points needed for mean 93: `25`
- both low rows classified as `no_safe_predicate`

Reading-order shell diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/virginia-judicial-council-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/virginia-judicial-council-reports-2026-05-26/reading-order-shell-r1
```

Result:

- `sequenceCandidateCount=0`
- `safeRouteControlCount=0`
- `selectedRows=[]`

Visible-title/heading-anchor diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-visible-title-anchor-diagnostic.ts \
  --all-input /mnt/pdf-review/public-holdouts/virginia-judicial-council-reports-2026-05-26/visible-title-input.json \
  --input-root /mnt/pdf-review/public-holdouts/virginia-judicial-council-reports-2026-05-26/input \
  --out /mnt/pdf-review/public-holdouts/virginia-judicial-council-reports-2026-05-26/visible-title-anchor-r1 \
  --file vajcv-12 \
  --file vajcv-16
```

Result:

- `vajcv-12.pdf`: `not_zero_heading_native_gap`
- `vajcv-16.pdf`: `not_zero_heading_native_gap`

Two-row low repeat:

| Row | Primary | Low repeat | Interpretation |
| --- | ---: | ---: | --- |
| `vajcv-12.pdf` | 59/F | 93/A | route/analyzer volatility |
| `vajcv-16.pdf` | 59/F | 59/F | stable residual zero-heading debt |

Repeat low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/virginia-judicial-council-reports-2026-05-26/run-r2/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/virginia-judicial-council-reports-2026-05-26/low-row-diagnostic-r2
```

Result:

- decision: `no_safe_low_row_lane`
- recommended lane: `none`
- raw points needed for mean 93: `144`
- five F rows classified as `no_safe_predicate`; one row was a low-priority `near_miss_monitor`

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The primary fresh 20-PDF run did not reach the 93 mean target: `91.75`.
- The full repeat was worse, at `85.80`, because several rows moved from A-grade to `59/F`.
- The failures are not hard timeouts and do not point to a bounded runtime fix.
- The diagnostics found no safe reading-shell or visible-title heading recovery predicate.
- The low-row failures are dominated by zero-heading/route volatility and stable no-safe-predicate residuals.
- `false_positive_applied=0` in all runs, so repair honesty held.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
