# Nebraska NDCS Research Reports Holdout

Date: 2026-05-24

Source: Nebraska Department of Correctional Services, Research & Reports page: `https://corrections.nebraska.gov/news-information/research-reports`

This was a 20-PDF public holdout sample from official NDCS report PDFs under 10 MB. The two NDCS master-plan PDFs that exceeded the 10 MB cap were skipped by bounded download. PDFs and generated benchmark artifacts remain local only and are not source assets.

## Baseline

Local run: `/mnt/pdf-review/public-holdouts/nebraska-ndcs-research-reports-2026-05-24/run-r1/baseline_report.json`

- Completed: `20/20`
- Mean: `47.50 -> 90.45`
- Median after: `93`
- Grades after: `13 A / 5 B / 2 D`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`
- Runtime p95/max: `47276ms / 65891ms`

The low-row diagnostic selected `table_target_resolution_needed`. The table target-resolution diagnostic found stable object-backed table/header targets on `nebdcs-05`, `nebdcs-07`, and `nebdcs-09`, while same-source controls did not match the promotion predicate.

## Accepted Change

The accepted source change is a narrow general Stage 180 predicate calibration, not a Nebraska-specific rule:

- `shouldTryStage180ReportTableProof` now allows report-scale object-backed table cleanup when `link_quality >= 75` instead of requiring `link_quality >= 95`.
- The existing gates remain intact: report-scale PDF, low table score, high alt score, heading score at least `60`, reading order at least `95`, zero annotation ownership debt, heavy table-header association debt, no direct/misplaced table shape, and stable object-backed `/Table` targets.
- No filenames, row IDs, source names, corpus paths, hashes, scorer caps, PAC relaxations, new mutators, semantic work, or ODL/POC runtime dependencies were added.

Rationale: the focus rows had bounded non-annotation link-quality debt (`79`) but strong table/PAC evidence. Requiring `95` blocked the existing safe table transaction even when annotation ownership debt was zero.

## Validation

Focused target/control run:

Local run: `/mnt/pdf-review/public-holdouts/nebraska-ndcs-research-reports-2026-05-24/run-target-controls-r1/baseline_report.json`

- Completed: `9/9`
- Mean: `43.11 -> 93.78`
- `false_positive_applied`: `0`
- Target movement:
  - `nebdcs-05`: `69/D -> 96/A`
  - `nebdcs-07`: `69/D -> 95/A`
  - `nebdcs-09`: stayed `91/A`
- Controls stayed stable: `nebdcs-04`, `nebdcs-06`, `nebdcs-12`, `nebdcs-18`, `nebdcs-19`, `nebdcs-20`.

Full source rerun after the change:

Local run: `/mnt/pdf-review/public-holdouts/nebraska-ndcs-research-reports-2026-05-24/run-r2-after-stage180-link-threshold/baseline_report.json`

- Completed: `20/20`
- Mean: `47.50 -> 93.15`
- Median after: `94.5`
- Grades after: `14 A / 6 B`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`
- Runtime p95/max: `50857ms / 64433ms`

Comparable original-50 bounded validation:

Local run: `/mnt/pdf-review/pdfaf-validation/original50-nebraska-stage180-bounded-2026-05-24-r1/baseline_report.json`

- Completed: `50/50`
- Mean: `41.48 -> 93.36`
- Median after: `95`
- Grades after: `46 A / 2 B / 2 F`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`
- Runtime p95/max: `105773ms / 276810ms`

Residual original-50 lows are known route/runtime families, especially `4680` and `4683`, and the new report-scale table threshold did not trigger on those rows. Runtime stayed bounded and below the recent accepted p95/max reference from the structure-4438 optimization validation.

## Test Coverage

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/remediation/stage180MixedTablePdfua.test.ts`
- `npx -y node@22 /usr/bin/pnpm run lint`

Both passed.

## Cleanup

Public PDFs and local generated holdout artifacts should be removed after extracting the metrics above. Only this source report, the source code change, tests, and the durable memory note are source-tracked.
