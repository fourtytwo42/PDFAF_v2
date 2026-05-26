# Indiana Supreme Court Annual Reports Holdout - 2026-05-26

## Source

- Source family: Indiana Supreme Court annual reports.
- Source index: `https://www.in.gov/judiciary/supreme/annual-reports/`
- Sample size: 20 PDFs under 10,000,000 bytes.
- Local artifacts: `/mnt/pdf-review/public-holdouts/indiana-supreme-court-annual-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The archive exposes 24 direct annual-report PDFs. All checked PDFs were below the strict decimal 10 MB cap. The selected sample used the newest 20 reports, from 2024-25 through 2005-06.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/indiana-supreme-court-annual-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/indiana-supreme-court-annual-reports-2026-05-26/run-r1 \
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
| Mean after | 87.05 |
| Median after | 91.5 |
| Grades after | 13 A / 4 B / 1 C / 0 D / 2 F |
| Rows below 93 | 13 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 71,267 ms |
| Runtime p95 | 200,147 ms |
| Runtime max | 263,316 ms |

Rows below 93:

| Row | Before | After | Main debt |
| --- | ---: | ---: | --- |
| `insupctar-02.pdf` | 56 | 92/A | near-miss heading/PDF-UA/reading |
| `insupctar-04.pdf` | 57 | 59/F | zero heading plus runtime tail |
| `insupctar-07.pdf` | 33 | 59/F | zero heading, repeat volatile |
| `insupctar-08.pdf` | 59 | 88/B | table/header plus reading/link |
| `insupctar-09.pdf` | 59 | 79/C | table/header plus reading/link/alt/form |
| `insupctar-10.pdf` | 34 | 90/A | near-miss heading/PDF-UA/reading |
| `insupctar-11.pdf` | 46 | 91/A | near-miss heading/PDF-UA/reading |
| `insupctar-12.pdf` | 46 | 91/A | near-miss heading/PDF-UA/reading |
| `insupctar-15.pdf` | 69 | 83/B | reading/link/bookmark/form and table residual |
| `insupctar-16.pdf` | 68 | 86/B | link/bookmark/PDF-UA/table/alt residual |
| `insupctar-17.pdf` | 77 | 80/B | alt/link/bookmark/PDF-UA/table residual |
| `insupctar-18.pdf` | 69 | 92/A | near-miss bookmark/link/heading |
| `insupctar-20.pdf` | 58 | 92/A | near-miss link/form/PDF-UA |

## Sample

The 20 selected PDFs under the decimal 10 MB cap were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `insupctar-01` | Indiana Supreme Court Annual Report 2024-25 | 5,085,022 |
| `insupctar-02` | Indiana Supreme Court Annual Report 2023-24 | 4,845,376 |
| `insupctar-03` | Indiana Supreme Court Annual Report 2022-23 | 6,186,371 |
| `insupctar-04` | Indiana Supreme Court Annual Report 2021-22 | 4,937,556 |
| `insupctar-05` | Indiana Supreme Court Annual Report 2020-21 | 2,934,988 |
| `insupctar-06` | Indiana Supreme Court Annual Report 2019-20 | 4,601,169 |
| `insupctar-07` | Indiana Supreme Court Annual Report 2018-19 | 3,909,331 |
| `insupctar-08` | Indiana Supreme Court Annual Report 2017-18 | 3,227,087 |
| `insupctar-09` | Indiana Supreme Court Annual Report 2016-17 | 4,363,201 |
| `insupctar-10` | Indiana Supreme Court Annual Report 2015-16 | 3,668,377 |
| `insupctar-11` | Indiana Supreme Court Annual Report 2014-15 | 3,016,457 |
| `insupctar-12` | Indiana Supreme Court Annual Report 2013-14 | 3,424,048 |
| `insupctar-13` | Indiana Supreme Court Annual Report 2012-13 | 3,058,377 |
| `insupctar-14` | Indiana Supreme Court Annual Report 2011-12 | 2,853,619 |
| `insupctar-15` | Indiana Supreme Court Annual Report 2010-11 | 2,857,297 |
| `insupctar-16` | Indiana Supreme Court Annual Report 2009-10 | 3,920,534 |
| `insupctar-17` | Indiana Supreme Court Annual Report 2008-09 | 4,693,091 |
| `insupctar-18` | Indiana Supreme Court Annual Report 2007-08 | 3,155,018 |
| `insupctar-19` | Indiana Supreme Court Annual Report 2006-07 | 1,992,122 |
| `insupctar-20` | Indiana Supreme Court Annual Report 2005-06 | 3,641,832 |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/indiana-supreme-court-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/indiana-supreme-court-annual-reports-2026-05-26/low-row-diagnostic-r1
```

