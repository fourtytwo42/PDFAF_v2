# New Mexico Courts Annual Reports Holdout - 2026-05-26

## Source

- Source family: New Mexico Courts annual reports and statistical addenda.
- Source index: `https://nmcourts.gov/court-administration/reports-policies/`
- Sample size: 20 PDFs under 10,000,000 bytes.
- Local artifacts: `/mnt/pdf-review/public-holdouts/new-mexico-courts-annual-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The source page has more than 20 matching annual-report/statistical-addendum PDFs. The downloader selected the first 20 PDFs under a decimal 10 MB cap and skipped eight oversized annual-report/statistical-addendum PDFs before selection.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/new-mexico-courts-annual-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/new-mexico-courts-annual-reports-2026-05-26/run-r1 \
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
| Mean before | 31.45 |
| Mean after | 86.95 |
| Median after | 93 |
| Grades after | 16 A / 0 B / 0 C / 1 D / 3 F |
| Rows below 93 | 7 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 19,469 ms |
| Runtime p95 | 213,012 ms |
| Runtime max | 229,307 ms |

Rows below 93:

| Row | Before | After | Main debt |
| --- | ---: | ---: | --- |
| `nmcourtsar-01.pdf` | 28 | 92/A | reading order near miss |
| `nmcourtsar-02.pdf` | 28 | 52/F | zero heading plus reading order |
| `nmcourtsar-03.pdf` | 28 | 92/A | reading order near miss |
| `nmcourtsar-05.pdf` | 28 | 51/F | zero heading plus reading order |
| `nmcourtsar-06.pdf` | 28 | 51/F | zero heading plus reading order |
| `nmcourtsar-07.pdf` | 38 | 92/A | link/reading near miss |
| `nmcourtsar-15.pdf` | 33 | 69/D | table/PDF-UA debt |

## Sample

The 20 selected PDFs under the decimal 10 MB cap were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `nmcourtsar-01` | FY25 Judicial Statistical Addendum | 3,188,021 |
| `nmcourtsar-02` | FY24 Judicial Statistical Addendum | 3,220,744 |
| `nmcourtsar-03` | FY23 Judicial Statistical Addendum | 3,154,276 |
| `nmcourtsar-04` | FY22 Judicial Statistical Addendum | 2,360,260 |
| `nmcourtsar-05` | NM Judiciary Statistical Addendum FY21 | 6,416,754 |
| `nmcourtsar-06` | NMCourts Statistical Addendum FY20 | 6,292,292 |
| `nmcourtsar-07` | AOC 2020 Annual Report | 4,381,414 |
| `nmcourtsar-08` | 2019 Statistical Addendum | 6,985,551 |
| `nmcourtsar-09` | 2017 NM Judicial Branch Annual Report | 3,482,429 |
| `nmcourtsar-10` | 2017 Statistical Addendum | 1,452,089 |
| `nmcourtsar-11` | 2016 Statistical Addendum | 1,443,161 |
| `nmcourtsar-12` | Annual Report 2016 | 2,820,291 |
| `nmcourtsar-13` | Annual Report 2015 | 9,692,979 |
| `nmcourtsar-14` | Statistical Addendum 2015 | 1,439,874 |
| `nmcourtsar-15` | Statistical Addendum 2014 | 2,588,066 |
| `nmcourtsar-16` | Annual Report 2013 | 3,861,303 |
| `nmcourtsar-17` | Annual Report 2012 | 1,310,756 |
| `nmcourtsar-18` | Statistical Addendum 2012 | 933,490 |
| `nmcourtsar-19` | Annual Report 2011 | 1,053,450 |
| `nmcourtsar-20` | Statistical Addendum 2011 | 935,537 |

Oversized skipped candidates included the 2025, 2024, 2023, 2022, 2021, 2019, and 2014 annual reports plus the 2013 statistical addendum.

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/new-mexico-courts-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/new-mexico-courts-annual-reports-2026-05-26/low-row-diagnostic-r1
```

Result:

