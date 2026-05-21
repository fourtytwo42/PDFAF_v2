# Runtime Reanalysis Policy Diagnostic

Date: 2026-05-21

This is a read-only diagnostic for runtime-tail rows after benchmark runtime telemetry was added. It reads existing `baseline_report.json` artifacts only; it does not analyze PDFs, remediate PDFs, write PDFs, call PAC/POC/ODL/Java/semantic AI, or change production behavior.

Local artifact:

- `/mnt/pdf-review/pdfaf-validation/runtime-reanalysis-policy-diagnostic-2026-05-21-r1/runtime-reanalysis-policy-diagnostic.md`

## Result

Decision: `plan_reanalysis_admission_probe`

The diagnostic found one supported runtime-policy candidate and three rows that should not be used to justify broad behavior yet:

| Row | Classification | Meaning |
| --- | --- | --- |
| `4683` | `reanalysis_dominated_low_score_candidate` | Completed at `59/F` in `231712ms`; `65221ms` was stage reanalysis, runtime tool timing was only `7.65%` of wall time, and bounded-work evidence included `verified_low_score_checkpoint_timeout_return x2`. |
| `4438` | `repeated_timeout_known_debt` | Known hard-timeout debt; no policy should infer a safe return state without a trace/checkpoint state. |
| `4516` | `score_adjudication_not_runtime_policy` | Explicit stricter-score adjudication row; runtime policy must not mask the current lower score. |
| `4076` | `p95_driver_needs_runtime_summary` | Runtime-tail row, but the compared artifact predates `runtimeSummary`; rerun with telemetry before designing behavior around it. |

## Interpretation

`4683` is the only row that currently supports a next behavior probe. The evidence points at repeated high-cost native analysis/reanalysis plus low-score checkpoint pressure, not a slow mutator, score cap problem, PAC exception, or figure/alt-specific issue.

The next stage should therefore be a separate guarded behavior proof for a general reanalysis-admission or PAC-honest checkpoint policy. It should not change scoring, PAC gates, strictness, timeout floors, or figure/alt calibration.

## Guardrails For A Future Probe

Any future behavior stage must be narrow and independently validated:

- require runtime telemetry showing high reanalysis time and low tool-time ratio;
- require an already verified, PAC-honest checkpoint/final state, not a partial state chosen only to avoid a zero;
- reject stricter-score adjudication rows such as `4516`;
- keep known hard-timeout rows such as `4438` parked until they have trace/checkpoint evidence;
- collect telemetry for `4076` before using it as a runtime-policy target;
- preserve `false_positive_applied=0`, no new hard timeouts, and bounded p95 before acceptance.

## Decision

Keep the current figure/alt tree-cap scoring calibration provisional. The supported next runtime lane is a diagnostic-first `4683` reanalysis/checkpoint admission proof with controls, not a scorer or PAC relaxation.
