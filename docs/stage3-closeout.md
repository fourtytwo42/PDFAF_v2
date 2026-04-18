# Stage 3 Close-Out

Stage 3 is closed.

This stage added bounded structural detection upgrades on top of the Stage 2 structure/failure layer. It remained detection-only plus additive reporting. It did not change remediation routing, planner behavior, or playbook selection.

## Accepted Artifacts

- Analyze run: `Output/experiment-corpus-baseline/run-stage3-analyze`
- Full remediation run: `Output/experiment-corpus-baseline/run-stage3-full`
- Stage 2 vs Stage 3 analyze comparison: `Output/experiment-corpus-baseline/comparison-stage3-analyze-vs-stage2/comparison.md`
- Stage 2 vs Stage 3 full comparison: `Output/experiment-corpus-baseline/comparison-stage3-full-vs-stage2/comparison.md`
- Stage 3 acceptance audit: `Output/experiment-corpus-baseline/stage3-acceptance/stage3-acceptance.md`

## Acceptance Conclusion

- Stage 3 preserved a bounded analyze path:
  - Stage 2 vs Stage 3 analyze delta on the accepted analyze run:
    - score mean `-1.52`
    - score median `-2.00`
    - score p95 `-2.00`
    - wall-runtime median `+22.46 ms`
    - wall-runtime p95 `+35.84 ms`
- Stage 2 vs Stage 3 full comparison stayed acceptable for Stage 3 closeout:
  - remediation after-score mean delta `+0.04`
  - remediation reanalyzed mean delta `-0.28`
  - remediation wall-runtime median `+138.48 ms`
  - remediation wall-runtime p95 `-154.35 ms`
- The engine now emits a compact `detectionProfile` across:
  - API / `AnalysisResult`
  - HTML report
  - benchmark artifacts
- The Stage 3 acceptance audit classifies false-clean pressure by file and cohort using the same fixed 50-file corpus.
- One narrow Stage 3 calibration pass was used to tighten `reading_order` when annotation-order or equivalent bounded risk signals were present but the tagged-document floor still preserved a high pass.
- Accepted Stage 3 audit totals:
  - analyze false-clean pressure count `10`
  - analyze meaningful survivors `1`
  - post-remediation false-clean pressure count `27`
  - post-remediation meaningful survivors `8`
  - files cleared by remediation `3`

## Why Stage 3 Counts As Closed

- The stage goal was bounded detection improvement, not new extraction or new repair tools.
- The accepted benchmark package includes both analyze and full runs plus direct Stage 2→3 comparisons.
- Remaining structural pressure is now visible in a stable, machine-readable way through `detectionProfile` and the Stage 3 acceptance audit.
- The one allowed calibration pass was completed. Remaining meaningful survivors are explicitly documented instead of driving another Stage 3 loop.

## Remaining Limitations Deferred To Later Stages

- Stage 3 does not alter remediation routing or tool ordering. Routing consequences of the new signals belong to Stage 4.
- Stage 3 does not add new structural repair primitives. Repairs for residual list/table/annotation/tagged-content debt remain Stage 5 work.
- The longest runtime tail still sits in remediation-heavy structure and font paths, not in the Stage 3 detection pass itself.
- If a file still appears too clean despite signal pressure after the one allowed calibration pass, that residual mismatch should be handled by Stage 4 routing or later structural repair expansion rather than by adding more Stage 3 analysis.
- The remaining Stage 3 acceptance-audit calibration candidates are post-remediation `pdf_ua_compliance` survivors, not analyze-path `reading_order` survivors:
  - `short-4176`
  - `short-4660`
  - `figure-4466`
  - `figure-4609`
  - `figure-4702`
  - `structure-3661`
  - `structure-3994`
  - `font-4156`
- These survivors are driven mainly by residual tagged-content/path-paint and annotation-ownership signals after remediation, so they are deferred to Stage 4 routing and later structural repair work rather than another Stage 3 scoring-only patch.
