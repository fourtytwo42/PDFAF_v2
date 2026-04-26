# Stage 120 Table Recovery Blocked

Date: 2026-04-26

Stage 120 stayed diagnostic-first. It did not change remediation routing,
scoring, gate semantics, or rendering behavior.

## Decision

Blocked for implementation in this pass. Fresh table-focused samples improved
cleanly under the current table path, but they did not expose a new stable
table residual that justified widening table behavior.

## Evidence

- `Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage117-table-sample-2026-04-26-r1`
- `Output/from_sibling_pdfaf_v1_edge_mix/run-stage117-table-focus-2026-04-26-r1`
- `Output/from_sibling_pdfaf_v1_edge_mix_2/stage118-figure-alt-diagnostic-2026-04-26-r1`
- `Output/experiment-corpus-baseline/stage111-runtime-tail-sample-2026-04-26-r1`
- `Output/experiment-corpus-baseline/stage100-protected-parity-diagnostic-2026-04-26-r1`
- `Output/experiment-corpus-baseline/stage94-boundary-subtype-fresh-evidence-2026-04-26-r1`

Observed table outcomes:

- `v1-4722` improved from `42/F` to `94/A`
- `v1-4627` improved from `68/D` to `93/A`
- `v1-4178` improved from `37/F` to `98/A`
- `v1-4699` improved from `77/C` to `91/A`
- `v1-4700` improved from `59/F` to `84/B`
- `false-positive applied` stayed `0`

Residuals after the focused runs were not table-driven:

- one sample ended with only `figure_alt_tail`
- the other sample ended with no table residuals at all

## Implication

The current table-recovery path already handles the sampled stable table rows
well enough to clear the table family. There is no fresh invariant-backed table
residual here that supports a safe general table change.

## Next Work

Return only if a new stable row shows checker-visible table markup evidence
that survives the existing repeat and false-positive guardrails.
