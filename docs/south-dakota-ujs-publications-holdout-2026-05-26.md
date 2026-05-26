# South Dakota UJS Publications Holdout - 2026-05-26

## Source

- Source family: South Dakota Unified Judicial System public reports, judiciary booklets, guides, and small-claims forms.
- Public Information index: `https://ujs.sd.gov/about-us/public-information/`
- Judiciary Messages index: `https://ujs.sd.gov/supreme-court/judiciary-messages/`
- Representing Yourself index: `https://ujs.sd.gov/self-help/representing-yourself/`
- Small Claims Court index: `https://ujs.sd.gov/self-help/civil-law-help/small-claims/`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/south-dakota-ujs-publications-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The sample used official UJS PDFs in page order where possible. Some older annual-report and State of the Judiciary PDFs exceeded the 10 MiB source cap during discovery, so the sample was completed with official UJS guides and small-claims forms from the same public source family.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/south-dakota-ujs-publications-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/south-dakota-ujs-publications-2026-05-26/run-r1 \
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
| Mean before | 57.20 |
| Mean after | 94.30 |
| Median after | 95 |
| Grades after | 18 A / 2 B / 0 C / 0 D / 0 F |
| Rows below 93 | 3 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 12,629 ms |
| Runtime p95 | 43,091 ms |
| Runtime max | 54,532 ms |

Rows below 93:

| Row | Baseline after | Runtime | Primary residual |
| --- | ---: | ---: | --- |
| `sdujs-17.pdf` | 90/A | 8,800 ms | Low-priority near miss, table/header and heading residuals |
| `sdujs-18.pdf` | 82/B | 16,815 ms | Table/form/PDF-UA residual with unsafe target resolution |
| `sdujs-19.pdf` | 89/B | 14,997 ms | Low-priority near miss, table/PDF-UA/form residuals |

## Sample

The 20 valid under-10MiB PDFs downloaded from South Dakota UJS pages were:

| Row | Group | Title | Bytes |
| --- | --- | --- | ---: |
| `sdujs-01` | annual-reports | FY2025 UJS Annual Report | 2,709,877 |
| `sdujs-02` | annual-reports | FY2023 UJS Annual Report | 2,550,803 |
| `sdujs-03` | annual-reports | FY2022 UJS Annual Report | 8,115,156 |
| `sdujs-04` | annual-reports | FY2021 UJS Annual Report | 7,522,590 |
| `sdujs-05` | annual-reports | FY2020 UJS Annual Report | 8,462,188 |
| `sdujs-06` | judiciary-messages | 2026 State of the Judiciary | 547,448 |
| `sdujs-07` | judiciary-messages | 2025 State of the Judiciary | 2,030,325 |
| `sdujs-08` | judiciary-messages | 2024 State of the Judiciary | 6,077,426 |
| `sdujs-09` | judiciary-messages | 2021 State of the Judiciary | 2,326,643 |
| `sdujs-10` | forms | Small Claims Denial | 245,276 |
| `sdujs-11` | judiciary-messages | 2016 State of the Judiciary | 8,969,234 |
| `sdujs-12` | judiciary-messages | 2015 State of the Judiciary | 517,402 |
| `sdujs-13` | guides | Guide to South Dakota Courts | 462,023 |
| `sdujs-14` | guides | Guide to Small Claims Court | 377,031 |
| `sdujs-15` | guides | UJS Strategic Plan | 892,089 |
| `sdujs-16` | guides | Guide to Representing Yourself in South Dakota Courts | 951,092 |
| `sdujs-17` | forms | Small Claims Filing Fees | 94,569 |
| `sdujs-18` | forms | Plaintiff Statement of Claim | 207,559 |
| `sdujs-19` | forms | Case Filing Statement | 121,267 |
| `sdujs-20` | forms | Statement of Defendant's Military Status | 182,407 |

Final selected-sample skipped candidates: none.

Discovery over-cap candidates included the FY2024 UJS Annual Report, several older State of the Judiciary booklets, and the Supreme Court photographic history PDF. They were not part of the final 20-row validation sample.

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/south-dakota-ujs-publications-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/south-dakota-ujs-publications-2026-05-26/low-row-diagnostic-r1
```

Decision: `holdout_target_met`

Recommended lane: `table_target_resolution_needed`

Raw points needed for mean 93: `0`

Lane split:

| Lane | Rows | Raw points |
| --- | ---: | ---: |
| `table_target_resolution_needed` | 1 | 11 |
| `near_miss_monitor` | 2 | 7 |

Table target-resolution diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/table-target-resolution-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/south-dakota-ujs-publications-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/south-dakota-ujs-publications-2026-05-26/table-target-resolution-r1 \
  --pdf sdujs-18=/mnt/pdf-review/public-holdouts/south-dakota-ujs-publications-2026-05-26/input/sdujs-18.pdf \
  --control sdujs-10=/mnt/pdf-review/public-holdouts/south-dakota-ujs-publications-2026-05-26/input/sdujs-10.pdf \
  --control sdujs-17=/mnt/pdf-review/public-holdouts/south-dakota-ujs-publications-2026-05-26/input/sdujs-17.pdf \
  --control sdujs-19=/mnt/pdf-review/public-holdouts/south-dakota-ujs-publications-2026-05-26/input/sdujs-19.pdf \
  --control sdujs-20=/mnt/pdf-review/public-holdouts/south-dakota-ujs-publications-2026-05-26/input/sdujs-20.pdf
```

Decision: `keep_table_target_resolution_diagnostic_only`

Reasons:

- Stable focus candidates: none.
- Unsafe control candidates: `sdujs-17`, `sdujs-19`.
- Prior non-table target rows: `sdujs-18`.
- `sdujs-18` had `set_table_header_cells` resolve a requested target as `TR`, and later table/header attempts rejected on PAC-visible table-header debt or returned `no_effect`.

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/south-dakota-ujs-publications-2026-05-26/low-repeat-input \
  /mnt/pdf-review/public-holdouts/south-dakota-ujs-publications-2026-05-26/run-low-repeat-r1 \
  --limit 3 \
  --cleanup-row-artifacts
```

Repeat result:

| Row | Baseline after | Repeat after | Repeat runtime |
| --- | ---: | ---: | ---: |
| `sdujs-17.pdf` | 90/A | 90/A | 8,118 ms |
| `sdujs-18.pdf` | 82/B | 82/B | 16,203 ms |
| `sdujs-19.pdf` | 89/B | 89/B | 14,342 ms |

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source already exceeds the 93 mean target with no timeout/error rows and `false_positive_applied=0`.
- The only medium-priority residual lane is table target resolution, but the focused diagnostic found no stable focus candidate and same-source controls triggered the table predicate.
- The low-row repeat reproduced the residuals, so this is stable table/form/PDF-UA debt, not route recovery evidence.
- Promoting a table/form behavior from one unstable focus row plus triggering controls would violate the generalization and false-positive gates.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
