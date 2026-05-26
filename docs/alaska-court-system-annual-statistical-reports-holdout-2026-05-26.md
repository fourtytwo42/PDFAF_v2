# Alaska Court System Annual Statistical Reports Holdout - 2026-05-26

## Source

- Source family: Alaska Court System annual statistical reports.
- Reports page: `https://courts.alaska.gov/admin/index.htm`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The sample walked official `/admin/docs/fy*.pdf` annual-report links in page order, using FY2025-FY2020 narrative/statistics PDFs and FY2019-FY2012 combined annual reports. All 20 attempted PDFs were valid and under the 10 MiB cap.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/run-r1 \
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
| Mean before | 48.00 |
| Mean after | 91.15 |
| Median after | 93 |
| Grades after | 13 A / 6 B / 0 C / 1 D / 0 F |
| Rows below 93 | 9 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 36,710 ms |
| Runtime p95 | 50,179 ms |
| Runtime max | 299,710 ms |

Rows below 93:

| Row | Baseline after | Runtime | Primary residual |
| --- | ---: | ---: | --- |
| `akcourtsar-01.pdf` | 88/B | 40,327 ms | Stable heading/no-safe-predicate residual |
| `akcourtsar-02.pdf` | 91/A | 46,645 ms | Near-miss heading monitor |
| `akcourtsar-03.pdf` | 88/B | 36,710 ms | Stable heading/no-safe-predicate residual |
| `akcourtsar-05.pdf` | 86/B | 37,293 ms | Stable heading/no-safe-predicate residual |
| `akcourtsar-06.pdf` | 91/A | 48,120 ms | Near-miss heading monitor |
| `akcourtsar-07.pdf` | 88/B | 31,065 ms | Stable heading/no-safe-predicate residual |
| `akcourtsar-09.pdf` | 87/B | 37,839 ms | Stable heading/no-safe-predicate residual |
| `akcourtsar-11.pdf` | 89/B | 43,412 ms | Stable heading/no-safe-predicate residual |
| `akcourtsar-15.pdf` | 69/D | 299,710 ms | Stable table target/transaction residual and runtime-tail row |

## Sample

The 20 valid under-10MiB PDFs downloaded from the Alaska Court System reports page were:

| Row | Report | Bytes |
| --- | --- | ---: |
| `akcourtsar-01` | FY2025 Narratives | 3,592,365 |
| `akcourtsar-02` | FY2025 Statistics | 4,489,010 |
| `akcourtsar-03` | FY2024 Narratives | 2,863,825 |
| `akcourtsar-04` | FY2024 Statistics | 5,280,161 |
| `akcourtsar-05` | FY2023 Narratives | 2,541,331 |
| `akcourtsar-06` | FY2023 Statistics | 3,299,732 |
| `akcourtsar-07` | FY2022 Narratives | 2,167,540 |
| `akcourtsar-08` | FY2022 Statistics | 2,671,390 |
| `akcourtsar-09` | FY2021 Narratives | 3,835,704 |
| `akcourtsar-10` | FY2021 Statistics | 6,109,302 |
| `akcourtsar-11` | FY2020 Narratives | 3,202,891 |
| `akcourtsar-12` | FY2020 Statistics | 8,452,878 |
| `akcourtsar-13` | FY2019 Annual Statistical Report | 6,238,051 |
| `akcourtsar-14` | FY2018 Annual Statistical Report | 6,510,572 |
| `akcourtsar-15` | FY2017 Annual Statistical Report | 8,524,689 |
| `akcourtsar-16` | FY2016 Annual Statistical Report | 9,708,575 |
| `akcourtsar-17` | FY2015 Annual Statistical Report | 6,513,411 |
| `akcourtsar-18` | FY2014 Annual Statistical Report | 7,566,887 |
| `akcourtsar-19` | FY2013 Annual Statistical Report | 5,922,425 |
| `akcourtsar-20` | FY2012 Annual Statistical Report | 6,041,965 |

