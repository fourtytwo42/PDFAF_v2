# Stage 48A D/F Tail Diagnostic

Stage 48A is diagnostic-only. It adds a reusable D/F tail report that reads a
full-corpus `remediate.results.json` and classifies each D/F row by dominant
blocker family without changing remediation behavior.

Baseline input:

- `Output/experiment-corpus-baseline/run-stage45-full-2026-04-23-r2`

Generated diagnostic output from the first run:

- `Output/experiment-corpus-baseline/stage48-df-tail-diagnostic-2026-04-24-r1`

Findings:

- Tail count: `7`
- Recommended family distribution: `figure_alt_tail: 4`, `zero_heading_tail: 1`, `mixed_tail: 1`, `reading_order_tail: 1`
- First fixer target recommended by the diagnostic: `figure_alt_tail`

Rows classified by the diagnostic:

- `font-4057`: `figure_alt_tail` with table residuals.
- `font-4172`: `figure_alt_tail`.
- `long-4470`: `figure_alt_tail` with zero-heading and reading-order residuals.
- `figure-4754`: `figure_alt_tail` with heading and reading-order residuals.
- `structure-4207`: `zero_heading_tail`.
- `structure-4076`: `mixed_tail`.
- `structure-4122`: `reading_order_tail`.

Rejected Stage 48B candidate:

- A narrow Python experiment attempted to promote root-reachable figure-like roles
  (`InlineShape`, `Shape`, `Formula`) to checker-visible `/Figure` nodes when a
  file had zero root-reachable figures.
- Target run: `Output/experiment-corpus-baseline/run-stage48-target-2026-04-24-r1`.
- Result: the intended D/F figure rows did not improve (`font-4057`,
  `font-4172`, and `long-4470` stayed at `59/F`), while `structure-4076`
  regressed from `69/D` to `59/F`.
- Decision: revert the fixer experiment and keep Stage 48A as the checkpoint.

Next implementation should use the diagnostic output to design a more precise
figure/alt recovery path, or switch to the next-highest blocker family if a
targeted figure fix cannot produce invariant-backed gains without regressions.
