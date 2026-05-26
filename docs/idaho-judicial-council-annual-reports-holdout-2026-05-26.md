# Idaho Judicial Council Annual Reports Holdout - 2026-05-26

## Source

- Source family: Idaho Judicial Council annual reports.
- Source index: `https://judicialcouncil.idaho.gov/report_cov.htm`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/idaho-judicial-council-annual-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The sample used the newest 20 available under-cap annual report PDFs, covering 2024 through 2005.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/idaho-judicial-council-annual-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/idaho-judicial-council-annual-reports-2026-05-26/run-r1 \
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
| Mean before | 27.65 |
| Mean after | 91.80 |
| Median after | 96.5 |
| Grades after | 17 A / 1 B / 1 C / 0 D / 1 F |
| Rows below 93 | 5 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 22,510 ms |
| Runtime p95 | 29,805 ms |
| Runtime max | 36,423 ms |

Rows below 93:

| Row | Baseline after | Diagnostic class |
| --- | ---: | --- |
| `idjc-03.pdf` | 91/A | `near_miss_monitor` |
| `idjc-04.pdf` | 74/C | `metadata_pdfua_candidate` |
| `idjc-05.pdf` | 92/A | `near_miss_monitor` |
| `idjc-06.pdf` | 87/B | `no_safe_predicate` |
| `idjc-08.pdf` | 51/F | `reading_link_order_candidate` |

## Sample

The 20 valid under-10MiB PDFs downloaded from Idaho Judicial Council annual reports were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `idjc-01` | 2024 Annual Report | 1,621,924 |
| `idjc-02` | 2023 Annual Report | 1,591,921 |
| `idjc-03` | 2022 Annual Report | 1,436,915 |
| `idjc-04` | 2021 Annual Report | 1,315,063 |
| `idjc-05` | 2020 Annual Report | 3,323,499 |
| `idjc-06` | 2019 Annual Report | 3,122,015 |
| `idjc-07` | 2018 Annual Report | 6,608,658 |
| `idjc-08` | 2017 Annual Report | 6,779,800 |
| `idjc-09` | 2016 Annual Report | 7,540,574 |
| `idjc-10` | 2015 Annual Report | 1,243,743 |
| `idjc-11` | 2014 Annual Report | 963,928 |
| `idjc-12` | 2013 Annual Report | 434,668 |
| `idjc-13` | 2012 Annual Report | 1,017,383 |
| `idjc-14` | 2011 Annual Report | 634,924 |
| `idjc-15` | 2010 Annual Report | 1,150,984 |
| `idjc-16` | 2009 Annual Report | 1,189,009 |
| `idjc-17` | 2008 Annual Report | 1,073,848 |
| `idjc-18` | 2007 Annual Report | 414,130 |
| `idjc-19` | 2006 Annual Report | 2,932,918 |
| `idjc-20` | 2005 Annual Report | 2,977,641 |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/idaho-judicial-council-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/idaho-judicial-council-annual-reports-2026-05-26/low-row-diagnostic-r1
```

Decision: `plan_high_impact_targeted_diagnostic`

Recommended lane: `reading_link_order_candidate`

Raw points needed for mean 93: `24`

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/idaho-judicial-council-annual-reports-2026-05-26/low-repeat-input \
  /mnt/pdf-review/public-holdouts/idaho-judicial-council-annual-reports-2026-05-26/run-low-repeat-r1 \
  --limit 5 \
  --cleanup-row-artifacts
```

Repeat result over the 5 sub-93 baseline rows:

| Row | Baseline after | Repeat after | Repeat runtime |
| --- | ---: | ---: | ---: |
| `idjc-03.pdf` | 91/A | 91/A | 27,564 ms |
| `idjc-04.pdf` | 74/C | 87/B | 32,435 ms |
| `idjc-05.pdf` | 92/A | 87/B | 27,245 ms |
| `idjc-06.pdf` | 87/B | 94/A | 21,210 ms |
| `idjc-08.pdf` | 51/F | 51/F | 12,737 ms |

The repeat confirmed `idjc-08.pdf` as the stable high-impact failure. Other low rows showed route/analyzer movement and are weaker behavior evidence.

Reading-order shell diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/idaho-judicial-council-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/idaho-judicial-council-annual-reports-2026-05-26/reading-order-shell-diagnostic-r1
```

Result: `0` sequence candidates, `0` safe route controls, and no visible `repair_degenerate_native_reading_order_shell` attempts. The stable `idjc-08.pdf` failure had `heading_structure=0`, `reading_order=30`, link quality clean, and no existing safe reading-order route exposed by the run artifact.

PDF/UA catalog syntax diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/pdfua-catalog-syntax-diagnostic.ts \
  --pdf /mnt/pdf-review/public-holdouts/idaho-judicial-council-annual-reports-2026-05-26/input/idjc-04.pdf \
  --pdf /mnt/pdf-review/public-holdouts/idaho-judicial-council-annual-reports-2026-05-26/input/idjc-01.pdf \
  --pdf /mnt/pdf-review/public-holdouts/idaho-judicial-council-annual-reports-2026-05-26/input/idjc-02.pdf \
  --pdf /mnt/pdf-review/public-holdouts/idaho-judicial-council-annual-reports-2026-05-26/input/idjc-08.pdf \
  --out /mnt/pdf-review/public-holdouts/idaho-judicial-council-annual-reports-2026-05-26/pdfua-catalog-syntax-r1 \
  --limit 4
```

Decision: `keep_pdfua_catalog_syntax_diagnostic_only`

All four inspected rows were classified as `catalog_baseline_score_active` with action `already_score_active`; the catalog/PDF-UA debt is already visible to the scorer and does not justify a new scoring or planner rule.

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source does not clear the 93 mean target: mean `91.80`, median `96.5`.
- `false_positive_applied=0`, with no timeout/error rows and bounded runtime.
- The stable high-impact row is a reading/heading failure, but the trace exposes no existing safe native reading-order shell route or object-backed heading target.
- The PDF/UA catalog row is already score-active, so a new native scoring rule would be redundant rather than a parity improvement.
- The remaining low rows are volatile or low-upside near misses.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
