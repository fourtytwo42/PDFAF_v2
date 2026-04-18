# Stage 4 Close-Out

Stage 4 is closed.

This stage replaced broad planner behavior with deterministic-first remediation routing, added additive planner explainability in API/reporting output, and closed the remaining roadmap gap by rejecting score-improving stage results that lower overall structural-classification confidence.

## Accepted Artifacts

- Full remediation run: `Output/experiment-corpus-baseline/run-stage4-full`
- Stage 3 vs Stage 4 full comparison: `Output/experiment-corpus-baseline/comparison-stage4-full-vs-stage3/comparison.md`
- Stage 4 acceptance audit: `Output/experiment-corpus-baseline/stage4-acceptance/stage4-acceptance.md`

## Acceptance Conclusion

- Stage 4 routes deterministic structural debt into explicit route families instead of broad speculative tool execution.
- The planner can explain why each tool ran or was skipped through additive `planningSummary` output in the API, HTML report, and benchmark artifacts.
- The accepted Stage 4 comparison package shows lower remediation runtime than Stage 3 on the accepted full-run comparison:
  - remediation wall-runtime median delta `-230.93 ms`
  - remediation wall-runtime p95 delta `-3452.55 ms`
- Near-pass avoidance is now measurable in the Stage 4 audit instead of inferred from planner logs.
- Stage 4 now rejects score-improving stage results when they would lower `structuralClassification.confidence`.
- The Stage 4 acceptance audit verifies that accepted score-improving confidence regressions remain at `0`.
- The accepted closeout run records `172` structural-confidence rollbacks across `19` files, which confirms the safeguard is actively intercepting previously accepted but less trustworthy outcomes.
- The Stage 4 full-run mean score is lower than the pre-safeguard Stage 4 rerun because confidence-regressing post-pass mutations are now rejected instead of silently inflating the final score.

## Why Stage 4 Counts As Closed

- The stage goal was deterministic-first routing, cheap precondition gating, and planner explainability, not new structural repair breadth.
- The accepted benchmark package includes direct Stage 3→4 comparison plus a Stage 4 acceptance audit focused on route choice, near-pass behavior, runtime movement, and structural-confidence safeguards.
- The last roadmap-only requirement that was not previously enforced in code, score-improving confidence-regression rollback, is now implemented and observable in remediation output and benchmark rows.

## Remaining Limitations Deferred To Later Stages

- Stage 4 does not add new structural repair primitives; residual list, table, annotation, and tagged-content repair breadth remains Stage 5 work.
- Stage 4 uses only top-level `structuralClassification.confidence` for rollback decisions. It does not yet reject based on worsening individual structural signal counts when the confidence label stays unchanged.
- Semantic expansion remains gated and deferred; broader semantic improvement belongs to Stage 6.

## Stage 5 Entry

Stage 5 should focus on generic structural repair expansion for the residual deterministic debt that Stage 4 now routes more precisely:
- list nesting legality
- table header structure when confidence is high enough
- annotation ownership and tab-order normalization
- orphan MCID attachment or artifacting
- heading promotion from strong structural or layout evidence
