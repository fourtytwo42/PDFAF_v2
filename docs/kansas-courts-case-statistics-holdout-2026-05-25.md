# Kansas Courts Case Statistics Holdout - 2026-05-25

## Source

- Source family: Kansas Judicial Branch annual case statistics reports.
- Source index: `https://kscourts.gov/Cases-Decisions/Case-Statistics`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/kansas-courts-case-statistics-2026-05-25/` during validation only; PDFs and generated run artifacts are not source-tracked.

The sample used the first 20 valid under-cap PDF links from the case-statistics page: annual reports and 10-year reports from 2025 through 2016. The downloader used bounded `curl` requests with per-request timeouts and `--max-filesize 10485760`.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/kansas-courts-case-statistics-2026-05-25/input \
  /mnt/pdf-review/public-holdouts/kansas-courts-case-statistics-2026-05-25/run-r1 \
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
| Mean before | 80.05 |
| Mean after | 97.65 |
| Median after | 98 |
| Grades after | 20 A / 0 B / 0 C / 0 D / 0 F |
| Rows below 93 | 1 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 6,354 ms |
| Runtime p95 | 9,026 ms |
| Runtime max | 18,345 ms |

Rows below 93:

| Row | Before | After | Main debt |
| --- | ---: | ---: | --- |
| `kscourts-17.pdf` | 81 | 90/A | mild heading/PDF-UA/text near miss |

## Sample

The first 20 valid under-10MiB PDFs downloaded from the Kansas Judicial Branch case-statistics page were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `kscourts-01` | `2025 Annual Report` | 122,030 |
| `kscourts-02` | `2025 10-Year Report` | 108,204 |
| `kscourts-03` | `2024 Annual Report` | 136,978 |
| `kscourts-04` | `2024 10-Year Report` | 102,389 |
| `kscourts-05` | `2023 Annual Report` | 98,316 |
| `kscourts-06` | `2023 10-Year Report` | 102,381 |
| `kscourts-07` | `2022 Annual Report` | 98,325 |
| `kscourts-08` | `2022 10-Year Report` | 102,387 |
| `kscourts-09` | `2021 Annual Report` | 98,320 |
| `kscourts-10` | `2021 10-Year Report` | 102,330 |
| `kscourts-11` | `2020 Annual Report` | 121,274 |
| `kscourts-12` | `2020 10-Year Report` | 111,733 |
| `kscourts-13` | `2019 Annual Report` | 137,624 |
| `kscourts-14` | `2019 10-Year Report` | 157,912 |
| `kscourts-15` | `2018 Annual Report` | 139,630 |
| `kscourts-16` | `2018 10-Year Report` | 127,768 |
| `kscourts-17` | `2017 Annual Report` | 218,758 |
| `kscourts-18` | `2017 10-Year Report` | 156,267 |
| `kscourts-19` | `2016 Annual Report` | 159,709 |
| `kscourts-20` | `2016 10-Year Report` | 159,401 |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/kansas-courts-case-statistics-2026-05-25/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/kansas-courts-case-statistics-2026-05-25/low-row-diagnostic-r1
```

Decision: `holdout_target_met`

Recommended lane: `none`

The only under-93 row was a low-priority `near_miss_monitor` with `3` raw points of upside. No high-impact structural predicate was indicated.

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source clears the requested 93+ mean and median target.
- Every row reached A-grade.
- Runtime was fast for a public-source holdout, with p95 under 10 seconds.
- `false_positive_applied=0`, with no timeout/error rows.
- The only residual row is a low-upside near miss.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
