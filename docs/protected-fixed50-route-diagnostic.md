# Protected Fixed-50 Route Diagnostic

Date: 2026-05-09

## Decision

No behavior change is accepted from this checkpoint. The exact protected-baseline fixed-50 run still has non-parked route/reanalysis failures, and the one narrow `figure-4702` behavior probe was not repeatable in a broader targeted subset.

Generated diagnostic:

- `Output/experiment-corpus-baseline/protected-fixed50-route-diagnostic-2026-05-09-r1`

Inputs:

- Reference run: `Output/experiment-corpus-baseline/run-long4516-metadata-confirm-fixed50-2026-05-09-r1`
- Protected run: `Output/experiment-corpus-baseline/run-goal-protected-fixed50-2026-05-09-r1`
- Stage42 run: `Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7`

## Classification

| Row | Classification | Reference | Protected | Notes |
| --- | --- | ---: | ---: | --- |
| `figure-4702` | `protected_route_volatility` | `91/A` | `59/F` | Same replay state `0f98a17f90dd7ca07d207a67`; `remap_orphan_mcids_as_artifacts` is accepted as `structure_annotation_sequence_recovered` in the reference route and rejected by `pdfua.annotations.tagged_annotations_present` in the protected run. |
| `long-4470` | `protected_route_volatility` | `94/A` | `59/F` | Diverges upstream during metadata repair; multiple later PAC rejections appear. |
| `long-4683` | `protected_final_reanalysis_drop` | `91/A` | `59/F` | Protected run reaches `92/A` in-run but reanalyzes to `59/F`; do not preserve without proving analyzer drift rather than real PDF debt. |
| `long-4700` | `protected_route_volatility` | `86/B` | `78/C` | Same first tool/state but score diverges; remains below B in the protected run. |

## Rejected Probe

An uncommitted experiment added `repair_alt_text_structure` to the existing `figure-4702` structure-annotation sequence.

- Single-row protected validation: `Output/experiment-corpus-baseline/run-figure4702-protected-sequence-alt-target-2026-05-09-r1`
  - Result: `figure-4702 91/A`, `false_positive_applied = 0`.
- Broader protected targeted subset: `Output/experiment-corpus-baseline/run-figure4702-protected-sequence-alt-target-2026-05-09-r2`
  - Result: `figure-4702 59/F`.

Decision: the probe was reverted and is not safe to promote. It proves there may be a recoverable route, but not a repeatable protected-baseline behavior change.

## Protected Repeat Evidence

Additional focused protected-baseline repeats after reverting the probe:

- `Output/experiment-corpus-baseline/run-protected-route-repeat-focus-2026-05-09-r1`
  - `figure-4702`: `59/F`
  - `long-4470`: `93/A`
  - `long-4683`: hard timeout
  - `long-4700`: `78/C`
- `Output/experiment-corpus-baseline/run-figure4702-protected-current-repeat-2026-05-09-r1`
  - `figure-4702`: `91/A`

Interpretation:

- `figure-4702` is recoverable in isolation but not stable in protected multi-row/full-run context. Treat it as run-context route volatility, not as a proven safe behavior target.
- `long-4470` recovered in the focused repeat, so its full-run `59/F` is route volatility unless a future repeat proves a stable bad same-state decision.
- `long-4683` remains runtime/final-reanalysis debt; the focused repeat hard-timed out.
- `long-4700` is stable residual strict table/header debt at `78/C`, not a runtime fix.

## Next Step

The next checkpoint should not patch `figure-4702` from single-row success. It should either isolate why multi-row protected context changes the route, or park `figure-4702` as run-context route volatility if acceptance can proceed with documented debt. A future behavior change must be narrower than the rejected alt-in-sequence probe and must pass a targeted protected-baseline subset before fixed-50.
