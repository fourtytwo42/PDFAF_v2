# Stage 109 Visual Stability Diagnostic

Date: 2026-04-26

Stage 109 stayed diagnostic-first. It did not change remediation routing,
scoring, or render behavior.

## Decision

Keep the reusable before/after render comparison path and the run-level
visual validation hook. No remediation behavior change was justified in this
pass.

## Evidence

- Fresh v1-edge corpus sample:
  - `Input/from_sibling_pdfaf_edgecase_corpus/manifest.json`
- Benchmark run:
  - `Output/from_sibling_pdfaf_edgecase_corpus/run-stage109-visual-stability-r1`
- Run-level visual report:
  - `Output/from_sibling_pdfaf_edgecase_corpus/stage109-visual-stability-run-2026-04-26-r1`

The sample compared two sibling-v1 edge rows with `--no-semantic` and wrote
remediated PDFs for visual comparison:

- `edge-4660` stayed visually stable
- `edge-4661` drifted on page 2 with `39,528 / 455,424` different pixels

That drift is visible and remains a blocker for any acceptance-use behavior
change. The validator correctly surfaced the regression, so the comparison
path is doing its job.

## Next Work

Treat `edge-4661` as a visual-drift candidate, not an acceptance-ready
remediation rule. If future remediation work targets this family, keep the
same visual validation hook in the loop and reject any change that introduces
unexplained pixel drift.
