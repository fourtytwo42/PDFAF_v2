# PAC/POC Validation Checkpoint - 2026-05-21

## Decision

Decision: `validation_not_passing`.

This checkpoint adds a reusable validation rollup for the active PAC/POC alignment goal. It does not run analysis, remediation, PAC/POC, ODL, Java, semantic AI, network checks, or PDF mutation. It only reads existing validation artifacts and reports whether the evidence is enough for the goal endgate.

Source change:

- `scripts/pac-poc-validation-checkpoint.ts`
- `scripts/bounded-holdout-validation.ts`
- `tests/scripts/pacPocValidationCheckpoint.test.ts`
- `tests/scripts/boundedHoldoutValidation.test.ts`

Follow-up source change:

- `scripts/pac-poc-validation-checkpoint.ts` now supports optional runtime p95 reference artifacts per scope:
  - `--original-runtime-reference`
  - `--all-unique-runtime-reference`
  - `--outside-runtime-reference`
- A scope fails when current p95 exceeds reference p95 plus `max(3%, 5000ms)`.
- `tests/scripts/pacPocValidationCheckpoint.test.ts` covers runtime-bound failure reporting.

Local generated artifact:

- `Output/pac-poc-validation-checkpoint-2026-05-21-r2/pac-poc-validation-checkpoint.md`
- `Output/pac-poc-validation-checkpoint-2026-05-21-r2/pac-poc-validation-checkpoint.json`

Generated artifacts stay local and are not source-tracked.

## Inputs Used

Original-50:

- `/mnt/pdf-review/pdfaf-validation/original50-form-xobject-content-confidence-2026-05-21-r1/baseline_report.json`

All-unique:

- `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-14-r39-stage194-lowconcurrency-full-r1/all-input-mean-diagnostic.json`

Outside holdout:

- `/mnt/pdf-review/pdfaf-validation/virginia-dcjs-20pdf-bounded-2026-05-21-r1/baseline_report.json`

The all-unique artifact is the best honest full-run floor currently recorded in durable memory, but it is not a new full run from the latest commit.

## Result

Overall decision: `validation_not_passing`.

| Scope | Status | Rows | Mean All Rows | Completed Mean | Median | False Positives | Runtime p95 | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| original-50 | `pass` | 50 | 92.14 | 94.0204 | 95 | 0 | 229628 ms | one known timeout, `structure-4438` |
| all-unique | `fail` | 351 | 92.9972 | n/a | 95 | 0 | 197611 ms | mean is below 93 by one raw point |
| outside holdout | `fail` | 20 | 91.15 | 91.15 | 94.5 | 0 | 224644 ms | below 93, but bounded and complete |

Hard timeout/error rows in the all-unique artifact:

- `0019/long-4516`
- `0031/structure-4438`
- `0135/4453`
- `0120/4690`

The bounded Virginia holdout completed with no timeout rows. Low holdout rows:

| Row | Score | Main final debt |
| --- | ---: | --- |
| `va-03` | 91/A | reading order, PDF/UA, alt |
| `va-11` | 59/F | figure/alt, PDF/UA, reading order |
| `va-13` | 89/B | title/language, PDF/UA, reading order |
| `va-15` | 69/D | table markup, heading structure, PDF/UA |
| `va-17` | 91/A | heading, PDF/UA, table/link |
| `va-18` | 79/C | reading order, link quality, PDF/UA |

## Interpretation

The current accepted source state remains close, but the active goal is not complete:

- original-50 deterministic evidence is currently clean on mutation truth (`false_positive_applied=0`);
- the best honest all-unique artifact remains `92.9972`, not `>=93.0000`;
- the current 20-PDF Virginia outside holdout is bounded and complete, but mean is `91.15`, below the `93` target.

The useful next work is either:

1. recover the all-unique one-point miss with a general timeout/low-row stabilization, or
2. open a focused outside-corpus lane around the Virginia low rows, with the strongest candidates being figure/alt on `va-11`, table markup on `va-15`, and reading/link order on `va-18`.

Do not describe the r39 all-unique result as goal completion. It is the best floor and misses by one raw point.

## Runtime-Gated R3 Update

Generated local artifact:

- `Output/pac-poc-validation-checkpoint-2026-05-21-r3/pac-poc-validation-checkpoint.md`
- `Output/pac-poc-validation-checkpoint-2026-05-21-r3/pac-poc-validation-checkpoint.json`

Inputs used:

- Original-50 current: `/mnt/pdf-review/pdfaf-validation/original50-current-treecap-guard-bounded-repeat-2026-05-21-r2/baseline_report.json`
- Original-50 runtime reference: `/mnt/pdf-review/pdfaf-validation/original50-form-xobject-content-confidence-2026-05-21-r1/baseline_report.json`
- All-unique: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-14-r39-stage194-lowconcurrency-full-r1/all-input-mean-diagnostic.json`
- Outside holdout current: `/mnt/pdf-review/pdfaf-validation/virginia-dcjs-figure-alt-tree-cap-full-2026-05-21-r1/baseline_report.json`
- Outside holdout runtime reference: `/mnt/pdf-review/pdfaf-validation/virginia-dcjs-20pdf-bounded-2026-05-21-r1/baseline_report.json`

Overall decision remains `validation_not_passing`.

| Scope | Status | Mean | Median | False Positives | p95 | p95 Ref | p95 Allowed | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| original-50 | `fail` | `91.82` | `95` | `0` | `253462ms` | `229628ms` | `236517ms` | p95 runtime above bound |
| all-unique | `fail` | `92.9972` | `95` | `0` | `197611ms` | n/a | n/a | mean below `93` by one raw point |
| outside holdout | `pass` | `93.35` | `94.5` | `0` | `199055ms` | `224644ms` | `231383ms` | passed |

This update makes the checkpoint stricter and more faithful to the active goal: outside-corpus movement is real, but the current source state is not accepted overall because original-50 p95 is over the bounded runtime allowance and all-unique still misses `93.0000`.

## Bounded Runner Follow-Up

The first monolithic deterministic outside-holdout attempt was stopped after the first item exceeded the intended 5-minute wall without producing row output. To fix that validation gap, `scripts/bounded-holdout-validation.ts` now runs each PDF through the existing deterministic batch path in a separate child process with an external timeout, `TMPDIR` pointed at `/mnt/pdf-review`, and aggregate `baseline_report.json` output.

Completed bounded run:

- `Input/virginia_dcjs_research_holdout_2026_05_18`
- `/mnt/pdf-review/pdfaf-validation/virginia-dcjs-20pdf-bounded-2026-05-21-r1`
- command shape: `bounded-holdout-validation.ts ... --limit 20 --per-pdf-timeout-ms 300000 --tmp-root /mnt/pdf-review/pdfaf-tmp`
- result: `20/20` completed, mean `91.15`, median `94.5`, `false_positive_applied=0`, no timeout rows
