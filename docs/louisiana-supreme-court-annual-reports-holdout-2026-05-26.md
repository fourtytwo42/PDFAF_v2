# Louisiana Supreme Court Annual Reports Holdout - 2026-05-26

## Source

- Source family: Louisiana Supreme Court annual reports.
- Annual Reports index: `https://www.lasc.org/annualreports`
- Current annual report page: `https://www.lasc.org/Annual_Reports?p=2025_Louisiana_Supreme_Court_Annual_Report`
- Direct PDF root: `https://www.lasc.org/press_room/annual_reports/reports/`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/louisiana-supreme-court-annual-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The current annual-report pages are rendered by Blazor, so the download step used the official direct PDF URLs under the Louisiana Supreme Court annual-report PDF root. The sample walked annual reports in descending year order and skipped candidates that failed the 10 MiB capped download guard.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/louisiana-supreme-court-annual-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/louisiana-supreme-court-annual-reports-2026-05-26/run-r1 \
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
| Mean before | 29.80 |
| Mean after | 94.65 |
| Median after | 95 |
| Grades after | 20 A / 0 B / 0 C / 0 D / 0 F |
| Rows below 93 | 1 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 30,115 ms |
| Runtime p95 | 54,648 ms |
| Runtime max | 55,539 ms |

Rows below 93:

| Row | Baseline after | Runtime | Primary residual |
| --- | ---: | ---: | --- |
| `lascar-11.pdf` | 92/A | 50,908 ms | One-point link/PDF-UA near miss |

## Sample

The 20 valid under-10MiB PDFs downloaded from Louisiana Supreme Court annual-report URLs were:

| Row | Year | Title | Bytes |
| --- | --- | --- | ---: |
| `lascar-01` | 2025 | 2025 Annual Report | 7,771,421 |
| `lascar-02` | 2024 | 2024 Annual Report | 4,381,524 |
| `lascar-03` | 2023 | 2023 Annual Report | 4,860,727 |
| `lascar-04` | 2022 | 2022 Annual Report | 4,318,268 |
| `lascar-05` | 2021 | 2021 Annual Report | 4,306,097 |
| `lascar-06` | 2020 | 2020 Annual Report | 9,908,526 |
| `lascar-07` | 2019 | 2019 Annual Report | 3,957,878 |
| `lascar-08` | 2018 | 2018 Annual Report | 3,884,072 |
| `lascar-09` | 2017 | 2017 Annual Report | 8,591,362 |
| `lascar-10` | 2016 | 2016 Annual Report | 8,931,046 |
| `lascar-11` | 2015 | 2015 Annual Report | 8,175,192 |
| `lascar-12` | 2012 | 2012 Annual Report | 3,288,193 |
| `lascar-13` | 2011 | 2011 Annual Report | 2,691,754 |
| `lascar-14` | 2010 | 2010 Annual Report | 2,515,095 |
| `lascar-15` | 2009 | 2009 Annual Report | 2,721,003 |
| `lascar-16` | 2008 | 2008 Annual Report | 2,525,897 |
| `lascar-17` | 2007 | 2007 Annual Report | 2,407,787 |
| `lascar-18` | 2006 | 2006 Annual Report | 981,839 |
| `lascar-19` | 2005 | 2005 Annual Report | 3,025,578 |
| `lascar-20` | 2004 | 2004 Annual Report | 3,056,212 |

Skipped by the 10MiB capped download guard:

| Candidate | Year | Reason |
| --- | --- | --- |
| 2014 Annual Report | 2014 | `curl_failed_63` |
| 2013 Annual Report | 2013 | `curl_failed_63` |

`curl_failed_63` is the capped download failure from `curl --max-filesize 10485760`.

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/louisiana-supreme-court-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/louisiana-supreme-court-annual-reports-2026-05-26/low-row-diagnostic-r1
```

Decision: `holdout_target_met`

Recommended lane: `reading_link_order_candidate`

Raw points needed for mean 93: `0`

Lane split:

| Lane | Rows | Raw points |
| --- | ---: | ---: |
| `reading_link_order_candidate` | 1 | 1 |

Reading-order shell diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/louisiana-supreme-court-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/louisiana-supreme-court-annual-reports-2026-05-26/reading-order-shell-diagnostic-r1
```

Result: `0` sequence candidates, `0` safe route controls, `0` final orphan-debt rows, and `0` selected rows.

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/louisiana-supreme-court-annual-reports-2026-05-26/low-repeat-input \
  /mnt/pdf-review/public-holdouts/louisiana-supreme-court-annual-reports-2026-05-26/run-low-repeat-r1 \
  --limit 1 \
  --cleanup-row-artifacts
```

Repeat result:

| Row | Baseline after | Repeat after | Repeat runtime |
| --- | ---: | ---: | ---: |
| `lascar-11.pdf` | 92/A | 92/A | 47,164 ms |

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source already exceeds the 93 mean target with all 20 rows A-grade, no timeout/error rows, and `false_positive_applied=0`.
- The only low row is a one-point near miss and reproduced at `92/A`.
- The focused reading-order shell diagnostic found no sequence candidate or selected row.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
