# Alaska Court System Annual Statistical Reports Holdout - 2026-05-26

## Source

- Source family: Alaska Court System annual statistical reports.
- Source index: `https://courts.alaska.gov/admin/index.htm#annualrep`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The sample used the newest 20 annual statistical report PDFs under the cap: FY2025-FY2020 narrative/statistics pairs plus FY2019-FY2012 combined annual statistical reports.

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
| Mean before | 47.70 |
| Mean after | 91.25 |
| Median after | 93 |
| Grades after | 13 A / 6 B / 0 C / 1 D / 0 F |
| Rows below 93 | 8 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 34,196 ms |
| Runtime p95 | 43,368 ms |
| Runtime max | 295,658 ms |

Rows below 93:

| Row | Baseline after | Diagnostic class |
| --- | ---: | --- |
| `akcourts-01.pdf` | 87/B | `no_safe_predicate` |
| `akcourts-03.pdf` | 88/B | `no_safe_predicate` |
| `akcourts-05.pdf` | 86/B | `no_safe_predicate` |
| `akcourts-06.pdf` | 91/A | `near_miss_monitor` |
| `akcourts-07.pdf` | 88/B | `no_safe_predicate` |
| `akcourts-09.pdf` | 88/B | `no_safe_predicate` |
| `akcourts-11.pdf` | 88/B | `no_safe_predicate` |
| `akcourts-15.pdf` | 69/D | `table_target_resolution_needed` |

## Sample

The 20 valid under-10MiB PDFs downloaded from Alaska Court System annual statistical reports were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `akcourts-01` | FY 2025 Narratives | 3,592,365 |
| `akcourts-02` | FY 2025 Statistics | 4,489,010 |
| `akcourts-03` | FY 2024 Narratives | 2,863,825 |
| `akcourts-04` | FY 2024 Statistics | 5,280,161 |
| `akcourts-05` | FY 2023 Narratives | 2,541,331 |
| `akcourts-06` | FY 2023 Statistics | 3,299,732 |
| `akcourts-07` | FY 2022 Narratives | 2,167,540 |
| `akcourts-08` | FY 2022 Statistics | 2,671,390 |
| `akcourts-09` | FY 2021 Narratives | 3,835,704 |
| `akcourts-10` | FY 2021 Statistics | 6,109,302 |
| `akcourts-11` | FY 2020 Narratives | 3,202,891 |
| `akcourts-12` | FY 2020 Statistics | 8,452,878 |
| `akcourts-13` | FY 2019 Combined Annual Statistical Report | 6,238,051 |
| `akcourts-14` | FY 2018 Combined Annual Statistical Report | 6,510,572 |
| `akcourts-15` | FY 2017 Combined Annual Statistical Report | 8,524,689 |
| `akcourts-16` | FY 2016 Combined Annual Statistical Report | 9,708,575 |
| `akcourts-17` | FY 2015 Combined Annual Statistical Report | 6,513,411 |
| `akcourts-18` | FY 2014 Combined Annual Statistical Report | 7,566,887 |
| `akcourts-19` | FY 2013 Combined Annual Statistical Report | 5,922,425 |
| `akcourts-20` | FY 2012 Combined Annual Statistical Report | 6,041,965 |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/low-row-diagnostic-r1
```

Decision: `plan_high_impact_targeted_diagnostic`

Recommended lane: `table_target_resolution_needed`

Raw points needed for mean 93: `35`

Lane summary:

| Candidate class | Rows | Raw points |
| --- | ---: | ---: |
| `no_safe_predicate` | 6 | 33 |
| `table_target_resolution_needed` | 1 | 24 |
| `near_miss_monitor` | 1 | 2 |

Table target-resolution diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/table-target-resolution-diagnostic.ts \
  --manifest /mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/download-manifest.json \
  --run /mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/table-target-resolution-r1 \
  --pdf akcourts-15=/mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/input/akcourts-15.pdf \
  --control akcourts-02=/mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/input/akcourts-02.pdf \
  --control akcourts-04=/mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/input/akcourts-04.pdf \
  --control akcourts-08=/mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/input/akcourts-08.pdf \
  --control akcourts-16=/mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/input/akcourts-16.pdf \
  --control akcourts-17=/mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/input/akcourts-17.pdf
```

Decision: `keep_table_target_resolution_diagnostic_only`

The diagnostic found `akcourts-15` as a stable object-backed table target with `134` stable tables, `12` normalize targets, and `43` association targets. The selected controls were classified as `control_or_high_grade_noise` with no table score/PAC debt. That target-resolution signal is useful, but it is not enough for behavior acceptance because the baseline already attempted the existing table path:

- `normalize_table_structure`: `applied`
- `repair_native_table_headers`: `applied`
- later `set_table_header_cells` / `normalize_table_structure`: rejected on `pac_rule_regressed(pdfua.table.header_association_present)`

High-impact repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/high-repeat-input \
  /mnt/pdf-review/public-holdouts/alaska-court-system-annual-statistical-reports-2026-05-26/run-high-repeat-r1 \
  --limit 1 \
  --cleanup-row-artifacts
```

Repeat result:

| Row | Baseline after | Repeat after | Repeat runtime |
| --- | ---: | ---: | ---: |
| `akcourts-15.pdf` | 69/D | 69/D | 244,980 ms |

The stable table row is also a runtime-tail row. It is a good future table/header transaction-proof candidate, but not a safe quick behavior change.

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source does not clear the 93 mean target: mean `91.25`, median `93`.
- `false_positive_applied=0`, with no timeout/error rows.
- The stable high-impact table row already exercises existing table remediation and remains `69/D`.
- Further table/header attempts were rejected on PAC-visible `pdfua.table.header_association_present`, so broadening behavior would risk hiding a real PAC-aligned failure.
- The high-impact row has heavy runtime (`295,658 ms` baseline, `244,980 ms` repeat), making a speculative sequence probe poor evidence for a fast general fix.
- The remaining low rows are heading-structure/no-safe-predicate near misses and do not expose an object-backed heading lane.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
