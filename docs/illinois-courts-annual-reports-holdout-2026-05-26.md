# Illinois Courts Annual Reports Holdout - 2026-05-26

## Source

- Source page: https://www.illinoiscourts.gov/reports/annual-report-illinois-courts/
- Sample: newest 20 annual-report, administrative-summary, or statistical-summary PDFs on the official Illinois Courts annual-report page that passed the strict decimal `10,000,000` byte cap.
- Size gate: every selected PDF was verified as an actual PDF under the cap before validation.
- Selection note: oversized newer summaries were skipped. The final sample spans 2024 plus under-cap summaries from 2022 through 2009.

## Sample

| Row | PDF |
| --- | --- |
| `ilcourtsar-01` | 2024 Annual Report |
| `ilcourtsar-02` | 2022 Annual Report Statistical Summary |
| `ilcourtsar-03` | 2021 Annual Report Statistical Summary |
| `ilcourtsar-04` | 2020 Annual Report Administrative Summary |
| `ilcourtsar-05` | 2020 Annual Report Statistical Summary |
| `ilcourtsar-06` | 2019 Annual Report |
| `ilcourtsar-07` | 2019 Statistical Summary |
| `ilcourtsar-08` | 2018 Administrative Summary |
| `ilcourtsar-09` | 2017 Statistical Summary |
| `ilcourtsar-10` | 2016 Admin Summary |
| `ilcourtsar-11` | 2016 Statistical Summary |
| `ilcourtsar-12` | 2014 Administrative Summary |
| `ilcourtsar-13` | 2014 Statistical Summary |
| `ilcourtsar-14` | 2013 Administrative Summary |
| `ilcourtsar-15` | 2013 Statistical Summary |
| `ilcourtsar-16` | 2012 Administrative Summary |
| `ilcourtsar-17` | 2012 Statistical Summary |
| `ilcourtsar-18` | 2011 Administrative Summary |
| `ilcourtsar-19` | 2010 Statistical Summary |
| `ilcourtsar-20` | 2009 Statistical Summary |

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/illinois-courts-annual-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/illinois-courts-annual-reports-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Result:

- Processed: `20/20`
- Mean: `80.45`
- Median: `93`
- Grades: `13 A / 0 B / 0 C / 0 D / 7 F`
- Rows below `93`: `8`
- Rows below `95`: `15`
- p50/p95/max: `39958ms / 276674ms / 300088ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

Rows:

| Row | Before | After | Main residual |
| --- | ---: | ---: | --- |
| `ilcourtsar-01` | `46/F` | `94/A` | near-miss reading order |
| `ilcourtsar-02` | `35/F` | `42/F` | heading, alt, reading order, PDF/UA |
| `ilcourtsar-03` | `31/F` | `59/F` | alt/PDF-UA |
| `ilcourtsar-04` | `46/F` | `93/A` | near-miss reading order |
| `ilcourtsar-05` | `31/F` | `59/F` | alt/PDF-UA/title |
| `ilcourtsar-06` | `46/F` | `93/A` | near-miss reading/bookmark |
| `ilcourtsar-07` | `33/F` | `91/A` | heading/reading/PDF-UA near miss |
| `ilcourtsar-08` | `33/F` | `96/A` | completed |
| `ilcourtsar-09` | `40/F` | `53/F` | heading, table, alt |
| `ilcourtsar-10` | `56/F` | `93/A` | near-miss link/PDF-UA |
| `ilcourtsar-11` | `33/F` | `97/A` | completed |
| `ilcourtsar-12` | `41/F` | `97/A` | completed |
| `ilcourtsar-13` | `41/F` | `51/F` | heading/reading |
| `ilcourtsar-14` | `30/F` | `94/A` | near-miss PDF-UA/reading |
| `ilcourtsar-15` | `33/F` | `97/A` | completed |
| `ilcourtsar-16` | `35/F` | `93/A` | near-miss PDF-UA/reading |
| `ilcourtsar-17` | `29/F` | `59/F` | zero-heading |
| `ilcourtsar-18` | `40/F` | `93/A` | near-miss PDF-UA/reading |
| `ilcourtsar-19` | `28/F` | `96/A` | completed |
| `ilcourtsar-20` | `40/F` | `59/F` | zero-heading |

## Repeat

The eight below-93 rows were repeated in three small chunks with the same deterministic no-semantic/no-PDF path.

Repeat result:

- Rows: `8`
- Mean: `58.00`
- Grades: `1 A / 0 B / 0 C / 0 D / 7 F`
- p50/p95/max: `127297ms / 300073ms / 300073ms`
- `false_positive_applied`: `0`

Repeat rows:

| Row | Primary | Repeat |
| --- | ---: | ---: |
| `ilcourtsar-02` | `42/F` | `42/F` |
| `ilcourtsar-03` | `59/F` | `59/F` |
| `ilcourtsar-05` | `59/F` | `59/F` |
| `ilcourtsar-07` | `91/A` | `91/A` |
| `ilcourtsar-09` | `53/F` | `44/F` |
| `ilcourtsar-13` | `51/F` | `51/F` |
| `ilcourtsar-17` | `59/F` | `59/F` |
| `ilcourtsar-20` | `59/F` | `59/F` |

The low cluster is stable enough to treat as real outside-corpus debt rather than one-run volatility.

## Diagnostics

Low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `reading_link_order_candidate`
- Raw points needed for source mean `93`: `251`
- Timeout/error rows: `0`
- Lane split:
  - `reading_link_order_candidate`: `ilcourtsar-02`, `ilcourtsar-13`
  - `metadata_pdfua_candidate`: `ilcourtsar-03`, `ilcourtsar-05`
  - `table_target_resolution_needed`: `ilcourtsar-09`
  - `no_safe_predicate`: `ilcourtsar-17`, `ilcourtsar-20`
  - `near_miss_monitor`: `ilcourtsar-07`

Reading-order shell diagnostic:

- `safeRouteControlCount`: `0`
- `sequenceCandidateCount`: `0`
- `finalOrphanDebtCount`: `0`
- Selected rows: none

Figure/alt diagnostic:

- Decision: `keep_figure_alt_diagnostic_only`
- Focus rows: `5`
- Behavior candidates: `0`
- Scoring candidates: `0`
- Low-alt rows had no visible figure-alt tool evidence in the run artifact.

Table target-resolution diagnostic:

- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidate: `ilcourtsar-09`
- Unsafe sampled controls: none
- Behavior was not promoted because this is a single stable table focus row, existing table tools already fired on it, and the repeat score worsened to `44/F`.

PDF/UA catalog diagnostic:

- The diagnostic classified `ilcourtsar-04` and `ilcourtsar-06` as catalog-settings behavior candidates, but those rows already finished as A-grade rows in the actual remediation run.
- The true metadata/PDF-UA lows `ilcourtsar-03` and `ilcourtsar-05` were classified as optional catalog diagnostic gaps rather than safe behavior candidates.
- No catalog behavior change is justified from this source without a separate proof that targets final low rows and controls.

## Decision

No source change was accepted for this holdout.

This source is useful because it exposes stable outside-corpus debt in Illinois Courts report PDFs, especially reading/heading, figure/alt target discovery, and table/header transaction behavior. It does not yet support a general engine change: the reading shell has no safe sequence, figure-alt has no target evidence, table evidence is only one row with prior attempts already applied, and catalog evidence does not line up with the final low rows.

No original-50 validation was required because no scoring, planning, remediation, API, or Docker behavior changed. Downloaded PDFs and generated validation artifacts are local scratch only and should be deleted after this report is recorded.
