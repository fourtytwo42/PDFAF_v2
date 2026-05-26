# Maine Judicial Branch Reports Holdout - 2026-05-26

## Source

- Source family: Maine Judicial Branch reports and data.
- Reports and Data index: `https://www.courts.maine.gov/about/reports-data.html`
- Published Reports index: `https://www.courts.maine.gov/about/reports/published.html`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/maine-judicial-branch-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The sample used deduplicated official Maine Judicial Branch report/data PDFs in page order. The first 17 rows are from the Reports and Data page; the final three rows come from the Published Reports page to reach 20 under-cap PDFs.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/maine-judicial-branch-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/maine-judicial-branch-reports-2026-05-26/run-r1 \
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
| Mean before | 36.20 |
| Mean after | 94.20 |
| Median after | 94 |
| Grades after | 19 A / 0 B / 1 C / 0 D / 0 F |
| Rows below 93 | 2 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 17,669 ms |
| Runtime p95 | 52,636 ms |
| Runtime max | 56,550 ms |

Rows below 93:

| Row | Baseline after | Runtime | Primary residual |
| --- | ---: | ---: | --- |
| `mecourts-12.pdf` | 92/A | 25,898 ms | Low-priority near miss, `heading_structure=76` |
| `mecourts-20.pdf` | 79/C | 29,976 ms | Reading/link/PDF-UA residual that recovered on repeat |

## Sample

The 20 valid under-10MiB PDFs downloaded from Maine Judicial Branch report pages were:

| Row | Group | Title | Bytes |
| --- | --- | --- | ---: |
| `mecourts-01` | reports-data | Monthly FED Filing Trends Report | 1,101,159 |
| `mecourts-02` | reports-data | All Court Filings | 122,605 |
| `mecourts-03` | reports-data | Law Court Filings Caseload Statistics FY'20 - FY'25 | 65,673 |
| `mecourts-04` | reports-data | Region 1 Caseload Statistics FY'20 - FY'25 | 117,953 |
| `mecourts-05` | reports-data | Region 2 Caseload Statistics FY'20 - FY'25 | 97,003 |
| `mecourts-06` | reports-data | Region 3 Caseload Statistics FY'20 - FY'25 | 135,978 |
| `mecourts-07` | reports-data | Region 4 Caseload Statistics FY'20 - FY'25 | 116,736 |
| `mecourts-08` | reports-data | Region 5 Caseload Statistics FY'20 - FY'25 | 129,702 |
| `mecourts-09` | reports-data | Region 6 Caseload Statistics FY'20 - FY'25 | 146,177 |
| `mecourts-10` | reports-data | Region 7 Caseload Statistics FY'20 - FY'25 | 116,339 |
| `mecourts-11` | reports-data | Region 8 Caseload Statistics FY'20 - FY'25 | 136,693 |
| `mecourts-12` | reports-data | 2023 Workload Assessment Study Report | 845,431 |
| `mecourts-13` | reports-data | 2025 Annual Report | 4,564,779 |
| `mecourts-14` | reports-data | 2024 Annual Report | 5,714,994 |
| `mecourts-15` | reports-data | 2023 Annual Report | 4,326,444 |
| `mecourts-16` | reports-data | 2022 Annual Report | 3,550,835 |
| `mecourts-17` | reports-data | 2021 Annual Report | 3,476,521 |
| `mecourts-18` | published-reports | 2024 Annual Report on Maine's Treatment and Recovery Courts | 3,253,266 |
| `mecourts-19` | published-reports | 2023 Annual Report on Maine's Drug Treatment Courts | 1,634,151 |
| `mecourts-20` | published-reports | 2022 Annual Report on Maine's Drug Treatment Courts | 563,079 |

Skipped candidates: none.

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/maine-judicial-branch-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/maine-judicial-branch-reports-2026-05-26/low-row-diagnostic-r1
```

Decision: `holdout_target_met`

Recommended lane: `reading_link_order_candidate`

Raw points needed for mean 93: `0`

Lane split:

| Lane | Rows | Raw points |
| --- | ---: | ---: |
| `reading_link_order_candidate` | 1 | 14 |
| `near_miss_monitor` | 1 | 1 |

Reading-order shell diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/maine-judicial-branch-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/maine-judicial-branch-reports-2026-05-26/reading-order-shell-diagnostic-r1
```

Result: `0` sequence candidates, `0` safe route controls, and `0` recovered routes with final orphan debt.

Figure/alt diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-figure-alt-no-gain-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/maine-judicial-branch-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/maine-judicial-branch-reports-2026-05-26/figure-alt-no-gain-r1 \
  --include-high-alt
```

Decision: `keep_figure_alt_diagnostic_only`

Result: `0` scoring candidates and `0` behavior candidates.

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/maine-judicial-branch-reports-2026-05-26/low-repeat-input \
  /mnt/pdf-review/public-holdouts/maine-judicial-branch-reports-2026-05-26/run-low-repeat-r1 \
  --limit 2 \
  --cleanup-row-artifacts
```

Repeat result:

| Row | Baseline after | Repeat after | Repeat runtime |
| --- | ---: | ---: | ---: |
| `mecourts-12.pdf` | 92/A | 92/A | 26,193 ms |
| `mecourts-20.pdf` | 79/C | 99/A | 17,155 ms |

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source already exceeds the 93 mean target with no timeout/error rows and `false_positive_applied=0`.
- The only meaningful low row, `mecourts-20`, recovered from `79/C` to `99/A` in a deterministic repeat, so it is route/analyzer volatility rather than a safe new fixer lane.
- The remaining low row is a one-point near miss.
- Reading-order shell and figure/alt diagnostics exposed no safe behavior candidates.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
