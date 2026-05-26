# Michigan Courts Annual Reports Holdout - 2026-05-26

## Source

- Source family: Michigan Courts annual reports.
- Source index: `https://www.courts.michigan.gov/publications/statistics-and-reports/`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/michigan-courts-annual-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The public index is client-rendered, so the sample was built from official Michigan Courts PDF URL patterns for Court of Appeals annual reports and Supreme Court annual reports. Every selected PDF was below the 10 MiB cap.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/michigan-courts-annual-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/michigan-courts-annual-reports-2026-05-26/run-r1 \
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
| Mean before | 49.60 |
| Mean after | 91.55 |
| Median after | 94 |
| Grades after | 17 A / 2 B / 0 C / 0 D / 1 F |
| Rows below 93 | 8 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 26,569 ms |
| Runtime p95 | 53,693 ms |
| Runtime max | 96,522 ms |

Rows below 93:

| Row | Before | After | Main debt |
| --- | ---: | ---: | --- |
| `micourtsar-04.pdf` | 59 | 85/B | heading/PDF-UA/table residual plus partial alt |
| `micourtsar-07.pdf` | 57 | 59/F | figure alt, reading order, link quality |
| `micourtsar-08.pdf` | 49 | 90/A | heading/PDF-UA/table residual |
| `micourtsar-11.pdf` | 50 | 92/A | heading/PDF-UA/table residual |
| `micourtsar-13.pdf` | 42 | 92/A | PDF-UA/table/alt/reading residual |
| `micourtsar-14.pdf` | 51 | 90/A | heading/PDF-UA/table/reading residual |
| `micourtsar-15.pdf` | 55 | 91/A | heading/bookmark/PDF-UA/table residual |
| `micourtsar-16.pdf` | 41 | 84/B | alt/heading/PDF-UA/table residual |

## Sample

The 20 valid under-10MiB PDFs were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `micourtsar-01` | Michigan Court of Appeals Annual Report 2024 | 1,091,066 |
| `micourtsar-02` | Michigan Court of Appeals Annual Report 2023 | 3,089,520 |
| `micourtsar-03` | Michigan Court of Appeals Annual Report 2022 | 2,088,024 |
| `micourtsar-04` | Michigan Court of Appeals Annual Report 2021 | 4,869,253 |
| `micourtsar-05` | Michigan Court of Appeals Annual Report 2020 | 673,930 |
| `micourtsar-06` | Michigan Court of Appeals Annual Report 2019 | 1,299,400 |
| `micourtsar-07` | Michigan Court of Appeals Annual Report 2018 | 1,856,443 |
| `micourtsar-08` | Michigan Court of Appeals Annual Report 2017 | 987,567 |
| `micourtsar-09` | Michigan Court of Appeals Annual Report 2016 | 4,193,541 |
| `micourtsar-10` | Michigan Court of Appeals Annual Report 2015 | 4,945,820 |
| `micourtsar-11` | Michigan Court of Appeals Annual Report 2014 | 1,637,061 |
| `micourtsar-12` | Michigan Court of Appeals Annual Report 2013 | 1,664,238 |
| `micourtsar-13` | Michigan Court of Appeals Annual Report 2012 | 1,576,430 |
| `micourtsar-14` | Michigan Court of Appeals Annual Report 2011 | 2,129,011 |
| `micourtsar-15` | Michigan Supreme Court Annual Report 2010 | 3,260,084 |
| `micourtsar-16` | Michigan Supreme Court Annual Report 2009 | 5,717,033 |
| `micourtsar-17` | Michigan Supreme Court Annual Report 2008 | 2,293,332 |
| `micourtsar-18` | Michigan Supreme Court Annual Report 2007 | 1,574,170 |
| `micourtsar-19` | Michigan Supreme Court Annual Report 2006 | 3,714,502 |
| `micourtsar-20` | Michigan Supreme Court Annual Report 2005 | 2,443,582 |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/michigan-courts-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/michigan-courts-annual-reports-2026-05-26/low-row-diagnostic-r1
```

Result:

- decision: `plan_high_impact_targeted_diagnostic`
- recommended lane: `figure_alt_object_candidate`
- raw points needed for mean 93: `29`
- high-impact row: `micourtsar-07.pdf`

Figure/alt no-gain diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-figure-alt-no-gain-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/michigan-courts-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/michigan-courts-annual-reports-2026-05-26/figure-alt-no-gain-r1
```

Result:

- decision: `keep_figure_alt_diagnostic_only`
- focus rows: `5`
- scoring candidates: `0`
- behavior candidates: `0`
- `micourtsar-07.pdf` classified as `checker_alt_partial_existing_bound`
- `micourtsar-07.pdf` had bounded figure-alt writes, but checker-visible coverage only reached `6/63` and PAC-like figure-alt guards were present.

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/michigan-courts-annual-reports-2026-05-26/repeat-low-input \
  /mnt/pdf-review/public-holdouts/michigan-courts-annual-reports-2026-05-26/run-low-repeat-r1 \
  --limit 8 \
  --cleanup-row-artifacts
```

Result:

| Row | Primary | Repeat | Delta |
| --- | ---: | ---: | ---: |
| `micourtsar-04.pdf` | 85/B | 90/A | +5 |
| `micourtsar-07.pdf` | 59/F | 92/A | +33 |
| `micourtsar-08.pdf` | 90/A | 94/A | +4 |
| `micourtsar-11.pdf` | 92/A | 92/A | 0 |
| `micourtsar-13.pdf` | 92/A | 92/A | 0 |
| `micourtsar-14.pdf` | 90/A | 90/A | 0 |
| `micourtsar-15.pdf` | 91/A | 91/A | 0 |
| `micourtsar-16.pdf` | 84/B | 84/B | 0 |

Repeat low-row diagnostic:

- decision: `no_safe_low_row_lane`
- recommended lane: `none`
- raw points needed for mean 93 over repeated low rows: `19`
- dominant residuals: near-miss monitor rows plus `micourtsar-16.pdf` as no-safe-predicate debt

Reading-order shell diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/michigan-courts-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/michigan-courts-annual-reports-2026-05-26/reading-order-shell-r1
```

Result:

- `sequenceCandidateCount=0`
- `safeRouteControlCount=0`
- `selectedRows=[]`

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The full 20-PDF primary run missed the requested 93+ mean target at `91.55`, despite clearing median `94`.
- The main F row recovered on targeted repeat (`59/F -> 92/A`), indicating route/analyzer volatility rather than a clean object-backed new fixer.
- The figure/alt diagnostic found no scoring or behavior candidates and kept the lane diagnostic-only.
- Reading-order shell diagnostics found no safe sequence candidates.
- `false_positive_applied=0`, with no timeout/error rows.
- The remaining stable lows are near misses or no-safe-predicate debt, and no structural predicate justified changing production behavior.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
