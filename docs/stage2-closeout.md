# Stage 2 Close-Out

Stage 2 is closed.

This stage added a read-only structural classification and failure-profiling layer on top of the existing Stage 1 evidence model. It did not change remediation routing, playbook hashes, or planner behavior.

## Accepted Artifacts

- Analyze run: `Output/experiment-corpus-baseline/run-stage2-analyze`
- Full remediation run: `Output/experiment-corpus-baseline/run-stage2-full`
- Stage 1 vs Stage 2 full comparison: `Output/experiment-corpus-baseline/comparison-stage2-full-vs-stage1/comparison.md`

## Acceptance Conclusion

- Every file in the 50-file corpus received:
  - `structuralClassification`
  - `failureProfile`
- Full corpus counts:
  - analyze success `50/50`
  - remediate success `50/50`
- Structure class distribution on the Stage 2 full run:
  - `partially_tagged = 33`
  - `untagged_digital = 17`
- Primary failure-family distribution on the Stage 2 full run:
  - `structure_reading_order_heavy = 33`
  - `mixed_structural = 13`
  - `figure_alt_ownership_heavy = 3`
  - `font_extractability_heavy = 1`
- Direct Stage 1 vs Stage 2 full-run comparison shows no runtime inflation from Stage 2:
  - analyze median runtime delta `-85.65 ms`
  - analyze p95 runtime delta `-123.69 ms`
  - remediation median runtime delta `-678.11 ms`
  - remediation p95 runtime delta `-2707.59 ms`

## Why Stage 2 Counts As Closed

- The stage goal was read-only classification and grouped failure profiling, not planner changes.
- The engine now emits richer structure/failure metadata everywhere it needs to:
  - API / `AnalysisResult`
  - HTML report
  - benchmark artifacts
  - learning-layer inspection helper
- The corpus shows stable, repeated failure-family patterns within cohorts without a measurable runtime penalty.
- No new extraction pass, rendering pass, or semantic pass was introduced.

## Remaining Limitations Deferred To Later Stages

- The failure-family distribution is useful but still broad; most files still cluster into `structure_reading_order_heavy` or `mixed_structural`.
- Stage 2 does not change planner behavior, so the new classifications are observability and future-routing inputs only.
- Stronger differentiation between figure, font, and structural debt should improve in later stages as bounded detection improves.

## Stage 3 Entry

Stage 3 should use the new Stage 2 structure/failure metadata to guide bounded detection upgrades for:
- reading-order checks on suspicious or sampled pages
- annotation ordering and `/StructParent` integrity
- tagged-content and MCID ownership invariants
- list/table legality checks

Stage 3 should remain bounded and avoid introducing broad runtime inflation.
