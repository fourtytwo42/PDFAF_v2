# Stage 117 Table Recovery Diagnostic

Stage 117 stayed diagnostic-first. It did not keep a remediation behavior
change.

## Decision

Blocked for implementation in this pass. Fresh table-focused edge-mix samples
improved cleanly under the current table path, but they did not produce a new
stable table residual that justified widening table behavior.

## Evidence

Focused deterministic sample runs:

- `Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage117-table-sample-2026-04-26-r1`
- `Output/from_sibling_pdfaf_v1_edge_mix/run-stage117-table-focus-2026-04-26-r1`

Observed table-oriented outcomes:

- `v1-4722` improved from `42/F` to `94/A`
- `v1-4627` improved from `68/D` to `93/A`
- `v1-4178` improved from `37/F` to `98/A`
- `v1-4699` improved from `77/C` to `91/A`
- `v1-4700` improved from `59/F` to `84/B`
- `false-positive applied` stayed `0` in both sample runs

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
