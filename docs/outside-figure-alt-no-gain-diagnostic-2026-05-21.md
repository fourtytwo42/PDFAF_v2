# Outside Figure/Alt No-Gain Diagnostic - 2026-05-21

This checkpoint narrows the outside-holdout figure/alt lane identified by the low-row diagnostic. It reads existing benchmark replay evidence from `baseline_report.json` files. It does not analyze PDFs, remediate PDFs, write remediated PDFs, call PAC/POC/ODL/Java, call semantic AI, or change production scoring/planning behavior.

## Source Artifacts

- Script: `scripts/outside-figure-alt-no-gain-diagnostic.ts`
- Virginia local report: `/mnt/pdf-review/pdfaf-validation/virginia-dcjs-figure-alt-no-gain-2026-05-21-r1/outside-figure-alt-no-gain-diagnostic.md`
- Original-50 control report: `/mnt/pdf-review/pdfaf-validation/original50-figure-alt-no-gain-2026-05-21-r1/outside-figure-alt-no-gain-diagnostic.md`

## Virginia Holdout Result

- Source run: `/mnt/pdf-review/pdfaf-validation/virginia-dcjs-20pdf-bounded-2026-05-21-r1/baseline_report.json`
- Rows: `20`
- Focus rows: `8`
- Decision: `plan_tree_cap_scoring_calibration_proof`
- `false_positive_applied`: `0`
- Scoring candidates: `1`
- Behavior candidates: `0`

The single candidate is:

| Row | Score | Evidence |
| --- | ---: | --- |
| `va-11-drug-seizures-overdose-fatalities-quarterly-update-december-2025.pdf` | `59/F` | Replay evidence reaches `checkerVisibleFigureAltCount=6/6`, but final `alt_text` remains `20` because `treeFigureMissingForExtractedFigures=true` with `treeFigureCount=0` and `extractedFigureCount=3`. |

Interpretation: this is probably not a “write more alt text” lane. Existing deterministic `set_figure_alt_text` writes already reach full checker-visible figure-alt coverage in replay evidence. The likely gap is native scoring/evidence alignment: the strict tree-figure-missing cap may be over-applying when the native checker-visible figure target evidence is fully alt-owned. Any score-active change must preserve strictness by keeping PDF/UA/structure debt visible somewhere else if real role/tree debt remains.

## Original-50 Control Result

- Source run: `/mnt/pdf-review/pdfaf-validation/original50-form-xobject-content-confidence-2026-05-21-r1/baseline_report.json`
- Rows: `50`
- Focus rows: `5`
- Decision: `keep_figure_alt_diagnostic_only`
- `false_positive_applied`: `0`
- Scoring candidates: `0`
- Behavior candidates: `0`

The control report found one partial bounded-alt row, `4683`, but it did not match the tree-cap scoring-calibration candidate: replay reached only `5/6` checker-visible alt coverage, with `treeFigureMissingForExtractedFigures=false`. The original-50 artifact therefore does not contradict the narrow `va-11` scoring-calibration hypothesis.

## Decision

The next stage should be a scoring-calibration proof, not a remediation mutator:

- Candidate rule shape: do not let `treeFigureMissingForExtractedFigures` alone force the `alt_text=20` cap or the strict overall “no checker-visible alt” blocker when native checker-visible figure targets are reachable, non-artifact, resolved as `/Figure`, and all have non-empty `/Alt`.
- Preserve strictness: leave manual-review/PDF-UA/structure evidence visible when tree or ownership debt remains; do not suppress PAC evidence.
- Required proof: scorer unit tests for full checker-visible alt coverage versus missing/partial controls, targeted validation on `va-11`, original-50 deterministic validation, and outside holdout re-run before claiming broad progress.

No production behavior was changed in this checkpoint.
