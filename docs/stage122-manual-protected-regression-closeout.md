# Stage 122 Manual Protected Regression Closeout

Stage 122 is diagnostic-only. It does not change remediation routing, font behavior,
scoring, benchmark-gate semantics, or auto-evolve behavior.

## Evidence

- Current full run: `Output/experiment-corpus-baseline/run-stage121-current-node22-2026-04-26-r1`
- Gate output: `Output/experiment-corpus-baseline/stage121-current-vs-stage42-gate-2026-04-26-r1`
- Stage 122 diagnostic: `Output/experiment-corpus-baseline/stage122-protected-regression-closeout-2026-04-26-r2`
- Stage 122 target run with PDFs: `Output/experiment-corpus-baseline/run-stage122-target-protected-2026-04-26-r1`
- Stage 122 exact-buffer repeat: `Output/experiment-corpus-baseline/stage122-analyzer-repeat-target-2026-04-26-r1`

The current full run passes every hard gate except `protected_file_regressions`.
Runtime p95, F count, false-positive applied, and Stage 75 font gains remain in
the accepted envelope.

## Row Classification

| Row | Full-run classification | Target/repeat evidence | Decision |
| --- | --- | --- | --- |
| `long-4516` | `deterministic_reanalysis_drop` in the full run (`87/B` in-run, reanalyzed `54/F`) | Target final PDF repeat is stable below floor (`69,69,69,69,69`) | No safe checkpoint or route guard is justified. Treat as stable below-floor analyzer/route debt. |
| `structure-3775` | `stable_below_floor_no_safe_state` in the full run (`79/C`) | Target run reaches floor-safe `93/A`; exact-buffer repeats stay floor-safe except one protected-category swing (`93,93,93,93,91`) | Evidence is repeat/route volatile, not a deterministic harmful tool sequence. Do not add a broad guard. |
| `long-4683` | `same_buffer_analyzer_variance` in the full run (`69,86,69`) | Target exact-buffer repeats include one floor-safe pass (`55,55,90,55,55`) | Existing best-of-N behavior is still the right containment. No new mutator guard. |

## Decision

Do not implement a Stage 122 remediation behavior change from this evidence.
The two rows with floor-safe repeats are analyzer/reanalysis volatile, and the
remaining row does not expose a floor-safe external buffer. A broad checkpoint,
route guard, or repeat-policy change would be speculative and risks repeating
the earlier protected-route regressions.

Next protected acceptance work should target `long-4516` specifically with a raw
Python structural analyzer comparison between the in-run `87/B` state and the
written final PDF that repeats at `69/D`. Do not pull a new corpus or tune fonts
until that row has a safe external state or a proven analyzer bug.
