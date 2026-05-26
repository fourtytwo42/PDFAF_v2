# Massachusetts Trial Court Metric Reports Holdout - 2026-05-26

## Source

- Source family: Massachusetts Trial Court metric reports.
- Source index: `https://www.mass.gov/lists/trial-court-metric-reports`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/massachusetts-trial-court-metric-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

Mass.gov blocked `curl` with HTTP 403, so the source page and PDFs were fetched with a bounded Python `urllib` downloader using a browser-like user agent, per-file timeouts, and a 10 MiB in-memory cap before writing files.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/massachusetts-trial-court-metric-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/massachusetts-trial-court-metric-reports-2026-05-26/run-r1 \
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
| Mean before | 34.05 |
| Mean after | 94.45 |
| Median after | 96 |
| Grades after | 19 A / 0 B / 0 C / 0 D / 1 F |
| Rows below 93 | 1 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 13,616 ms |
| Runtime p95 | 17,477 ms |
| Runtime max | 27,468 ms |

Rows below 93:

| Row | Before | After | Main debt |
| --- | ---: | ---: | --- |
| `matrialmetrics-19.pdf` | 46 | 59/F | zero heading structure |

## Sample

The 20 valid under-10MiB PDFs downloaded from the Mass.gov Trial Court metric reports page were:

| Row | Title | Source slug | Bytes |
| --- | --- | --- | ---: |
| `matrialmetrics-01` | Trial Court Case Flow Metrics Report FY2025 | `trial-court-case-flow-metrics-report-fy2025` | 855,674 |
| `matrialmetrics-02` | Trial Court Case Flow Metrics Report FY2024 | `trial-court-case-flow-metrics-report-fy2024` | 1,292,581 |
| `matrialmetrics-03` | Executive Office of the Trial Court Case Flow Metrics Report FY2023 | `executive-office-of-the-trial-court-case-flow-metrics-report-fy2023` | 4,390,022 |
| `matrialmetrics-04` | Court Metrics Report - Fiscal Year 2022 | `court-metrics-report-fiscal-year-2022` | 1,335,804 |
| `matrialmetrics-05` | Fourth Quarter Metrics | `fourth-quarter-metrics-6` | 925,901 |
| `matrialmetrics-06` | Third Quarter Metrics | `third-quarter-metrics` | 864,278 |
| `matrialmetrics-07` | Second Quarter Metrics | `second-quarter-metrics` | 365,861 |
| `matrialmetrics-08` | First Quarter Metrics | `first-quarter-metrics` | 617,522 |
| `matrialmetrics-09` | Fourth Quarter Metrics | `fourth-quarter-metrics-5` | 377,852 |
| `matrialmetrics-10` | Third Quarter Metrics | `third-quarter-metrics-4` | 448,442 |
| `matrialmetrics-11` | Second Quarter Metrics | `second-quarter-metrics-5` | 267,302 |
| `matrialmetrics-12` | First Quarter Metrics | `first-quarter-metrics-6` | 249,983 |
| `matrialmetrics-13` | Fourth Quarter Metrics | `fourth-quarter-metrics` | 331,421 |
| `matrialmetrics-14` | First Quarter Metrics | `first-quarter-metrics-3` | 679,289 |
| `matrialmetrics-15` | Fourth Quarter Metrics | `fourth-quarter-metrics-3` | 248,558 |
| `matrialmetrics-16` | Third Quarter Metrics | `third-quarter-metrics-3` | 468,502 |
| `matrialmetrics-17` | Second Quarter Metrics | `second-quarter-metrics-2` | 235,537 |
| `matrialmetrics-18` | First Quarter Metrics | `first-quarter-metrics-1` | 232,789 |
| `matrialmetrics-19` | Fourth Quarter Metrics | `fourth-quarter-metrics-0` | 335,995 |
| `matrialmetrics-20` | Third Quarter Metrics | `third-quarter-metrics-0` | 321,654 |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/massachusetts-trial-court-metric-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/massachusetts-trial-court-metric-reports-2026-05-26/low-row-diagnostic-r1
```

Result:

- decision: `holdout_target_met`
- recommended lane: `none`
- raw points needed for mean 93: `0`
- `matrialmetrics-19.pdf` classified as `no_safe_predicate`

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/massachusetts-trial-court-metric-reports-2026-05-26/repeat-low-input \
  /mnt/pdf-review/public-holdouts/massachusetts-trial-court-metric-reports-2026-05-26/run-low-repeat-r1 \
  --limit 1 \
  --cleanup-row-artifacts
```

Result:

- `matrialmetrics-19.pdf` repeated at `59/F`
- `false_positive_applied=0`
- no timeout/error

Reading-order shell diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/massachusetts-trial-court-metric-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/massachusetts-trial-court-metric-reports-2026-05-26/reading-order-shell-r1
```

Result:

- `sequenceCandidateCount=0`
- `safeRouteControlCount=2`
- `selectedRows=[]`

Visible-title/heading-anchor diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-visible-title-anchor-diagnostic.ts \
  --all-input /mnt/pdf-review/public-holdouts/massachusetts-trial-court-metric-reports-2026-05-26/visible-title-input.json \
  --input-root /mnt/pdf-review/public-holdouts/massachusetts-trial-court-metric-reports-2026-05-26/input \
  --out /mnt/pdf-review/public-holdouts/massachusetts-trial-court-metric-reports-2026-05-26/visible-title-anchor-r1 \
  --file matrialmetrics-19
```

Result:

- `matrialmetrics-19.pdf`: `existing_internal_anchor_candidate`
- recommendation: use existing visible-heading path; do not add a source-text fallback

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The full 20-PDF source clears the requested 93+ mean and median target.
- Nineteen of twenty rows reached A-grade.
- Runtime was bounded and fast for this source, with p95 under 18 seconds.
- `false_positive_applied=0`, with no timeout/error rows.
- The only low row repeated as stable zero-heading debt, but diagnostics did not expose a new general predicate or safe remediation route.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
