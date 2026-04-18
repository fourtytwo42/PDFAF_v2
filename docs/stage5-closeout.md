# Stage 5 Close-Out

Stage 5 is closed.

This stage expanded the accepted deterministic structural repair set, kept the Stage 4 structural-confidence safeguard in force, and added additive remediation outcome classification so unresolved structural debt is reported explicitly instead of being silently retried or overstated.

## Accepted Artifacts

- Full remediation run: `Output/experiment-corpus-baseline/run-stage5-full`
- Stage 4 vs Stage 5 full comparison: `Output/experiment-corpus-baseline/comparison-stage5-full-vs-stage4/comparison.md`
- Stage 5 acceptance audit: `Output/experiment-corpus-baseline/stage5-acceptance/stage5-acceptance.md`

## Acceptance Conclusion

- Stage 5 promotes the previously hinted structural primitives into the accepted deterministic repair set:
  - list legality repair
  - high-confidence table header repair
  - annotation ownership and tab-order normalization
  - orphan-MCID cleanup
  - deterministic heading hierarchy normalization
- Stage 5 adds additive `remediationOutcomeSummary` output across the remediate API, HTML report, and experiment-corpus benchmark artifacts.
- The accepted Stage 4→5 comparison package shows lower remediation runtime than Stage 4 on the accepted full-run comparison:
  - remediation wall-runtime median delta `-188.16 ms`
  - remediation wall-runtime p95 delta `-51.99 ms`
- The accepted Stage 5 audit keeps `accepted confidence regressions = 0`.
- The accepted Stage 5 outcome distribution is:
  - `fixed: 14`
  - `partially_fixed: 7`
  - `needs_manual_review: 4`
  - `unsafe_to_autofix: 25`
- The accepted Stage 5 audit shows measurable deterministic debt reduction in the targeted families:
  - lists `37 -> 17`
  - tables `9 -> 8`
  - annotations `1231 -> 531`
  - tagged content `6011 -> 751`
  - headings `20 -> 18`

## Why Stage 5 Counts As Closed

- The stage goal was not a broad semantic expansion. It was deterministic structural repair breadth plus honest unresolved-state reporting.
- The accepted benchmark package includes direct Stage 4→5 comparison plus a Stage 5 acceptance audit centered on residual deterministic debt families, runtime movement, and outcome classification.
- The outcome model now distinguishes files that were fixed from files that remain partial, manual-review, or unsafe-to-autofix, which closes the roadmap gap around honest residual-state reporting.

## Remaining Limitations Deferred To Later Stages

- Stage 5 heading work remains deterministic only. Broader heading promotion and semantic relabeling remain Stage 6 work.
- Stage 5 does not attempt speculative orphan-MCID attachment when there is no deterministic target; it prefers bounded artifacting or explicit unsafe-to-autofix classification.
- Stage 5 improves structural coverage, but the slowest structure/font files remain expensive and need Stage 7 performance hardening.

## Stage 6 Entry

Stage 6 should focus on gated semantic improvement:
- tighter semantic entry conditions for figures and headings
- deterministic evidence before and after semantic mutation
- no semantic-only fully trusted pass
