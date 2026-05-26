# North Dakota Courts Annual Reports Holdout - 2026-05-26

## Source

- Source family: North Dakota Courts annual reports.
- Source index: `https://www.ndcourts.gov/state-court-administration/annual-report`
- Archive index: `https://www.ndcourts.gov/archive/state-court-administration/annual-report`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/north-dakota-courts-annual-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The sample used the newest 20 annual report PDFs that downloaded successfully under the 10 MiB cap. Oversized years `2024`, `2018`, `2017`, and `2007` were skipped.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/north-dakota-courts-annual-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/north-dakota-courts-annual-reports-2026-05-26/run-r1 \
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
| Mean before | 32.80 |
| Mean after | 86.50 |
| Median after | 94 |
| Grades after | 15 A / 0 B / 1 C / 0 D / 4 F |
| Rows below 93 | 7 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 31,833 ms |
| Runtime p95 | 207,061 ms |
| Runtime max | 252,324 ms |

Rows below 93:

| Row | Baseline after | Diagnostic class |
| --- | ---: | --- |
| `ndcourts-01.pdf` | 54/F | `figure_alt_object_candidate` |
| `ndcourts-02.pdf` | 79/C | `reading_link_order_candidate` |
| `ndcourts-06.pdf` | 58/F | `table_target_resolution_needed` |
| `ndcourts-13.pdf` | 59/F | `no_safe_predicate` |
| `ndcourts-15.pdf` | 92/A | `near_miss_monitor` |
| `ndcourts-16.pdf` | 59/F | `reading_link_order_candidate` |
| `ndcourts-17.pdf` | 92/A | `reading_link_order_candidate` |

## Sample

The 20 valid under-10MiB PDFs downloaded from North Dakota Courts annual reports were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `ndcourts-01` | 2025 Annual Report | 8,244,699 |
| `ndcourts-02` | 2023 Annual Report | 7,167,027 |
| `ndcourts-03` | 2022 Annual Report | 3,602,316 |
| `ndcourts-04` | 2021 Annual Report | 4,853,489 |
| `ndcourts-05` | 2020 Annual Report | 7,360,606 |
| `ndcourts-06` | 2019 Annual Report | 8,937,064 |
| `ndcourts-07` | 2016 Annual Report | 2,547,806 |
| `ndcourts-08` | 2015 Annual Report | 3,277,187 |
| `ndcourts-09` | 2014 Annual Report | 2,737,210 |
| `ndcourts-10` | 2013 Annual Report | 3,240,988 |
| `ndcourts-11` | 2012 Annual Report | 4,744,533 |
| `ndcourts-12` | 2011 Annual Report | 5,981,009 |
| `ndcourts-13` | 2010 Annual Report | 1,682,840 |
| `ndcourts-14` | 2009 Annual Report | 6,576,605 |
| `ndcourts-15` | 2008 Annual Report | 7,418,037 |
| `ndcourts-16` | 2006 Annual Report | 6,491,147 |
| `ndcourts-17` | 2005 Annual Report | 1,108,987 |
| `ndcourts-18` | 2004 Annual Report | 1,208,058 |
| `ndcourts-19` | 2003 Annual Report | 1,367,071 |
| `ndcourts-20` | 2002 Annual Report | 1,114,357 |

Skipped under the source selection rule:

| Year | Reason |
| ---: | --- |
| 2024 | Exceeded 10 MiB cap |
| 2018 | Exceeded 10 MiB cap |
| 2017 | Exceeded 10 MiB cap |
| 2007 | Exceeded 10 MiB cap |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/north-dakota-courts-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/north-dakota-courts-annual-reports-2026-05-26/low-row-diagnostic-r1
```

Decision: `plan_high_impact_targeted_diagnostic`

Recommended lane: `reading_link_order_candidate`

Raw points needed for mean 93: `130`

Lane summary:

| Candidate class | Rows | Raw points |
| --- | ---: | ---: |
| `reading_link_order_candidate` | 3 | 49 |
| `figure_alt_object_candidate` | 1 | 39 |
| `table_target_resolution_needed` | 1 | 35 |
| `no_safe_predicate` | 1 | 34 |
| `near_miss_monitor` | 1 | 1 |

Reading-order shell diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/north-dakota-courts-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/north-dakota-courts-annual-reports-2026-05-26/reading-order-shell-diagnostic-r1
```

