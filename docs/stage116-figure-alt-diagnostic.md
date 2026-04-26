# Stage 116 Figure/Alt Diagnostic

Date: 2026-04-26

Stage 116 stayed diagnostic-first. It did not change remediation routing,
scoring, route guards, gate semantics, or rendering behavior.

## Decision

Blocked for implementation in this pass. A fresh single-row figure/alt sample
showed that the current pipeline can materially improve a figure-heavy row, but
it did not justify a new general figure/alt rule beyond the existing safe
mechanism.

## Evidence

Fresh local benchmark run:

- `Output/experiment-corpus-baseline/run-stage116-figure-4466-r1`

Observed outcome:

- `figure-4466` improved from `71/C` to `96/A`
- weak category remained `alt_text`
- false-positive applied stayed `0`
- remediation scheduled `canonicalize_figure_alt_ownership` and three
  `set_figure_alt_text` applications
- the final row still required manual review for alt text ownership and
  reading order, so this sample does not justify broadening figure routes

The run confirms checker-visible figure/alt recovery is still a valid target
family, but it does not provide new evidence for a broader rule that would
improve the already-rejected Stage 115 `v1-4145` third-retag path.

## Validation

- Checked for an existing local LLM/listener before benchmarking; an existing
  `llama-server` process was present.
- Ran the focused deterministic benchmark with `--no-semantic`.

## Next Work

Keep figure/alt recovery limited to rows with fresh, stable checker-visible
evidence that demonstrate a new mechanism or a clearly better target selection
than the current bounded alt-ownership progression. Otherwise pivot to a
different residual family instead of reopening the same capped retag pattern.
