# Stage 1 Close-Out

Stage 1 is closed.

The evidence model, score caps, additive reporting fields, benchmark comparison tooling, and Stage 1 acceptance audit are all in place. The close-out decision was based on the calibrated Stage 1 benchmark runs and the acceptance audit generated from those runs.

## Accepted Artifacts

- Analyze run: `Output/experiment-corpus-baseline/run-stage1-post-analyze`
- Full remediation run: `Output/experiment-corpus-baseline/run-stage1-post-full`
- Analyze comparison: `Output/experiment-corpus-baseline/comparison-stage1-analyze/comparison.md`
- Full comparison: `Output/experiment-corpus-baseline/comparison-stage1-full/comparison.md`
- Acceptance audit: `Output/experiment-corpus-baseline/stage1-acceptance/stage1-acceptance.md`

## Acceptance Conclusion

- Stage 1 keeps heuristic-only categories from surfacing as full-confidence passes.
- Pre/post benchmark comparison exists for both `analyze` and `full`.
- Runtime deltas are small enough that Stage 1 evidence shaping is not the p95 source.
- The Stage 1 acceptance audit classifies every remaining document-level manual-review case.
- Acceptance audit result: `suspicious-overbroad = 0`.
- Final calibrated counts:
  - analyze `manualReviewRequiredCount = 45`
  - post-remediation `manualReviewRequiredCount = 28`
  - newly flagged after remediation = `1`

## Remaining Limitations Deferred To Later Stages

- `color_contrast` remains a category-level manual review signal, but it is not a document-level blocker when the category is non-applicable.
- Stage 1 does not attempt to solve false positives caused by missing structural classification. That work starts in Stage 2.
- The current heavy runtime tail still sits in structure/font remediation paths, not in evidence shaping.
- Remaining document-level manual review after remediation is concentrated in:
  - structural reading-order debt
  - OCR-backed text extractability debt
  - alt-text ownership debt
  - PDF/UA proxy high-pass confirmation debt

## Stage 2 Entry

Stage 2 should start with read-only structural classification and compact failure profiling using existing `pdfjs + pikepdf` signals. Planner and routing changes remain out of scope until that classification layer exists.
