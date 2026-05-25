# Maryland Judiciary Annual Reports Holdout - 2026-05-25

## Source

- Source family: Maryland Judiciary annual reports and statistical abstracts.
- Source index: `https://www.mdcourts.gov/publications/annualreports`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-25/` during validation only; PDFs and generated run artifacts are not source-tracked.

The sample used the first 20 valid under-cap PDF links from the annual reports page. Six larger PDF links were skipped by the downloader because they exceeded the 10 MiB cap.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-25/input \
  /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-25/run-r1 \
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
| Mean before | 42.35 |
| Mean after | 86.70 |
| Median after | 95.5 |
| Grades after | 15 A / 0 B / 0 C / 1 D / 4 F |
| Rows below 93 | 5 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 28,933 ms |
| Runtime p95 | 221,707 ms |
| Runtime max | 231,393 ms |

Rows below 93:

| Row | Before | After | Main debt |
| --- | ---: | ---: | --- |
| `mdjudar-11.pdf` | 59 | 59/F | zero-heading/no-safe predicate |
| `mdjudar-13.pdf` | 54 | 69/D | table target-resolution residual |
| `mdjudar-16.pdf` | 48 | 53/F | table target-resolution residual plus reading/alt debt |
| `mdjudar-17.pdf` | 34 | 59/F | table target-resolution residual plus zero-heading debt |
| `mdjudar-19.pdf` | 25 | 59/F | zero-heading/text-extractability residual |

## Sample

The first 20 valid under-10MiB PDFs downloaded from the Maryland Judiciary annual reports page were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `mdjudar-01` | `Maryland Judiciary Judicial Council Annual Report 2020` | 4,377,746 |
| `mdjudar-02` | `FY 2020 Statistical Abstract` | 1,542,870 |
| `mdjudar-03` | `Maryland Judiciary Judicial Council Annual Report 2019` | 2,738,112 |
| `mdjudar-04` | `FY 2019 Statistical Abstract` | 2,286,950 |
| `mdjudar-05` | `Maryland Judiciary Judicial Council Annual Report 2018` | 2,853,301 |
| `mdjudar-06` | `FY 2018 Statistical Abstract` | 797,898 |
| `mdjudar-07` | `Maryland Judiciary Strategic Plan Update December 2017` | 2,011,607 |
| `mdjudar-08` | `FY 2017 Statistical Abstract` | 4,334,711 |
| `mdjudar-09` | `2016 Progress Report - Justice at Work` | 9,502,462 |
| `mdjudar-10` | `FY 2016 Statistical Abstract` | 3,175,111 |
| `mdjudar-11` | `FY 2015 Statistical Abstract` | 1,715,277 |
| `mdjudar-12` | `FY 2014 Statistical Abstract` | 1,688,251 |
| `mdjudar-13` | `FY 2013 Statistical Abstract` | 1,342,555 |
| `mdjudar-14` | `FY 2012 Statistical Abstract` | 1,441,942 |
| `mdjudar-15` | `FY 2011 Statistical Abstract` | 1,179,331 |
| `mdjudar-16` | `FY 2010 Statistical Abstract` | 1,263,563 |
| `mdjudar-17` | `2008-2009 Statistical Digest` | 1,389,068 |
| `mdjudar-18` | `2006-2007 Highlights` | 1,201,629 |
| `mdjudar-19` | `2006-2007 Statistical Report` | 3,442,530 |
| `mdjudar-20` | `2005-2006 Highlights` | 839,111 |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-25/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-25/low-row-diagnostic-r1
```

Decision: `plan_high_impact_targeted_diagnostic`

Recommended lane: `table_target_resolution_needed`

Raw points needed for mean 93: `126`

Lane summary:

| Class | Rows | Raw points |
| --- | ---: | ---: |
| `table_target_resolution_needed` | 3 | 98 |
| `no_safe_predicate` | 2 | 68 |

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-25/low-repeat-input \
  /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-25/low-repeat-r1 \
  --limit 5 \
  --cleanup-row-artifacts
```

Repeat results:

| Row | Baseline after | Repeat after |
| --- | ---: | ---: |
| `mdjudar-11.pdf` | 59/F | 59/F |
| `mdjudar-13.pdf` | 69/D | 69/D |
| `mdjudar-16.pdf` | 53/F | 69/D |
| `mdjudar-17.pdf` | 59/F | 59/F |
| `mdjudar-19.pdf` | 59/F | 80/B |

The repeat kept every low row below 93 and preserved `false_positive_applied=0`, but it also showed some route variance on `mdjudar-16` and `mdjudar-19`.

Table target-resolution diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/table-target-resolution-diagnostic.ts \
  --manifest /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-25/download-manifest.json \
  --run /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-25/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-25/table-target-resolution-r1 \
  --pdf mdjudar-13=/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-25/input/mdjudar-13.pdf \
  --pdf mdjudar-16=/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-25/input/mdjudar-16.pdf \
  --pdf mdjudar-17=/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-25/input/mdjudar-17.pdf \
  --control mdjudar-10=/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-25/input/mdjudar-10.pdf \
  --control mdjudar-12=/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-25/input/mdjudar-12.pdf \
  --control mdjudar-14=/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-25/input/mdjudar-14.pdf \
  --control mdjudar-15=/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-25/input/mdjudar-15.pdf \
  --control mdjudar-18=/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-25/input/mdjudar-18.pdf \
  --control mdjudar-20=/mnt/pdf-review/public-holdouts/maryland-judiciary-annual-reports-2026-05-25/input/mdjudar-20.pdf \
  --control accessible=/home/hendo420/PDFAF_v2/Input/experiment-corpus/00-fixtures/pdfaf_fixture_accessible.pdf
```

Decision: `keep_table_target_resolution_diagnostic_only`

Key diagnostic findings:

- Stable focus candidates: `mdjudar-16`, `mdjudar-17`.
- Unsafe source control candidate: `mdjudar-12`.
- `mdjudar-13` had native layout table evidence but no stable table structure ref.
- Existing table attempts on focus rows already rejected on `pdfua.table.header_association_present` or `pdfua.table.rows_regular`, or returned no useful structural change.

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source does not clear the 93 mean target: mean `86.70`, median `95.5`.
- The dominant residual is table/header debt in old statistical report layouts, but the diagnostic did not prove a safe general production predicate.
- A same-source A-grade control also triggered stable table target evidence, so table admission is not selective enough.
- Existing table tools already hit PAC-visible header/row regression gates on the focus rows.
- The two non-table low rows expose zero-heading/text debt without a safe object-backed heading predicate in the current artifact.
- `false_positive_applied=0`, with no timeout/error rows, but p95 runtime is high at about `222s`.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