The reports page exposed 25 annual-report PDF candidates; the validation sample used the first 20 under-cap candidates.

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/low-row-diagnostic-r1
```

Decision: `plan_high_impact_targeted_diagnostic`

Recommended lane: `table_target_resolution_needed`

Raw points needed for mean 93: `37`

Lane split:

| Lane | Rows | Raw points |
| --- | ---: | ---: |
| `no_safe_predicate` | 6 | 32 |
| `table_target_resolution_needed` | 1 | 24 |
| `near_miss_monitor` | 2 | 4 |

Reading-order shell diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/reading-order-shell-diagnostic-r1
```

Result:

- `sequenceCandidateCount=0`
- `safeRouteControlCount=0`
- `selectedRows=[]`

Visible-title/heading-anchor diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-visible-title-anchor-diagnostic.ts \
  --all-input /mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/visible-title-input.json \
  --input-root /mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/input \
  --out /mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/visible-title-anchor-r1 \
  --file akcourtsar-01 \
  --file akcourtsar-02 \
  --file akcourtsar-03 \
  --file akcourtsar-05 \
  --file akcourtsar-06 \
  --file akcourtsar-07 \
  --file akcourtsar-09 \
  --file akcourtsar-11
```

Result:

- seven rows classified as `existing_internal_anchor_candidate`
- one row classified as `not_zero_heading_native_gap`
- recommendation was to use existing visible-heading paths, not add a new source-text fallback

This does not justify a new heading fallback or source-text based heading rule.

Table target-resolution diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/table-target-resolution-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/table-target-resolution-r1 \
  --pdf akcourtsar-15=/mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/input/akcourtsar-15.pdf \
  --control akcourtsar-04=/mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/input/akcourtsar-04.pdf \
  --control akcourtsar-08=/mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/input/akcourtsar-08.pdf \
  --control akcourtsar-10=/mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/input/akcourtsar-10.pdf \
  --control akcourtsar-12=/mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/input/akcourtsar-12.pdf \
  --control akcourtsar-16=/mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/input/akcourtsar-16.pdf \
  --control akcourtsar-17=/mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/input/akcourtsar-17.pdf \
  --control akcourtsar-18=/mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/input/akcourtsar-18.pdf \
  --control akcourtsar-19=/mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/input/akcourtsar-19.pdf \
  --control akcourtsar-20=/mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/input/akcourtsar-20.pdf
```

Decision: `keep_table_target_resolution_diagnostic_only`

Evidence:

- `akcourtsar-15` had stable normalize targets and association targets, with table score debt, shape debt, and PAC table-header association debt.
- Same-source selected controls did not produce unsafe stable target candidates.
- Existing table repair attempts already applied `normalize_table_structure` and `repair_native_table_headers`, then rejected `set_table_header_cells` on `pdfua.table.header_association_present`.
- This supports the parked real table/header transaction lane, but not a new standalone broad table admission rule.

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/low-repeat-input \
  /mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/run-low-repeat-r1 \
  --limit 9 \
  --cleanup-row-artifacts
```

The nine sub-93 rows repeated with mean `86.6667`, no errors/timeouts, and `false_positive_applied=0`. Repeated results were `akcourtsar-01 90/A`, `akcourtsar-02 91/A`, `akcourtsar-03 88/B`, `akcourtsar-05 87/B`, `akcourtsar-06 91/A`, `akcourtsar-07 88/B`, `akcourtsar-09 88/B`, `akcourtsar-11 88/B`, and `akcourtsar-15 69/D`.

## Decision

No source behavior was accepted from this holdout.

The source misses the 93 mean target by `37` raw points. The lower narrative rows are stable heading-structure residuals, but the existing visible-heading path already has candidate evidence and no new safe heading fallback is proven. The high-impact FY2017 table row is a real object-backed table/header residual, but current table/header mutations already hit honest PAC header-association rejection and near-wall runtime.

No original-50 regression validation was required because no scoring, planning, analyzer, or remediation behavior changed. Downloaded public PDFs and generated artifacts should remain local only and were deleted after metrics extraction.
