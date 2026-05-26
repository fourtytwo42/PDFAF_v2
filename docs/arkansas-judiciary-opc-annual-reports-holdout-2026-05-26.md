# Arkansas Judiciary OPC Annual Reports Holdout - 2026-05-26

## Source

- Source family: Arkansas Judiciary Office of Professional Conduct annual reports.
- Source index: `https://tstweb.arcourts.gov/professional-conduct/annual-reports`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/arkansas-judiciary-opc-annual-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The sample used one annual report per available year, newest first. The 2009 report was skipped because it exceeded the 10 MiB holdout cap, so the final under-cap set covers 2025 through 2010 plus 2008 through 2005.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/arkansas-judiciary-opc-annual-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/arkansas-judiciary-opc-annual-reports-2026-05-26/run-r1 \
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
| Mean before | 38.10 |
| Mean after | 93.10 |
| Median after | 94 |
| Grades after | 19 A / 0 B / 0 C / 0 D / 1 F |
| Rows below 93 | 1 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 11,550 ms |
| Runtime p95 | 20,634 ms |
| Runtime max | 32,924 ms |

Rows below 93:

| Row | Baseline after | Lowest categories |
| --- | ---: | --- |
| `arcopc-07.pdf` | 59/F | `heading_structure=0`, `table_markup=35`, `pdf_ua_compliance=71`, `reading_order=96`, `text_extractability=96`, `bookmarks=97` |

## Sample

The 20 valid under-10MiB PDFs downloaded from Arkansas Judiciary OPC annual reports were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `arcopc-01` | 2025 Annual Report | 695,955 |
| `arcopc-02` | 2024 Annual Report | 388,155 |
| `arcopc-03` | 2023 Annual Report | 400,999 |
| `arcopc-04` | 2022 Annual Report | 277,366 |
| `arcopc-05` | 2021 Annual Report | 283,255 |
| `arcopc-06` | 2020 Annual Report | 292,815 |
| `arcopc-07` | 2019 Annual Report | 293,778 |
| `arcopc-08` | 2018 Annual Report | 333,955 |
| `arcopc-09` | 2017 Annual Report | 312,181 |
| `arcopc-10` | 2016 Annual Report | 135,611 |
| `arcopc-11` | 2015 Annual Report | 1,505,009 |
| `arcopc-12` | 2014 Annual Report | 1,656,432 |
| `arcopc-13` | 2013 Annual Report | 1,729,079 |
| `arcopc-14` | 2012 Annual Report | 1,687,776 |
| `arcopc-15` | 2011 Annual Report | 221,279 |
| `arcopc-16` | 2010 Annual Report | 209,602 |
| `arcopc-17` | 2008 Annual Report | 219,060 |
| `arcopc-18` | 2007 Annual Report | 312,132 |
| `arcopc-19` | 2006 Annual Report | 331,104 |
| `arcopc-20` | 2005 Annual Report | 237,914 |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/arkansas-judiciary-opc-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/arkansas-judiciary-opc-annual-reports-2026-05-26/low-row-diagnostic-r1
```

Decision: `holdout_target_met`

Recommended lane: `table_target_resolution_needed`

Raw points needed for mean 93: `0`

The only low row, `arcopc-07.pdf`, was a high-impact table/heading residual in the baseline run. Because the source already cleared the 93 mean target, the diagnostic recommendation is evidence only and does not justify promoting table behavior.

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/arkansas-judiciary-opc-annual-reports-2026-05-26/low-repeat-input \
  /mnt/pdf-review/public-holdouts/arkansas-judiciary-opc-annual-reports-2026-05-26/run-low-repeat-r1 \
  --limit 1 \
  --cleanup-row-artifacts
```

Repeat result:

| Row | Baseline after | Repeat after | Repeat runtime |
| --- | ---: | ---: | ---: |
| `arcopc-07.pdf` | 59/F | 92/A | 31,801 ms |

The repeat recovered most of the row without a source change, which points to run-path/analyzer volatility rather than a clean behavior lane. It still remained one point below 93, but `false_positive_applied=0` and the source-level mean stayed above target.

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source clears the 93 mean target: mean `93.10`, median `94`.
- `false_positive_applied=0`, with no timeout/error rows and bounded runtime.
- The only low row is volatile (`59/F` baseline to `92/A` repeat), and the source needs `0` raw points for the mean target.
- The suggested residual lane is table-target resolution, but prior public holdouts show table/header behavior has high PAC regression risk unless a stronger transaction proof is available.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