- decision: `plan_high_impact_targeted_diagnostic`
- recommended lane: `reading_link_order_candidate`
- raw points needed for mean 93: `121`
- lane split: `3` reading/link-order rows, `1` table-target row, and `3` near misses

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/new-mexico-courts-annual-reports-2026-05-26/repeat-low-input \
  /mnt/pdf-review/public-holdouts/new-mexico-courts-annual-reports-2026-05-26/run-low-repeat-r1 \
  --limit 7 \
  --cleanup-row-artifacts
```

Result:

| Row | Primary | Repeat | Delta |
| --- | ---: | ---: | ---: |
| `nmcourtsar-01.pdf` | 92/A | 92/A | 0 |
| `nmcourtsar-02.pdf` | 52/F | 52/F | 0 |
| `nmcourtsar-03.pdf` | 92/A | 92/A | 0 |
| `nmcourtsar-05.pdf` | 51/F | 51/F | 0 |
| `nmcourtsar-06.pdf` | 51/F | 51/F | 0 |
| `nmcourtsar-07.pdf` | 92/A | 92/A | 0 |
| `nmcourtsar-15.pdf` | 69/D | 53/F | -16 |

Repeat low-row diagnostic:

- decision: `plan_high_impact_targeted_diagnostic`
- recommended lane: `reading_link_order_candidate`
- raw points needed for mean 93 over repeated low rows: `168`
- `false_positive_applied=0`
- no timeout/error rows

Reading-order shell diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/new-mexico-courts-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/new-mexico-courts-annual-reports-2026-05-26/reading-order-shell-r1
```

Result:

- `sequenceCandidateCount=0`
- `safeRouteControlCount=3`
- `selectedRows=[]`

Visible-title/heading-anchor diagnostic on the three hard heading rows:

- `nmcourtsar-02.pdf`, `nmcourtsar-05.pdf`, and `nmcourtsar-06.pdf` all classified as `not_zero_heading_native_gap`.
- No source-text fallback or visible-title heading promotion was supported.

Table target-resolution diagnostic on the table low plus same-source controls:

- decision: `keep_table_target_resolution_diagnostic_only`
- stable focus candidates: none
- unsafe control candidates: `nmcourtsar-10`, `nmcourtsar-14`
- prior non-table target row: `nmcourtsar-15`
- conclusion: table debt is real, but the attempted target resolved as `TD` rather than `/Table`, and same-source controls also trigger table-shape evidence.

OpenDataLoader/native sidecar diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/opendataloader-sidecar-diagnostic.ts \
  --out /mnt/pdf-review/public-holdouts/new-mexico-courts-annual-reports-2026-05-26/odl-sidecar-r1 \
  --timeout-ms 60000 \
  --pdf .../nmcourtsar-02.pdf \
  --pdf .../nmcourtsar-05.pdf \
  --pdf .../nmcourtsar-06.pdf \
  --pdf .../nmcourtsar-15.pdf \
  --pdf .../nmcourtsar-04.pdf \
  --pdf .../nmcourtsar-10.pdf \
  --pdf .../nmcourtsar-14.pdf \
  --pdf .../nmcourtsar-16.pdf
```

Result:

- ODL status: `8/8 ok`
- supported lanes: `5` reading-order candidates, `3` table-structure candidates
- same-source control/high rows also triggered: `nmcourtsar-04` and `nmcourtsar-16` for reading-order calibration, `nmcourtsar-10` and `nmcourtsar-14` for table undersegmentation
- conclusion: ODL/native evidence confirms real layout/table stress, but it does not separate failing rows cleanly enough to justify a general scoring or remediation change.

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source is well below the requested 93+ mean target at `86.95`; three F rows are stable on repeat.
- The stable hard lows cluster around zero heading and reading-order debt, but existing reading-order shell and visible-title diagnostics do not expose a safe existing repair route.
- The table low is volatile and target resolution shows the prior table attempt resolved to a non-table `TD` target.
- Table evidence is not selective enough because same-source controls also trigger table-shape predicates.
- ODL/native sidecar evidence confirms the same broad layout/table stress but also triggers same-source controls.
- `false_positive_applied=0`, with no timeout/error rows.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
