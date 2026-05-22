# PAC/POC Validation Checkpoint Refresh

Date: 2026-05-22

## Decision

Decision: `validation_not_passing`.

This checkpoint records the current validation state after direct language-syntax scoring hardening. It is an audit/reporting layer only. It does not run analysis, remediation, PAC/POC, ODL, Java, semantic AI, network checks, or PDF mutation.

Local generated artifact:

- `Output/pac-poc-validation-checkpoint-2026-05-22-r1/pac-poc-validation-checkpoint.md`
- `Output/pac-poc-validation-checkpoint-2026-05-22-r1/pac-poc-validation-checkpoint.json`

Generated artifacts remain local and are not source-tracked.

## Scope Results

`original_50`

- Artifact: `/mnt/pdf-review/pdfaf-validation/original50-language-syntax-bounded-2026-05-22-r1/baseline_report.json`
- Rows: `50`
- Completed: `49`
- All-row mean: `91.3800`
- Completed-row mean: `93.2449`
- Median: `95`
- `false_positive_applied=0`
- Runtime p95/max: `214971ms / 300039ms`
- Timeout/error rows: `1` (`structure-4438`)

`all_unique`

- Artifact: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-14-r39-stage194-lowconcurrency-full-r1/all-input-mean-diagnostic.json`
- Rows: `351`
- Mean: `92.9972`
- Median: `95`
- `false_positive_applied=0`
- Timeout/error rows: `4`
- Status: fails the active `93.0000` all-unique target by one raw point.

`outside_holdout`

- Artifact: `/mnt/pdf-review/pdfaf-validation/virginia-dcjs-figure-alt-tree-cap-full-2026-05-21-r1/baseline_report.json`
- Rows: `20`
- Mean: `93.35`
- Median: `94.5`
- `false_positive_applied=0`
- Timeout/error rows: `0`
- Runtime p95/max: `199055ms / 228703ms`

## Interpretation

The source state remains improved for PAC/POC alignment, but the full goal is not achieved.

The direct language-syntax scoring change preserved `false_positive_applied=0` on the original-50 bounded validation, and the outside Virginia holdout still passes. The all-unique checkpoint remains below the active target at `92.9972`, so the active goal stays open.

The original-50 result should not be over-read as a clean broad acceptance pass: it still has one known hard timeout and known long/structure route debt in the low-row set. The language-specific row `font-4172` stayed A-grade with the stricter `title_language=89` cap, which supports the scoring hardening itself.

## Next Direction

Use the updated map/rollup to choose the next lane. Because no high-impact implementation lane is ready now, prefer either:

- a PAC-stress sample aimed at object-backed ParentTree/table targets or direct language-of-parts evidence; or
- a validation-focused checkpoint only if the next question is release/acceptance status rather than new behavior.
