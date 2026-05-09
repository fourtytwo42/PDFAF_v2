# Short-4074 Protected Drift Diagnostic

Date: 2026-05-09

## Decision

`short-4074` is not ready for a behavior change. The fixed-50 artifact shows a protected reanalysis figure-applicability cliff, but focused single-row repeats do not reproduce it. Treat this as analyzer/applicability volatility until a repeatable same-buffer failure or a stable object-level figure-alt target is proven.

No PAC scoring, PAC gate, timeout, planner, checkpoint-floor, or repair behavior changed in this checkpoint.

## Evidence

Primary diagnostic:

- Run: `Output/experiment-corpus-baseline/run-long4516-metadata-confirm-fixed50-2026-05-09-r1`
- Output: `Output/experiment-corpus-baseline/short4074-protected-drift-diagnostic-2026-05-09-r1`
- Classification: `protected_reanalysis_figure_applicability_drift`

The fixed-50 row moves from `95/A` in-run to `59/F` after protected reanalysis. The drop is driven by figure applicability changing:

- Extracted figures: `0 -> 1`
- Tree figures: `1 -> 1`
- Alt score/applicable: `100/not applicable -> 0/applicable`
- New PAC reasons:
  - `pdfua.figure.alt_present`
  - `pdfua.figure.checker_visible_alt_present`

Focused deterministic repeats without semantics:

- `Output/experiment-corpus-baseline/run-short4074-protected-drift-repeat-2026-05-09-r1`: `95/A -> 95/A`, extracted figures `0 -> 0`
- `Output/experiment-corpus-baseline/run-short4074-protected-drift-repeat-2026-05-09-r2`: `95/A -> 95/A`, extracted figures `0 -> 0`
- `Output/experiment-corpus-baseline/run-short4074-protected-drift-repeat-2026-05-09-r3`: `95/A -> 91/A`, extracted figures `0 -> 0`

## Interpretation

The failed fixed-50 row has a real checker-facing symptom in that artifact: protected reanalysis makes figure-alt evidence measurable. However, the symptom is not repeatable in focused runs. Preserving the fixed-50 `95/A` checkpoint would be unsafe without same-buffer protected debug evidence because it could hide real figure-alt debt.

The Stage 42 protected-baseline artifact is currently missing locally, so exact Stage 41 protected debug-state capture could not be run in this checkpoint. Restoring or regenerating that baseline is required before final literal Stage 41 acceptance.

## Next Step

Do not patch `short-4074` yet. The remaining acceptance work should classify or address the other non-parked F row, `font-4057`, or restore/regenerate the Stage 42 protected baseline so the exact Stage 41 gate and protected debug captures can run again.
