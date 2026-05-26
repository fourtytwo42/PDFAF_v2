# California Courts Statistics Reports Holdout - 2026-05-26

## Source

- Source family: California Judicial Branch Court Statistics Reports.
- Source page: `https://courts.ca.gov/news-reference/research-data/court-statistics`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/california-courts-statistics-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The source page exposes official direct PDF reports. The current-site mirrored URLs were used for older reports because legacy `www4.courts.ca.gov` links returned Cloudflare 403 responses from this VM. The 2020 report was excluded because it is over the 10 MiB cap (`12,047,339` bytes). The final sample used 2026, 2025, 2024, 2023, 2022, 2021, and 2019 through 2006.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/california-courts-statistics-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/california-courts-statistics-reports-2026-05-26/run-r1 \
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
| Processed | 16/20 completed |
| Mean before | 46.3125 |
| Mean after completed rows | 67.9375 |
| Mean after all rows | 54.3500 |
| Median after all rows | 59 |
| Grades after | 1 A / 2 B / 1 C / 4 D / 8 F / 4 timeout |
| Rows below 93 | 19 |
| Timeout/error rows | 4 |
| `false_positive_applied` | 0 |
| Runtime p50 | 227,819 ms |
| Runtime p95 | 300,023 ms |
| Runtime max | 300,097 ms |

Rows below 93 or timed out:

| Row | Baseline after | Runtime | Primary residual |
| --- | ---: | ---: | --- |
| `cacsr-01.pdf` | 58/F | 251,986 ms | Stable table/reading/PDF-UA/alt debt after existing table tools |
| `cacsr-02.pdf` | 58/F | 300,097 ms | Stable table and figure-alt partial coverage; header association PAC regression |
| `cacsr-03.pdf` | 0/? | 300,013 ms | Hard timeout |
| `cacsr-04.pdf` | 0/? | 300,020 ms | Hard timeout |
| `cacsr-05.pdf` | 57/F | 246,298 ms | Metadata/PDF-UA plus table/alt debt; no isolated safe lane |
| `cacsr-06.pdf` | 0/? | 300,005 ms | Hard timeout |
| `cacsr-07.pdf` | 79/C | 214,398 ms | Table/PDF-UA/reading residual |
| `cacsr-08.pdf` | 59/F | 226,545 ms | Stable table/reading/PDF-UA/alt debt after existing table tools |
| `cacsr-10.pdf` | 58/F | 252,499 ms | Figure-alt partial coverage plus table/reading debt |
| `cacsr-11.pdf` | 59/F | 227,819 ms | Metadata/PDF-UA plus table/alt debt; no isolated safe lane |
| `cacsr-12.pdf` | 69/D | 215,967 ms | Metadata/PDF-UA plus table/alt debt; no isolated safe lane |
| `cacsr-13.pdf` | 69/D | 227,899 ms | Stable table transaction residual after existing table tools |
| `cacsr-14.pdf` | 0/? | 300,023 ms | Hard timeout |
| `cacsr-15.pdf` | 84/B | 239,730 ms | Metadata/PDF-UA plus alt/reading debt; low-upside row |
| `cacsr-16.pdf` | 59/F | 219,629 ms | Stable table/alt/PDF-UA residual after existing table tools |
| `cacsr-17.pdf` | 86/B | 32,038 ms | Mixed heading/table/PDF-UA residual |
| `cacsr-18.pdf` | 59/F | 41,983 ms | Zero-heading residual; no safe reading shell |
| `cacsr-19.pdf` | 69/D | 59,408 ms | Prior non-table table-header target attempt |
| `cacsr-20.pdf` | 69/D | 194,040 ms | Prior non-table table-header target attempt and figure-alt PAC guard |

## Sample

The 20 valid under-10MiB PDFs were:

| Row | Report | Bytes |
| --- | --- | ---: |
| `cacsr-01` | 2026 Court Statistics Report | 5,018,915 |
| `cacsr-02` | 2025 Court Statistics Report | 6,099,998 |
| `cacsr-03` | 2024 Court Statistics Report | 7,578,127 |
| `cacsr-04` | 2023 Court Statistics Report | 5,594,903 |
| `cacsr-05` | 2022 Court Statistics Report | 4,926,114 |
| `cacsr-06` | 2021 Court Statistics Report | 8,393,555 |
| `cacsr-07` | 2019 Court Statistics Report | 3,922,972 |
| `cacsr-08` | 2018 Court Statistics Report | 9,556,601 |
| `cacsr-09` | 2017 Court Statistics Report | 4,536,549 |
| `cacsr-10` | 2016 Court Statistics Report | 4,392,069 |
| `cacsr-11` | 2015 Court Statistics Report | 5,763,231 |
| `cacsr-12` | 2014 Court Statistics Report | 6,104,584 |
| `cacsr-13` | 2013 Court Statistics Report | 6,456,271 |
| `cacsr-14` | 2012 Court Statistics Report | 5,705,631 |
| `cacsr-15` | 2011 Court Statistics Report | 4,964,382 |
| `cacsr-16` | 2010 Court Statistics Report | 2,485,085 |
| `cacsr-17` | 2009 Court Statistics Report | 1,815,114 |
| `cacsr-18` | 2008 Court Statistics Report | 2,511,434 |
| `cacsr-19` | 2007 Court Statistics Report | 1,481,200 |
| `cacsr-20` | 2006 Court Statistics Report | 2,667,445 |

