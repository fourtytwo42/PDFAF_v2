# Pennsylvania Courts Caseload Statistics Holdout - 2026-05-25

## Source

- Source family: Unified Judicial System of Pennsylvania caseload statistics.
- Source index: `https://www.pacourts.us/news-and-statistics/research-and-statistics/caseload-statistics`
- Sample size: 20 PDFs under 10 MB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/pennsylvania-courts-caseload-statistics-2026-05-25/` during validation only; PDFs and generated run artifacts are not source-tracked.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/pennsylvania-courts-caseload-statistics-2026-05-25/input \
  /mnt/pdf-review/public-holdouts/pennsylvania-courts-caseload-statistics-2026-05-25/run-r1 \
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
| Processed | 20/20 attempted, 19 completed |
| Mean before | 29.10 |
| Mean after | 83.55 |
| Median after | 93 |
| Grades after | 16 A / 0 B / 0 C / 0 D / 4 F-or-timeout |
| Rows below 93 | 7 |
| Timeout/error rows | 1 |
| `false_positive_applied` | 0 |
| Runtime p50 | 29,635 ms |
| Runtime p95 | 290,069 ms |
| Runtime max | 300,005 ms |

Rows below 93:

| Row | Before | After | Main debt |
| --- | ---: | ---: | --- |
| `pacourts-01.pdf` | 35 | 59/F | table/header plus zero-heading debt |
| `pacourts-02.pdf` | 35 | 0/? | hard timeout at 300,000 ms |
| `pacourts-07.pdf` | 31 | 92/A | near miss; PDF-UA/reading residual |
| `pacourts-10.pdf` | 31 | 59/F | zero-heading/reading debt |
| `pacourts-11.pdf` | 31 | 92/A | near miss; PDF-UA/reading residual |
| `pacourts-13.pdf` | 31 | 92/A | near miss; PDF-UA/reading residual |
| `pacourts-20.pdf` | 24 | 59/F | zero-heading/PDF-UA/reading debt |

## Sample

The first 20 valid under-10MB PDFs downloaded from the caseload statistics page were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `pacourts-01` | `174304-caseloadstatisticsreport2019` | 6,732,847 |
| `pacourts-02` | `174317-caseloadstatisticsreport2018` | 3,380,938 |
| `pacourts-03` | `192842-statewidetotals` | 2,675,278 |
| `pacourts-04` | `203900-statewidetotals-008283` | 1,304,107 |
| `pacourts-05` | `182942-statewidetotals` | 1,218,928 |
| `pacourts-06` | `171116-2020reportonline` | 5,847,481 |
| `pacourts-07` | `162441-2021reportonline` | 5,793,749 |
| `pacourts-08` | `195603-statewide2021` | 1,642,407 |
| `pacourts-09` | `153957-2022annualcaseloadreport` | 6,142,929 |
| `pacourts-10` | `154024-2022statewidetotals` | 1,743,267 |
| `pacourts-11` | `161635-2023annualcaseloadreport` | 5,079,109 |
| `pacourts-12` | `183553-2023statewidetotals23` | 1,641,660 |
| `pacourts-13` | `190729-2024annualcaseloadreport` | 5,855,803 |
| `pacourts-14` | `190816-2024statetotals` | 1,726,466 |
| `pacourts-15` | `193308-adamscounty` | 1,620,514 |
| `pacourts-16` | `195403-cumberlandcounty` | 2,050,286 |
| `pacourts-17` | `195403-dauphincounty` | 2,147,578 |
| `pacourts-18` | `195403-delawarecounty` | 2,142,474 |
| `pacourts-19` | `195403-fayettecounty` | 2,146,692 |
| `pacourts-20` | `195403-juniatacounty` | 1,739,484 |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/pennsylvania-courts-caseload-statistics-2026-05-25/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/pennsylvania-courts-caseload-statistics-2026-05-25/low-row-diagnostic-r1
```

Decision: `plan_high_impact_targeted_diagnostic`

Recommended lane: `table_target_resolution_needed`

Raw points needed for mean 93: `189`.

Lane summary:

- `timeout_or_error`: `pacourts-02.pdf`, 93 points.
- `table_target_resolution_needed`: `pacourts-01.pdf`, 34 points.
- `no_safe_predicate`: `pacourts-10.pdf`, `pacourts-20.pdf`, 68 points.
- `near_miss_monitor`: `pacourts-07.pdf`, `pacourts-11.pdf`, `pacourts-13.pdf`, 3 points.

Table target-resolution diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/table-target-resolution-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/pennsylvania-courts-caseload-statistics-2026-05-25/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/pennsylvania-courts-caseload-statistics-2026-05-25/table-target-resolution-r1 \
  --pdf pacourts-01=/mnt/pdf-review/public-holdouts/pennsylvania-courts-caseload-statistics-2026-05-25/input/pacourts-01.pdf \
  --pdf pacourts-10=/mnt/pdf-review/public-holdouts/pennsylvania-courts-caseload-statistics-2026-05-25/input/pacourts-10.pdf \
  --pdf pacourts-20=/mnt/pdf-review/public-holdouts/pennsylvania-courts-caseload-statistics-2026-05-25/input/pacourts-20.pdf \
  --control pacourts-03=/mnt/pdf-review/public-holdouts/pennsylvania-courts-caseload-statistics-2026-05-25/input/pacourts-03.pdf \
  --control pacourts-04=/mnt/pdf-review/public-holdouts/pennsylvania-courts-caseload-statistics-2026-05-25/input/pacourts-04.pdf \
  --control pacourts-06=/mnt/pdf-review/public-holdouts/pennsylvania-courts-caseload-statistics-2026-05-25/input/pacourts-06.pdf \
  --control pacourts-15=/mnt/pdf-review/public-holdouts/pennsylvania-courts-caseload-statistics-2026-05-25/input/pacourts-15.pdf
```

Decision: `keep_table_target_resolution_diagnostic_only`

Key evidence:

- `pacourts-01` had a stable object-backed normalize target, table score debt, and PAC header-association failures.
- `pacourts-06` also triggered stable normalize targets as a control/high-score row, so the predicate is not clean enough to promote.
- `pacourts-10` and `pacourts-20` had layout table evidence but no stable table struct refs and are primarily zero-heading/no-safe-predicate rows from current evidence.

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source misses the requested 93+ mean target by a wide margin and includes one hard timeout, but the blockers split across runtime/analyzer tail, table/header target identity, and zero-heading/no-safe-predicate rows.
- The table-target signal is not clean: a selected control also triggers stable normalize-table evidence.
- Existing table mutations on `pacourts-01` rejected on honest PAC table-header association regression.
- The zero-heading rows do not expose a safe object-backed heading predicate from this run evidence.
- No production scoring, planner, or mutation behavior changed, so original-50 regression validation was not required.

This source reinforces the existing parked lanes:

- runtime/analyzer tail reduction for full annual reports near the per-PDF wall;
- real table/header transactions that preserve or rebuild `/Scope`, `/ID`, and `/Headers` after normalization;
- native zero-heading target discovery for PDFs with layout evidence but no safe structured heading target.

Do not add Pennsylvania/source/year/county/PDF-specific gates, scorer masking, PAC relaxations, broad table admission, table target fallback, broad heading fallback, or timeout checkpoint relaxation from this evidence.
