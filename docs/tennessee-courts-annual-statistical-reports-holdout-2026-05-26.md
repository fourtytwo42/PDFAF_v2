# Tennessee Courts Annual Statistical Reports Holdout - 2026-05-26

## Source

- Source family: Tennessee Administrative Office of the Courts annual statistical reports.
- Source index: `https://www.tncourts.gov/media/statistical-reports`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/tennessee-courts-annual-statistical-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The sample used annual statistical reports newest first. The 2018-2019 candidate failed the capped download or exceeded the 10 MiB guard, so the under-cap set continued through 2004-2005.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/tennessee-courts-annual-statistical-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/tennessee-courts-annual-statistical-reports-2026-05-26/run-r1 \
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
| Mean before | 34.15 |
| Mean after | 76.90 |
| Median after | 82 |
| Grades after | 4 A / 8 B / 0 C / 2 D / 6 F |
| Rows below 93 | 18 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 82,427 ms |
| Runtime p95 | 264,160 ms |
| Runtime max | 292,570 ms |

Rows below 93:

| Row | Baseline after | Primary residual |
| --- | ---: | --- |
| `tncourts-01.pdf` | 83/B | No safe predicate from run artifact; text/PDF-UA/reading residual |
| `tncourts-02.pdf` | 85/B | Table target-resolution debt |
| `tncourts-03.pdf` | 82/B | Table target-resolution debt |
| `tncourts-04.pdf` | 87/B | Table target-resolution debt |
| `tncourts-05.pdf` | 82/B | Table target-resolution debt |
| `tncourts-06.pdf` | 87/B | Table target-resolution debt |
| `tncourts-07.pdf` | 69/D | Table target-resolution debt |
| `tncourts-08.pdf` | 81/B | Metadata/PDF-UA catalog residual |
| `tncourts-09.pdf` | 92/A | Metadata/PDF-UA near miss |
| `tncourts-10.pdf` | 84/B | Table target-resolution debt |
| `tncourts-12.pdf` | 59/F | Zero-heading/no-safe predicate |
| `tncourts-13.pdf` | 59/F | Zero-heading/no-safe predicate |
| `tncourts-14.pdf` | 92/A | Near miss |
| `tncourts-15.pdf` | 59/F | Figure/alt target discovery needed |
| `tncourts-16.pdf` | 59/F | Figure/alt target discovery needed |
| `tncourts-17.pdf` | 69/D | Table target-resolution debt with prior non-table attempt |
| `tncourts-18.pdf` | 59/F | Figure/alt target discovery needed |
| `tncourts-19.pdf` | 59/F | Zero-heading/no-safe predicate |

## Sample

The 20 valid under-10MiB PDFs downloaded from Tennessee Courts annual statistical reports were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `tncourts-01` | 2024-2025 Annual Statistical Report | 4,810,302 |
| `tncourts-02` | 2023-2024 Annual Statistical Report | 4,533,289 |
| `tncourts-03` | 2022-2023 Annual Statistical Report | 4,872,627 |
| `tncourts-04` | 2021-2022 Annual Statistical Report | 4,616,497 |
| `tncourts-05` | 2020-2021 Annual Statistical Report | 4,465,365 |
| `tncourts-06` | 2019-2020 Annual Statistical Report | 4,452,208 |
| `tncourts-07` | 2017-2018 Annual Statistical Report | 3,716,250 |
| `tncourts-08` | 2016-2017 Annual Statistical Report | 3,193,873 |
| `tncourts-09` | 2015-2016 Annual Statistical Report | 3,478,649 |
| `tncourts-10` | 2014-2015 Annual Statistical Report | 3,429,055 |
| `tncourts-11` | 2013-2014 Annual Statistical Report | 3,402,873 |
| `tncourts-12` | 2012-2013 Annual Statistical Report | 4,930,161 |
| `tncourts-13` | 2011-2012 Annual Statistical Report | 5,027,338 |
| `tncourts-14` | 2010-2011 Annual Statistical Report | 5,142,377 |
| `tncourts-15` | 2009-2010 Annual Statistical Report | 6,279,756 |
| `tncourts-16` | 2008-2009 Annual Statistical Report | 5,711,427 |
| `tncourts-17` | 2007-2008 Annual Statistical Report | 5,127,691 |
| `tncourts-18` | 2006-2007 Annual Statistical Report | 1,364,615 |
| `tncourts-19` | 2005-2006 Annual Statistical Report | 1,543,735 |
| `tncourts-20` | 2004-2005 Annual Statistical Report | 474,260 |

Skipped candidates:

| Title | Reason |
| --- | --- |
| 2018-2019 Annual Statistical Report | Capped download failed or exceeded 10 MiB |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/tennessee-courts-annual-statistical-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/tennessee-courts-annual-statistical-reports-2026-05-26/low-row-diagnostic-r1
```

Decision: `plan_high_impact_targeted_diagnostic`

Recommended lane: `figure_alt_target_discovery_needed`

Raw points needed for mean 93: `322`

Lane split:

| Lane | Rows | Raw points |
| --- | ---: | ---: |
| `no_safe_predicate` | 4 | 112 |
| `figure_alt_target_discovery_needed` | 3 | 102 |
| `table_target_resolution_needed` | 8 | 99 |
| `metadata_pdfua_candidate` | 2 | 13 |
| `near_miss_monitor` | 1 | 1 |

Focused diagnostics:

- Figure/alt no-gain diagnostic decision: `keep_figure_alt_diagnostic_only`; `0` scoring candidates and `0` behavior candidates.
- Table target-resolution diagnostic decision: `plan_table_target_behavior_proof`; `7` stable object-backed focus candidates, `0` unsafe same-source controls, and `tncourts-17` as a prior non-table target row.
- Table/structure sequence probe on `tncourts-02` and `tncourts-07`: `0` safe sequence candidates and `14` harmful PAC-regression classifications. Existing table/header sequences are therefore not acceptable from this source evidence alone.
- Reading-order shell diagnostic: `0` sequence candidates and `0` safe route controls.
- PDF/UA catalog syntax diagnostic on `tncourts-08` and `tncourts-09`: `keep_pdfua_catalog_syntax_diagnostic_only`.

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source is a real outside-corpus miss: mean `76.90`, median `82`, with `322` raw points needed for mean `93`.
- `false_positive_applied=0`, with no timeout/error rows, so the low scores are meaningful rather than failed execution.
- Figure/alt and reading/heading diagnostics did not expose a safe behavior predicate.
- Table target-resolution evidence is promising and structural, but the representative sequence probe showed harmful PAC regressions rather than safe score/PAC debt reduction.
- The metadata/PDF-UA lane is too low-upside and remained diagnostic-only.

This source should feed future table/header transaction design, especially the repeated stable object-backed table targets with clean same-source controls. It does not justify broadening table/header mutation or PAC acceptance in the main remediation path yet.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