Excluded under the source-family selection rule:

| Report | Reason |
| --- | --- |
| 2020 Court Statistics Report | Over 10 MiB (`12,047,339` bytes) |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/california-courts-statistics-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/california-courts-statistics-reports-2026-05-26/low-row-diagnostic-r1
```

Decision: `plan_high_impact_targeted_diagnostic`

Recommended lane: `table_target_resolution_needed`

Raw points needed for mean 93: `773`

Lane split:

| Lane | Rows | Raw points |
| --- | ---: | ---: |
| `timeout_or_error` | 4 | 372 |
| `table_target_resolution_needed` | 9 | 231 |
| `metadata_pdfua_candidate` | 4 | 103 |
| `figure_alt_object_candidate` | 1 | 35 |
| `no_safe_predicate` | 1 | 34 |

Table target-resolution diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/table-target-resolution-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/california-courts-statistics-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/california-courts-statistics-reports-2026-05-26/table-target-resolution-r1 \
  --pdf cacsr-01=/mnt/pdf-review/public-holdouts/california-courts-statistics-reports-2026-05-26/input/cacsr-01.pdf \
  --pdf cacsr-02=/mnt/pdf-review/public-holdouts/california-courts-statistics-reports-2026-05-26/input/cacsr-02.pdf \
  --pdf cacsr-08=/mnt/pdf-review/public-holdouts/california-courts-statistics-reports-2026-05-26/input/cacsr-08.pdf \
  --pdf cacsr-13=/mnt/pdf-review/public-holdouts/california-courts-statistics-reports-2026-05-26/input/cacsr-13.pdf \
  --pdf cacsr-16=/mnt/pdf-review/public-holdouts/california-courts-statistics-reports-2026-05-26/input/cacsr-16.pdf \
  --pdf cacsr-19=/mnt/pdf-review/public-holdouts/california-courts-statistics-reports-2026-05-26/input/cacsr-19.pdf \
  --pdf cacsr-20=/mnt/pdf-review/public-holdouts/california-courts-statistics-reports-2026-05-26/input/cacsr-20.pdf \
  --control cacsr-09=/mnt/pdf-review/public-holdouts/california-courts-statistics-reports-2026-05-26/input/cacsr-09.pdf
```

Decision: `plan_table_target_behavior_proof`

Evidence:

- stable focus candidates: `cacsr-01`, `cacsr-08`, `cacsr-13`, `cacsr-16`
- unsafe control candidates: none
- prior non-table target rows: `cacsr-02`, `cacsr-19`, `cacsr-20`

This is useful evidence for the broader table transaction lane, but it is not enough for an accepted behavior change from this source. The baseline tool timeline already shows existing table tools ran on the stable focus rows:

| Row | Existing table outcome |
| --- | --- |
| `cacsr-01` | `normalize_table_structure` and `repair_native_table_headers` applied, final stayed `58/F` |
| `cacsr-08` | `normalize_table_structure` and `repair_native_table_headers` applied, final stayed `59/F` |
| `cacsr-13` | `normalize_table_structure` and `repair_native_table_headers` applied, final stayed `69/D` |
| `cacsr-16` | `repair_native_table_headers` applied and normalization no-effected, final stayed `59/F` |
| `cacsr-02` | `set_table_header_cells` rejected on `pdfua.table.header_association_present` regression |
| `cacsr-19` | `set_table_header_cells` resolved to a non-table `P` target |
| `cacsr-20` | later table/header attempts hit figure-alt PAC regression |

Figure/alt diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-figure-alt-no-gain-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/california-courts-statistics-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/california-courts-statistics-reports-2026-05-26/figure-alt-no-gain-r1 \
  --include-high-alt
```

Decision: `keep_figure_alt_diagnostic_only`

Evidence:

- `checker_alt_partial_existing_bound`: `cacsr-02`, `cacsr-10`
- `low_alt_no_alt_tool_evidence`: eight rows
- `timeout_or_error`: four rows
- `0` behavior candidates and `0` scoring candidates

Reading-order shell diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/california-courts-statistics-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/california-courts-statistics-reports-2026-05-26/reading-order-shell-diagnostic-r1
```

Result:

- `sequenceCandidateCount=0`
- `safeRouteControlCount=0`
- `selectedRows=[]`

## Decision

No source behavior was accepted from this holdout.

This source is a useful stress set, but not a safe source-local behavior proof. It exposes a combination of hard runtime timeouts, very large statistical-report table debt, figure-alt partial coverage, and already-score-active PDF/UA/catalog debt. The cleanest table diagnostic still does not prove a new planner admission, because existing table tools already ran on the object-backed focus rows and did not recover the rows. Other rows had non-table table-header targets or honest PAC regression guards.

The next table work should be a separate transaction-quality stage that proves final PAC table/header debt reduction or preservation after mutation, not another broad table admission rule. No original-50 regression validation was required because no scoring, planning, analyzer, or remediation behavior changed. Downloaded public PDFs and generated artifacts should remain local only and were deleted after metrics extraction.
