# Rhode Island Judiciary Reports Holdout - 2026-05-25

## Source

- Source family: Rhode Island Judiciary annual reports and quarterly reports.
- Source indexes:
  - `https://www.courts.ri.gov/Legal-Resources/Pages/annual-reports.aspx`
  - `https://www.courts.ri.gov/programs-services/Pages/racial-ethnic-fairness-quarterly-reports.aspx`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/rhode-island-judiciary-annual-reports-2026-05-25/` during validation only; PDFs and generated run artifacts are not source-tracked.

The annual reports page yielded 15 valid under-cap PDFs after seven larger annual reports were skipped by the downloader because they exceeded the 10 MiB cap. The sample was completed with the first five valid under-cap PDFs from the same judiciary site's racial and ethnic fairness quarterly reports page.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/rhode-island-judiciary-annual-reports-2026-05-25/input \
  /mnt/pdf-review/public-holdouts/rhode-island-judiciary-annual-reports-2026-05-25/run-r1 \
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
| Mean before | 34.35 |
| Mean after | 95.55 |
| Median after | 96 |
| Grades after | 19 A / 1 B / 0 C / 0 D / 0 F |
| Rows below 93 | 1 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 13,424 ms |
| Runtime p95 | 32,293 ms |
| Runtime max | 48,658 ms |

Rows below 93:

| Row | Before | After | Main debt |
| --- | ---: | ---: | --- |
| `rijudar-02.pdf` | 54 | 88/B | mixed mild heading/reading/table near miss |

## Sample

The 20 valid under-10MiB PDFs downloaded from the Rhode Island Judiciary pages were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `rijudar-01` | `Annual Report 2024` | 7,409,659 |
| `rijudar-02` | `Annual Report 2022` | 9,824,843 |
| `rijudar-03` | `Annual Report 2020` | 9,576,711 |
| `rijudar-04` | `Annual Report 2019` | 9,968,755 |
| `rijudar-05` | `Annual Report 2017` | 1,074,603 |
| `rijudar-06` | `Annual Report 2016` | 1,086,225 |
| `rijudar-07` | `Annual Report 2015` | 1,089,182 |
| `rijudar-08` | `Annual Report 2014` | 1,071,573 |
| `rijudar-09` | `Annual Report 2013` | 3,503,408 |
| `rijudar-10` | `Annual Report 2012` | 1,668,645 |
| `rijudar-11` | `Annual Report 2011` | 6,425,312 |
| `rijudar-12` | `Annual Report 2006` | 876,648 |
| `rijudar-13` | `Annual Report 2005` | 6,335,838 |
| `rijudar-14` | `Annual Report 2004` | 3,159,286 |
| `rijudar-15` | `Annual Report 2003` | 5,094,870 |
| `rijudar-16` | `First Quarterly Report(March 31, 2025)` | 262,368 |
| `rijudar-17` | `Second Quarterly Report(June 30, 2025)` | 261,031 |
| `rijudar-18` | `Third Quarterly Report(September 30, 2025)` | 256,547 |
| `rijudar-19` | `Fourth Quarterly Report(December 31, 2025)` | 807,852 |
| `rijudar-20` | `First Quarterly Report(March 31, 2024)` | 250,710 |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/rhode-island-judiciary-annual-reports-2026-05-25/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/rhode-island-judiciary-annual-reports-2026-05-25/low-row-diagnostic-r1
```

Decision: `holdout_target_met`

Recommended lane: `none`

The only under-93 row was classified as `no_safe_predicate` with five raw points of local upside. No high-impact structural predicate was indicated.

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source clears the requested 93+ mean and median target.
- Nineteen of twenty rows reached A-grade.
- `false_positive_applied=0`, with no timeout/error rows.
- Runtime remained bounded for the sample, with p95 around 32 seconds.
- The only residual row is a low-upside mixed near miss without a safe general lane.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
