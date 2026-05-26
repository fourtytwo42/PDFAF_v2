# Nevada Appellate Courts Annual Reports Holdout - 2026-05-26

## Source

- Source family: Nevada Appellate Courts annual reports.
- Source index: `https://nvcourts.gov/supreme/reports/annual_reports`
- Sample size: 20 PDFs under 10,000,000 bytes.
- Local artifacts: `/mnt/pdf-review/public-holdouts/nevada-appellate-courts-annual-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The source index exposes annual-report detail pages from 2025 through 2000. The selected sample used the 20 available annual-report PDFs under the decimal 10 MB cap. The 2025, 2021, 2019, and 2017 reports were skipped as oversized, and 2015/2014 did not expose a usable annual-report PDF on their detail pages.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/nevada-appellate-courts-annual-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/nevada-appellate-courts-annual-reports-2026-05-26/run-r1 \
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
| Mean after | 92.00 |
| Median after | 93 |
| Grades after | 18 A / 1 B / 0 C / 0 D / 1 F |
| Rows below 93 | 2 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 17,131 ms |
| Runtime p95 | 33,123 ms |
| Runtime max | 67,846 ms |

Rows below 93:

| Row | Before | After | Main debt |
| --- | ---: | ---: | --- |
| `nvcourtsar-02.pdf` | 59 | 87/B | link, table/header, heading, PDF-UA, and partial alt residual |
| `nvcourtsar-13.pdf` | 38 | 59/F | zero-heading debt with no safe native title/anchor route |

## Sample

The 20 selected PDFs under the decimal 10 MB cap were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `nvcourtsar-01` | Nevada Judiciary Annual Report 2024 | 5,390,866 |
| `nvcourtsar-02` | Nevada Judiciary Annual Report 2023 | 4,973,238 |
| `nvcourtsar-03` | Nevada Judiciary Annual Report 2022 | 2,933,711 |
| `nvcourtsar-04` | Nevada Judiciary Annual Report 2020 | 4,643,436 |
| `nvcourtsar-05` | Nevada Judiciary Annual Report 2018 | 3,725,959 |
| `nvcourtsar-06` | Nevada Judiciary Annual Report 2016 | 1,778,272 |
| `nvcourtsar-07` | Nevada Judiciary Annual Report 2013 | 2,028,119 |
| `nvcourtsar-08` | Nevada Judiciary Annual Report 2012 | 3,082,988 |
| `nvcourtsar-09` | Nevada Judiciary Annual Report 2011 | 1,104,313 |
| `nvcourtsar-10` | Nevada Judiciary Annual Report 2010 | 1,082,403 |
| `nvcourtsar-11` | Nevada Judiciary Annual Report 2009 | 599,277 |
| `nvcourtsar-12` | Nevada Judiciary Annual Report 2008 | 2,474,040 |
| `nvcourtsar-13` | Nevada Judiciary Annual Report 2007 | 550,363 |
| `nvcourtsar-14` | Nevada Judiciary Annual Report 2006 | 2,174,782 |
| `nvcourtsar-15` | Nevada Judiciary Annual Report 2005 | 703,754 |
| `nvcourtsar-16` | Nevada Judiciary Annual Report 2004 | 1,838,870 |
| `nvcourtsar-17` | Nevada Judiciary Annual Report 2003 | 601,250 |
| `nvcourtsar-18` | Nevada Judiciary Annual Report 2002 | 1,709,624 |
| `nvcourtsar-19` | Nevada Judiciary Annual Report 2001 | 1,213,988 |
| `nvcourtsar-20` | Nevada Judiciary Annual Report 2000 | 3,272,604 |

Skipped candidates:

| Year | Reason | Bytes |
| --- | --- | ---: |
| 2025 | oversized | 23,036,914 |
| 2021 | oversized | 19,339,198 |
| 2019 | oversized | 13,768,364 |
| 2017 | oversized | 16,439,016 |
| 2015 | no usable annual-report PDF |  |
| 2014 | no usable annual-report PDF |  |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/nevada-appellate-courts-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/nevada-appellate-courts-annual-reports-2026-05-26/low-row-diagnostic-r1
```

Result:

- decision: `no_safe_low_row_lane`
- recommended lane: `table_target_resolution_needed`
- raw points needed for mean 93: `20`
- lane split: `nvcourtsar-13.pdf` as no-safe zero-heading debt and `nvcourtsar-02.pdf` as table-target-resolution debt

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/nevada-appellate-courts-annual-reports-2026-05-26/repeat-low-input \
  /mnt/pdf-review/public-holdouts/nevada-appellate-courts-annual-reports-2026-05-26/run-low-repeat-r1 \
  --limit 2 \
  --cleanup-row-artifacts
```

Result:

| Row | Primary | Repeat | Delta |
| --- | ---: | ---: | ---: |
| `nvcourtsar-02.pdf` | 87/B | 89/B | +2 |
| `nvcourtsar-13.pdf` | 59/F | 59/F | 0 |

Reading-order shell diagnostic:

- `sequenceCandidateCount=0`
- `safeRouteControlCount=0`
- `selectedRows=[]`

Visible-title/heading-anchor diagnostic:

- `nvcourtsar-02.pdf` classified as `existing_internal_anchor_candidate`; use existing visible-heading paths only, not a new source-text fallback.
- `nvcourtsar-13.pdf` classified as `not_zero_heading_native_gap`; the zero-heading debt is not the native untagged/no-owner shape targeted by the current safe heading lane.
- no selected candidates.

Table target-resolution diagnostic:

- decision: `keep_table_target_resolution_diagnostic_only`
- stable focus candidate: `nvcourtsar-02.pdf`
- unsafe control candidates: none in the sampled controls
- conclusion: table/header debt is real, but existing `repair_native_table_headers` and `set_table_header_cells` attempts already returned `no_effect` or PAC regression on the row, and the upside is only six raw points.

OpenDataLoader/native sidecar diagnostic:

- ODL status: `4/4 ok`
- supported lane counts: `table_structure=1`, `reading_order=3`
- suggested actions: `table_undersegmentation_candidate=1`, `reading_order_calibration_candidate=3`
- `nvcourtsar-13.pdf` had broad reading/layout signals, but A-grade controls `nvcourtsar-03.pdf` and `nvcourtsar-04.pdf` also triggered reading-order calibration signals, so this did not justify a behavior promotion.

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The full 20-PDF run missed the requested 93+ mean target by 20 raw points, with mean `92.00` and median `93`.
- The stable high-impact row is zero-heading debt, but current native diagnostics did not find a safe visible-title, reading-shell, or report-layout heading route.
- The table/header row has real object-backed debt, but existing table tools already reached no-effect/PAC-regression outcomes and the remaining gain is too small to justify a new behavior lane.
- ODL reading/layout signals were broad and also appeared on same-source A-grade controls.
- `false_positive_applied=0`, with no timeout/error rows and bounded runtime.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
