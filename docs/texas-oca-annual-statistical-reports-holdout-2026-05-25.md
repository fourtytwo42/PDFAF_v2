# Texas OCA Annual Statistical Reports Holdout - 2026-05-25

## Source

- Source family: Texas Judicial Branch / Office of Court Administration Annual Statistical Reports.
- Source index: `https://www.txcourts.gov/statistics/annual-statistical-reports/`
- Sample size: 20 PDFs under 10 MB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/texas-oca-annual-statistical-reports-2026-05-25/` during validation only; PDFs and generated run artifacts are not source-tracked.

The current full FY 2024 annual statistical report PDF was over the 10 MB cap, so the sample used individual public annual-report section PDFs linked from the annual statistical report pages.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/texas-oca-annual-statistical-reports-2026-05-25/input \
  /mnt/pdf-review/public-holdouts/texas-oca-annual-statistical-reports-2026-05-25/run-r1 \
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
| Mean before | 51.45 |
| Mean after | 94.25 |
| Median after | 94 |
| Grades after | 20 A / 0 B / 0 C / 0 D / 0 F |
| Rows below 93 | 4 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 7,513 ms |
| Runtime p95 | 48,631 ms |
| Runtime max | 49,306 ms |

Rows below 93:

| Row | Before | After | Main debt |
| --- | ---: | ---: | --- |
| `txoca-01.pdf` | 54 | 92/A | mild heading/reading near miss |
| `txoca-10.pdf` | 54 | 92/A | mild heading/reading near miss |
| `txoca-12.pdf` | 54 | 92/A | mild heading/reading near miss |
| `txoca-14.pdf` | 90 | 91/A | mild heading near miss |

## Sample

The first 20 valid under-10MB PDFs downloaded from the annual statistical report pages were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `txoca-01` | `2-coa-dist-map-fy11` | 1,704,266 |
| `txoca-02` | `Court-Structure-Chart-Sept-2015` | 324,768 |
| `txoca-03` | `Appellate-Clerk-Demographic-Profile-2014` | 9,533 |
| `txoca-04` | `Justices-of-SC-2015` | 85,356 |
| `txoca-05` | `CCA-Activity-Report-2015` | 723,085 |
| `txoca-06` | `CCA-Judges-2015` | 7,230 |
| `txoca-07` | `COA-Justices-2015` | 19,035 |
| `txoca-08` | `8-Performance-Measure-Definitions` | 17,501 |
| `txoca-09` | `Assignment-of-Judges-2015` | 62,282 |
| `txoca-10` | `AJRMAP_Sept2015` | 1,387,315 |
| `txoca-11` | `1-Counties-in-Each-District-2015` | 62,360 |
| `txoca-12` | `COA-Districts-Map-2015` | 1,704,266 |
| `txoca-13` | `1-Explanation-of-Case-Categories-2015-Constitutional-County-Court` | 32,994 |
| `txoca-14` | `2-Notes-about-CCC-Data-for-FY-2015` | 66,846 |
| `txoca-15` | `3-CCC-Activity-Detail` | 166,196 |
| `txoca-16` | `4-CCC-Summary-by-County` | 99,720 |
| `txoca-17` | `5-CCC-Summary-by-County-Population-Sort` | 98,066 |
| `txoca-18` | `6-CCC-Age-of-Cases-Disposed` | 82,996 |
| `txoca-19` | `7-CCC-Age-of-Cases-Disposed-Sorted-by-Population` | 82,172 |
| `txoca-20` | `8-CCC-Performance-Measures` | 85,402 |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/texas-oca-annual-statistical-reports-2026-05-25/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/texas-oca-annual-statistical-reports-2026-05-25/low-row-diagnostic-r1
```

Decision: `holdout_target_met`

Recommended lane: `none`

The four under-93 rows were all A-grade near misses with low raw upside. No high-impact structural predicate was indicated.

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source clears the requested 93+ mean and median target on accepted code.
- Every row reached A-grade.
- Residual rows are low-priority near misses with mild heading/reading debt.
- `false_positive_applied=0`, with no timeout/error rows and bounded runtime.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