Result:

- decision: `plan_medium_impact_targeted_diagnostic`
- recommended lane: `table_target_resolution_needed`
- raw points needed for mean 93: `119`
- lane split: `2` no-safe zero-heading rows, `4` table-target rows, `2` reading/link rows, and `5` near misses

Reading-order shell diagnostic:

- `sequenceCandidateCount=0`
- `safeRouteControlCount=0`
- `selectedRows=[]`

Visible-title/heading-anchor diagnostic:

- `insupctar-04.pdf` and `insupctar-07.pdf` both classified as `existing_internal_anchor_candidate`.
- Recommendation remained to use existing visible-heading paths only; no new source-text fallback was selected.

Figure/alt no-gain diagnostic:

- decision: `keep_figure_alt_diagnostic_only`
- focus rows: `6`
- scoring candidates: `0`
- behavior candidates: `0`

Table target-resolution diagnostic:

- primary-run decision: `plan_table_target_behavior_proof`
- stable focus candidates: `insupctar-08`, `insupctar-09`, `insupctar-16`, `insupctar-17`
- unsafe sampled controls: none
- repeat-run decision: `plan_table_target_behavior_proof`
- repeat stable focus candidates: `insupctar-08`, `insupctar-09`, `insupctar-15`, `insupctar-16`, `insupctar-17`

Important caveat: this is planning evidence, not an accepted behavior change. These rows already exercised existing table tools, and the repeated tool traces included PAC header-association regressions, `no_effect` outcomes, and non-table debts below current Stage180 safety gates. Lowering those gates would be a behavior change requiring a separate proof against controls and original-50 quality/speed, so no table behavior was promoted from this source.

Focused low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/indiana-supreme-court-annual-reports-2026-05-26/repeat-low-input \
  /mnt/pdf-review/public-holdouts/indiana-supreme-court-annual-reports-2026-05-26/run-low-repeat-r1 \
  --limit 7 \
  --cleanup-row-artifacts
```

Result:

| Row | Primary | Repeat | Delta |
| --- | ---: | ---: | ---: |
| `insupctar-04.pdf` | 59/F | 59/F | 0 |
| `insupctar-07.pdf` | 59/F | 97/A | +38 |
| `insupctar-08.pdf` | 88/B | 87/B | -1 |
| `insupctar-09.pdf` | 79/C | 85/B | +6 |
| `insupctar-15.pdf` | 83/B | 78/C | -5 |
| `insupctar-16.pdf` | 86/B | 90/A | +4 |
| `insupctar-17.pdf` | 80/B | 88/B | +8 |

Repeat low-row diagnostic:

- decision: `plan_medium_impact_targeted_diagnostic`
- recommended lane: `table_target_resolution_needed`
- raw points needed for mean 93 over the seven repeated rows: `67`
- lane split: `5` table-target rows and `1` no-safe zero-heading row

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The 20-PDF source missed the requested 93+ mean and median target, with mean `87.05` and median `91.5`.
- One hard zero-heading row was stable at `59/F`, while the other hard row recovered to `97/A` on repeat, showing route/analyzer volatility.
- Table target-resolution evidence is real and potentially useful, but current table tools already fired and often produced `no_effect` or PAC header-association regressions on repeat.
- The table rows also had low reading, link, alt, bookmark, or form debt, so broadening Stage180 table routing would lower safety gates rather than prove a narrow missing repair.
- Runtime was bounded but high: p95 `200,147 ms`, max `263,316 ms`, with no hard timeouts.
- `false_positive_applied=0`.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