Result: `0` sequence candidates, `0` safe route controls, and `1` recovered A-grade route with final orphan debt. The primary low rows had no visible degenerate native reading-order shell attempts, so no reading/link-order promotion is supported.

Figure/alt diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-figure-alt-no-gain-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/north-dakota-courts-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/north-dakota-courts-annual-reports-2026-05-26/figure-alt-no-gain-r1 \
  --include-high-alt
```

Decision: `keep_figure_alt_diagnostic_only`

The diagnostic found `0` scoring candidates and `0` behavior candidates. `ndcourts-01.pdf` still scored poorly, but its checker-visible figure-alt coverage was already complete in the trace (`115/115`), so figure/alt behavior is not the limiting lane.

Table target-resolution diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/table-target-resolution-diagnostic.ts \
  --manifest /mnt/pdf-review/public-holdouts/north-dakota-courts-annual-reports-2026-05-26/download-manifest.json \
  --run /mnt/pdf-review/public-holdouts/north-dakota-courts-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/north-dakota-courts-annual-reports-2026-05-26/table-target-resolution-r1 \
  --pdf ndcourts-06=/mnt/pdf-review/public-holdouts/north-dakota-courts-annual-reports-2026-05-26/input/ndcourts-06.pdf \
  --control ndcourts-03=/mnt/pdf-review/public-holdouts/north-dakota-courts-annual-reports-2026-05-26/input/ndcourts-03.pdf \
  --control ndcourts-04=/mnt/pdf-review/public-holdouts/north-dakota-courts-annual-reports-2026-05-26/input/ndcourts-04.pdf \
  --control ndcourts-07=/mnt/pdf-review/public-holdouts/north-dakota-courts-annual-reports-2026-05-26/input/ndcourts-07.pdf \
  --control ndcourts-08=/mnt/pdf-review/public-holdouts/north-dakota-courts-annual-reports-2026-05-26/input/ndcourts-08.pdf \
  --control ndcourts-11=/mnt/pdf-review/public-holdouts/north-dakota-courts-annual-reports-2026-05-26/input/ndcourts-11.pdf
```

Decision: `keep_table_target_resolution_diagnostic_only`

The diagnostic found `ndcourts-06` as a stable table-shape target, but existing table tools already rejected on PAC-visible annotation/table regressions:

- `normalize_table_structure`: rejected on `pdfua.annotations.tagged_annotations_present`
- `repair_native_table_headers`: rejected on `pdfua.annotations.tagged_annotations_present`
- `set_table_header_cells`: rejected on `pdfua.table.header_association_present`

One same-source A-grade control, `ndcourts-04`, also showed a prior non-table table-target attempt (`normalize_table_structure` resolved to `TR`). That keeps table behavior diagnostic-only.

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source does not clear the 93 mean target: mean `86.50`, median `94`.
- `false_positive_applied=0`, with no timeout/error rows.
- Runtime is already heavy (`p95=207,061 ms`, max `252,324 ms`), so speculative broad validation would carry speed risk.
- Reading/link-order diagnostics found no promotable sequence candidate.
- Figure/alt diagnostics found no behavior candidate; figure-alt coverage was already complete on the main figure row.
- Table diagnostics found object-backed debt, but current table tools are blocked by PAC annotation/table regression guards and a same-source control showed non-table target risk.
- The remaining zero-heading row has no safe object-backed predicate visible from the run artifact.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
