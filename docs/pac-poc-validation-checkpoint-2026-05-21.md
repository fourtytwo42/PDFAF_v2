# PAC/POC Validation Checkpoint - 2026-05-21

## Decision

Decision: `validation_not_passing`.

This checkpoint adds a reusable validation rollup for the active PAC/POC alignment goal. It does not run analysis, remediation, PAC/POC, ODL, Java, semantic AI, network checks, or PDF mutation. It only reads existing validation artifacts and reports whether the evidence is enough for the goal endgate.

Source change:

- `scripts/pac-poc-validation-checkpoint.ts`
- `tests/scripts/pacPocValidationCheckpoint.test.ts`

Local generated artifact:

- `Output/pac-poc-validation-checkpoint-2026-05-21-r1/pac-poc-validation-checkpoint.md`
- `Output/pac-poc-validation-checkpoint-2026-05-21-r1/pac-poc-validation-checkpoint.json`

Generated artifacts stay local and are not source-tracked.

## Inputs Used

Original-50:

- `/mnt/pdf-review/pdfaf-validation/original50-form-xobject-content-confidence-2026-05-21-r1/baseline_report.json`

All-unique:

- `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-14-r39-stage194-lowconcurrency-full-r1/all-input-mean-diagnostic.json`

Outside holdout:

- `/mnt/pdf-review/pdfaf-validation/virginia-dcjs-single-probe-2026-05-18-r2/baseline_report.json`

The all-unique artifact is the best honest full-run floor currently recorded in durable memory, but it is not a new full run from the latest commit. The outside artifact is only a single-PDF probe, not the required 20-PDF holdout.

## Result

Overall decision: `validation_not_passing`.

| Scope | Status | Rows | Mean All Rows | Completed Mean | Median | False Positives | Runtime p95 | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| original-50 | `pass` | 50 | 92.14 | 94.0204 | 95 | 0 | 229628 ms | one known timeout, `structure-4438` |
| all-unique | `fail` | 351 | 92.9972 | n/a | 95 | 0 | 197611 ms | mean is below 93 by one raw point |
| outside holdout | `fail` | 1 | 87 | 87 | 87 | 0 | 64282 ms | not a 20-PDF holdout and below 93 |

Hard timeout/error rows in the all-unique artifact:

- `0019/long-4516`
- `0031/structure-4438`
- `0135/4453`
- `0120/4690`

## Interpretation

The current accepted source state remains close, but the active goal is not complete:

- original-50 deterministic evidence is currently clean on mutation truth (`false_positive_applied=0`);
- the best honest all-unique artifact remains `92.9972`, not `>=93.0000`;
- there is no current 20-PDF outside holdout validation artifact satisfying the goal.

The useful next work is either:

1. run a current fresh all-unique validation plus a real outside holdout checkpoint, or
2. build a deliberately selected PAC-stress holdout for one unresolved family before spending another broad full-run cycle.

Do not describe the r39 all-unique result as goal completion. It is the best floor and misses by one raw point.
