# Iowa Judicial Branch Publications Holdout - 2026-05-25

## Source

- Source family: Iowa Judicial Branch publications through Iowa Publications Online.
- Source index: `https://publications.iowa.gov/view/department/Judicial%3D5FBranch.type.html`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/iowa-judicial-branch-publications-2026-05-25/` during validation only; PDFs and generated run artifacts are not source-tracked.

The crawler used bounded `curl` requests with per-request timeouts and `--max-filesize 10485760`. One candidate PDF exceeded the 10 MiB cap and was skipped before the first 20 valid under-cap PDFs were collected.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/iowa-judicial-branch-publications-2026-05-25/input \
  /mnt/pdf-review/public-holdouts/iowa-judicial-branch-publications-2026-05-25/run-r1 \
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
| Mean before | 43.20 |
| Mean after | 92.95 |
| Median after | 93.5 |
| Grades after | 18 A / 1 B / 0 C / 1 D / 0 F |
| Rows below 93 | 3 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 11,131 ms |
| Runtime p95 | 61,064 ms |
| Runtime max | 269,655 ms |

Rows below 93:

| Row | Before | After | Main debt |
| --- | ---: | ---: | --- |
| `iajud-07.pdf` | 59 | 89/B | reading-order residual |
| `iajud-08.pdf` | 51 | 69/D | table markup/header-association residual |
| `iajud-15.pdf` | 59 | 91/A | mild heading/reading near miss |

## Sample

The first 20 valid under-10MiB PDFs downloaded from the Iowa Publications Online Judicial Branch listing were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `iajud-01` | `Judicial Branch Budget, FY 2025` | 161,452 |
| `iajud-02` | `2025 Condition of the Judiciary, Susan Larson Christensen, Chief Justice of the Iowa Supreme Court, January 15, 2025` | 2,890,131 |
| `iajud-03` | `Judicial Branch Budget, FY 2024` | 161,899 |
| `iajud-04` | `Office of the State Public Defender Strategic Plan, FY2025, April 1, 2024` | 136,501 |
| `iajud-05` | `Judicial Branch Budget, FY 2023` | 545,461 |
| `iajud-06` | `Office of the State Public Defender Agency Performance Plan, FY2022` | 135,165 |
| `iajud-07` | `FFPSA: Family First Prevention Services Act, September 7, 2021` | 750,764 |
| `iajud-08` | `Iowa Child Support Guidelines Review Committee Final Report, June 2021` | 7,146,485 |
| `iajud-09` | `Iowa Problem Solving Courts, February 8, 2021` | 522,490 |
| `iajud-10` | `FFPSA: Task Force Report: Recommendation for Implementation, February 3, 2021` | 2,660,670 |
| `iajud-11` | `Iowa Judicial Branch 2020 Annual Report, January 12, 2021` | 9,751,902 |
| `iajud-12` | `Judicial Branch Budgets, Iowa Budget Report, 2022-2023, January 10, 2021` | 550,132 |
| `iajud-13` | `Racial Disparities: An Analysis of Three Decision Points in Iowa's Juvenile Justice System, November 30, 2020` | 1,375,849 |
| `iajud-14` | `Iowa Access to Justice 2020 Report, August 17, 2020` | 9,392,072 |
| `iajud-15` | `FFPSA: Family First Prevention Services Act, February 26, 2020` | 1,046,271 |
| `iajud-16` | `Iowa Judicial Branch 2019 Annual Report Iowa's Community Based Court System, January 13, 2020` | 8,429,072 |
| `iajud-17` | `Iowa Supreme Court Access to Justice Commission, July 2019` | 9,990,923 |
| `iajud-18` | `Judicial Branch Budget, FY 2019` | 158,343 |
| `iajud-19` | `Judicial Branch Budgets, Iowa Budget Report, 2020-2021, January 13, 2019` | 167,650 |
| `iajud-20` | `Office of the State Public Defender Strategic Plan, 2019-2023, December 15, 2018` | 320,513 |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/iowa-judicial-branch-publications-2026-05-25/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/iowa-judicial-branch-publications-2026-05-25/low-row-diagnostic-r1
```

Decision: `plan_high_impact_targeted_diagnostic`

Recommended lane: `table_target_resolution_needed`

Raw points needed for mean 93: `1`

A low-row repeat over `iajud-07`, `iajud-08`, and `iajud-15` reproduced the same scores: `89/B`, `69/D`, and `91/A`.

Table target-resolution diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/table-target-resolution-diagnostic.ts \
  --manifest /mnt/pdf-review/public-holdouts/iowa-judicial-branch-publications-2026-05-25/download-manifest.json \
  --run /mnt/pdf-review/public-holdouts/iowa-judicial-branch-publications-2026-05-25/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/iowa-judicial-branch-publications-2026-05-25/table-target-resolution-r1 \
  --pdf iajud-08=/mnt/pdf-review/public-holdouts/iowa-judicial-branch-publications-2026-05-25/input/iajud-08.pdf \
  --control iajud-02=/mnt/pdf-review/public-holdouts/iowa-judicial-branch-publications-2026-05-25/input/iajud-02.pdf \
  --control iajud-11=/mnt/pdf-review/public-holdouts/iowa-judicial-branch-publications-2026-05-25/input/iajud-11.pdf \
  --control iajud-14=/mnt/pdf-review/public-holdouts/iowa-judicial-branch-publications-2026-05-25/input/iajud-14.pdf \
  --control iajud-16=/mnt/pdf-review/public-holdouts/iowa-judicial-branch-publications-2026-05-25/input/iajud-16.pdf \
  --control accessible=/home/hendo420/PDFAF_v2/Input/experiment-corpus/00-fixtures/pdfaf_fixture_accessible.pdf
```

Decision: `keep_table_target_resolution_diagnostic_only`

The diagnostic found `iajud-08` as a stable normalize target, with no unsafe control candidates in this small comparison. Behavior was still not promoted because there is only one source focus row, existing table tooling already attempted multiple table repairs on the row, and the final table attempt hit a PAC header-association regression. This is not enough evidence for a general production rule.

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source missed the requested 93 mean target by one raw point: `92.95`.
- Median was above target at `93.5`.
- The only high-impact residual is a single complex table row, and the available table evidence does not justify a new general behavior stage.
- The stable sub-93 repeat confirms this is not a one-off network or runner issue.
- `false_positive_applied=0`, with no timeout/error rows and bounded runtime, although `iajud-08` is a runtime-tail row at about `270s`.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
