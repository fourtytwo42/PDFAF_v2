# Runtime Tail Gate Diagnostic

Date: 2026-05-21

This is a read-only runtime gate diagnostic for the provisional figure/alt tree-cap scoring calibration. It compares existing `baseline_report.json` artifacts and a focused `4683` repeat; it does not analyze PDFs directly, remediate PDFs, write PDFs, call PAC/POC/ODL/Java/semantic AI, or change production behavior.

Local artifacts:

- `/mnt/pdf-review/pdfaf-validation/runtime-tail-gate-diagnostic-2026-05-21-r2/runtime-tail-gate-diagnostic.md`
- `/mnt/pdf-review/pdfaf-validation/runtime-tail-4683-focus-2026-05-21-r1/baseline_report.json`

## Result

Decision: `runtime_gate_blocked`

Gates:

- `false_positive_applied=0`
- no-new-timeouts: `false`
- runtime-within-bound: `false`

Reference original-50 artifact:

- `/mnt/pdf-review/pdfaf-validation/original50-form-xobject-content-confidence-2026-05-21-r1/baseline_report.json`
- all-row mean `92.14`
- p95 `229628ms`
- timeout rows: `4438`

Current bounded repeat artifact:

- `/mnt/pdf-review/pdfaf-validation/original50-figure-alt-tree-cap-bounded-repeat-2026-05-21-r1/baseline_report.json`
- all-row mean `90.22`
- p95 `283638ms`
- timeout rows: `4438`, `4683`

The blocking rows are:

| Row | Classification | Meaning |
| --- | --- | --- |
| `4683` | `new_timeout_gate_blocker` | The current broad repeat timed out where the reference completed. |
| `4438` | `repeated_timeout_known_debt` | This is the same known timeout in both reference and current runs. |
| `4516` | `p95_runtime_driver` | It completed, but at `283638ms`, and also remains separate stricter-score adjudication debt. |
| `4076` | `analyzer_dominated_completed_tail` | It completed at `214258ms`; recorded tool time explains only about `20%` of wall time. |

## Focused 4683 Repeat

A one-row bounded repeat of `4683` completed:

- report: `/mnt/pdf-review/pdfaf-validation/runtime-tail-4683-focus-2026-05-21-r1/baseline_report.json`
- score: `48/F -> 59/F`
- duration: `232506ms`
- `false_positive_applied=0`
- timeout/error rows: `0`
- recorded tool duration: about `14388ms`
- tool-duration ratio: `0.0619`

This means the broad-run `4683` timeout is runtime/analyzer volatility, not a deterministic per-PDF timeout under current source. It remains too close to the wall and too low-scoring to use as acceptance evidence.

## Benchmark Runtime Telemetry

`scripts/baseline-corpus-batch.ts` now writes compact `runtimeSummary` telemetry into benchmark rows. This is reporting-only: it does not change scoring, remediation planning, mutation behavior, PAC gates, timeout defaults, API behavior, or Docker behavior.

Telemetry repeat:

- report: `/mnt/pdf-review/pdfaf-validation/runtime-tail-4683-telemetry-2026-05-21-r1/baseline_report.json`
- score: `48/F -> 59/F`
- duration: `231712ms`
- `false_positive_applied=0`
- `runtimeSummary` present: `true`

Telemetry breakdown for `4683`:

- initial analysis: `22360ms`
- final analysis: `22614ms`
- deterministic remediation total: `209340ms`
- stage reanalysis time: `65221ms`
- stage timing total: `71581ms`
- runtime tool timing total: `17722ms`
- top stage reanalysis blocks:
  - stage 2: `25329ms` total, `21182ms` reanalysis
  - stage 4: `23765ms` total, `22614ms` reanalysis
  - stage 1: `21797ms` total, `21425ms` reanalysis
- early exits: `verified_low_score_checkpoint_timeout_return` x `2`

This narrows the next runtime design: the cost is dominated by repeated native analysis/reanalysis of a large structured PDF plus low-score checkpoint pressure, not by one slow mutator. Any behavior change should therefore target general reanalysis reuse/admission or verified checkpoint policy, not figure/alt scoring or PAC exceptions.

## Decision

Keep the figure/alt tree-cap scoring calibration provisional.

The next useful runtime lane is not a score cap or PAC exception. It is a general analyzer/runtime-tail design that can either:

- reduce repeated high-cost reanalysis on rows where recorded tool work explains little of the wall time, or
- return only verified, PAC-honest checkpoints that already meet the existing bounded checkpoint rules.

Do not lower timeout floors, widen checkpoint returns, suppress PAC evidence, or treat the focused `4683` completion as acceptance. Any future behavior needs targeted positives, controls, original-50 validation, `false_positive_applied=0`, no new hard timeouts, and bounded p95.
