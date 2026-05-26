# Florida State Courts Annual Report Components Holdout - 2026-05-26

## Source

- Source family: Florida State Courts annual-report archive components.
- Source index: `https://www.flcourts.gov/Media-Center/publications/State-Courts-Report/Annual-Report-Archive`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/florida-state-courts-annual-report-components-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The archive exposes direct `content/download/.../file/*.pdf` component PDFs for annual State Courts Reports. The sample uses the first twenty valid direct PDFs from the archive page after excluding non-PDF links and external administrative-order links.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/florida-state-courts-annual-report-components-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/florida-state-courts-annual-report-components-2026-05-26/run-r1 \
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
| Mean before | 69.60 |
| Mean after | 94.55 |
| Median after | 94 |
| Grades after | 19 A / 1 B / 0 C / 0 D / 0 F |
| Rows below 93 | 5 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 9,156 ms |
| Runtime p95 | 18,455 ms |
| Runtime max | 21,622 ms |

Rows below 93:

| Row | Before | After | Main debt |
| --- | ---: | ---: | --- |
| `flcourtsar-01.pdf` | 89 | 89/B | low-priority heading/link/reading/PDF-UA near miss |
| `flcourtsar-06.pdf` | 85 | 90/A | low-priority heading/table/PDF-UA near miss |
| `flcourtsar-14.pdf` | 92 | 92/A | low-priority heading/PDF-UA near miss |
| `flcourtsar-15.pdf` | 56 | 92/A | low-priority heading/PDF-UA near miss |
| `flcourtsar-16.pdf` | 92 | 92/A | low-priority heading/text/PDF-UA near miss |

## Sample

The 20 valid under-10MiB PDFs downloaded from the Florida Courts archive were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `flcourtsar-01` | `supreme-court-justices.pdf` | 440,124 |
| `flcourtsar-02` | `ar-18-19-court-structure.pdf` | 407,882 |
| `flcourtsar-03` | `ar-18-19-map-florida-court-jurisdictions.pdf` | 359,761 |
| `flcourtsar-04` | `ar-18-19-court-administration.pdf` | 221,617 |
| `flcourtsar-05` | `ar-18-19-court-committees.pdf` | 286,508 |
| `flcourtsar-06` | `ar-18-19-judicial-certification-table.pdf` | 288,111 |
| `flcourtsar-07` | `ar-18-19-florida-budget.pdf` | 229,552 |
| `flcourtsar-08` | `ar-18-19-state-courts-system-appropriations.pdf` | 231,603 |
| `flcourtsar-09` | `ar-18-19-trial-appellate-court-filings.pdf` | 790,334 |
| `flcourtsar-10` | `ar-18-19-dca-circuit-county-court-filings.pdf` | 744,994 |
| `flcourtsar-11` | `ar-18-19-court-contacts.pdf` | 230,475 |
| `flcourtsar-12` | `florida's-supreme-court-justices.pdf` | 1,830,267 |
| `flcourtsar-13` | `ar-17-18-court-structure.pdf` | 235,590 |
| `flcourtsar-14` | `ar-17-18-court-administration.pdf` | 426,754 |
| `flcourtsar-15` | `ar-17-18-court-committees.pdf` | 393,962 |
| `flcourtsar-16` | `ar-17-18-map-of-floridas-court-jurisdictions.pdf` | 495,296 |
| `flcourtsar-17` | `ar-17-18-judicial-certification-tables.pdf` | 336,916 |
| `flcourtsar-18` | `ar-17-18-florida-budget.pdf` | 258,428 |
| `flcourtsar-19` | `ar-17-18-scs-appropriations.pdf` | 523,915 |
| `flcourtsar-20` | `ar-17-18-filings-trial-appellate-courts.pdf` | 627,052 |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/florida-state-courts-annual-report-components-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/florida-state-courts-annual-report-components-2026-05-26/low-row-diagnostic-r1
```

Result:

- decision: `holdout_target_met`
- recommended lane: `none`
- raw points needed for mean 93: `0`
- all five rows below 93 classified as `near_miss_monitor`

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/florida-state-courts-annual-report-components-2026-05-26/repeat-low-input \
  /mnt/pdf-review/public-holdouts/florida-state-courts-annual-report-components-2026-05-26/run-low-repeat-r1 \
  --limit 5 \
  --cleanup-row-artifacts
```

Repeat rows:

| Row | Primary | Low repeat | Interpretation |
| --- | ---: | ---: | --- |
| `flcourtsar-01.pdf` | 89/B | 89/B | stable near miss |
| `flcourtsar-06.pdf` | 90/A | 90/A | stable near miss |
| `flcourtsar-14.pdf` | 92/A | 92/A | stable near miss |
| `flcourtsar-15.pdf` | 92/A | 69/D | repeat-only route/reading-order volatility |
| `flcourtsar-16.pdf` | 92/A | 92/A | stable near miss |

Repeat low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/florida-state-courts-annual-report-components-2026-05-26/run-low-repeat-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/florida-state-courts-annual-report-components-2026-05-26/low-row-repeat-diagnostic-r1
```

Result:

- decision: `plan_high_impact_targeted_diagnostic`
- recommended lane: `reading_link_order_candidate`
- candidate row: `flcourtsar-15.pdf`

Reading-order shell follow-up on the repeat artifact:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/florida-state-courts-annual-report-components-2026-05-26/run-low-repeat-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/florida-state-courts-annual-report-components-2026-05-26/reading-order-shell-repeat-r1
```

Result:

- `sequenceCandidateCount=0`
- `safeRouteControlCount=0`
- `selectedRows=[]`

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The full 20-PDF source clears the requested 93+ mean and median target.
- Nineteen of twenty rows reached A-grade and the remaining row was `89/B`.
- Runtime was bounded and fast for this source, with p95 under 20 seconds.
- `false_positive_applied=0`, with no timeout/error rows.
- The residual rows are low-upside near misses.
- The only repeat-only larger drop, `flcourtsar-15.pdf`, did not produce a reading-order shell sequence candidate and is not enough to justify behavior promotion.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
