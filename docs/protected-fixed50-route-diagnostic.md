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

## Next Step

The next checkpoint should collect protected-route repeats for the four non-parked rows, with focus on same-state `figure-4702` first. A future behavior change must be narrower than the rejected alt-in-sequence probe and must pass a targeted protected-baseline subset before fixed-50.
