# PAC/POC Validation Checkpoint Refresh

Date: 2026-05-22

## Decision

Decision: `validation_not_passing`.

This checkpoint records the current validation state after direct language-syntax scoring hardening and the accepted Table/ParentTree behavior proof. It is an audit/reporting layer only. It does not run analysis, remediation, PAC/POC, ODL, Java, semantic AI, network checks, or PDF mutation.

Local generated artifact:

- `Output/pac-poc-validation-checkpoint-2026-05-22-r2/pac-poc-validation-checkpoint.md`
- `Output/pac-poc-validation-checkpoint-2026-05-22-r2/pac-poc-validation-checkpoint.json`

Generated artifacts remain local and are not source-tracked.

## Scope Results

`original_50`

- Artifact: `/mnt/pdf-review/pdfaf-validation/original50-table-parenttree-proof-2026-05-22-r1/baseline_report.json`
- Rows: `50`
- Completed: `49`
- All-row mean: `93.3000`
- Completed-row mean: `95.2041`
- Median: `95`
- `false_positive_applied=0`
- Runtime p95/max: `226899ms / 300036ms`
- Timeout/error rows: `1` (`structure-4438`)
- Runtime reference: `/mnt/pdf-review/pdfaf-validation/original50-form-xobject-content-confidence-2026-05-21-r1/baseline_report.json`
- Runtime bound: p95 `226899ms` is below allowed `236517ms`

`all_unique`

- Artifact: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-14-r39-stage194-lowconcurrency-full-r1/all-input-mean-diagnostic.json`
- Rows: `351`
- Mean: `92.9972`
- Median: `95`
- `false_positive_applied=0`
- Timeout/error rows: `4`
- Status: fails the active `93.0000` all-unique target by one raw point.

`outside_holdout`

- Artifact: `/mnt/pdf-review/pdfaf-validation/virginia-dcjs-current-table-proof-full-2026-05-22-r1/baseline_report.json`
- Rows: `20`
- Mean: `95.10`
- Median: `95.5`
- `false_positive_applied=0`
- Timeout/error rows: `0`
- Runtime p95/max: `202448ms / 212140ms`
- Runtime reference: `/mnt/pdf-review/pdfaf-validation/virginia-dcjs-figure-alt-tree-cap-full-2026-05-21-r1/baseline_report.json`
- Runtime bound: p95 `202448ms` is below allowed `205027ms`

## Interpretation

The source state remains improved for PAC/POC alignment, but the full goal is not achieved.

The direct language-syntax scoring change and accepted Table/ParentTree proof preserve `false_positive_applied=0` on the original-50 bounded validation. The outside Virginia holdout improved from the prior source-tracked checkpoint (`93.35 -> 95.10`) and still passes with bounded runtime. The all-unique checkpoint remains below the active target at `92.9972`, so the active goal stays open.

The original-50 result should not be over-read as final completion evidence: it still has one known hard timeout and the all-unique artifact is not a fresh run from this exact commit. The original-50 and outside-holdout gates are currently clean enough for the accepted table proof, but the full goal still needs fresh all-unique validation before completion.

Follow-up all-unique blocker evidence is now source-documented in `docs/all-unique-r39-hard-timeout-current-diagnostic-2026-05-22.md`. Current-source focused repeats recovered `0019/long-4516` from the r39 hard-timeout state to `59/F` and `85/B`, with `false_positive_applied=0`, while `0031`, `0120`, and `0135` remained hard timeouts. This makes a fresh all-unique validation the next useful acceptance check, but it is still not completion evidence.

## Next Direction

Use the updated map/rollup and PAC-stress selector to choose the next lane. Because no high-impact implementation lane is ready now, prefer:

- a fresh all-unique validation when the next work window can support it; or
- a new PAC-stress sample only if fresh evidence identifies a high-impact native gap not already covered by the accepted table proof.
