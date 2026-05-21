# Metadata Structural Optimism Diagnostic

Date: 2026-05-21

This is a generalized read-only diagnostic for metadata-only analyzer optimism. It compares existing benchmark JSON and does not analyze PDFs, remediate PDFs, write remediated PDFs, call PAC/POC/ODL/Java/semantic AI, or change production behavior.

Local artifact:

- `/mnt/pdf-review/pdfaf-validation/metadata-structural-optimism-2026-05-21-r1/metadata-structural-optimism-diagnostic.md`

Compared artifacts:

- Reference current baseline: `/mnt/pdf-review/pdfaf-validation/original50-form-xobject-content-confidence-2026-05-21-r1/baseline_report.json`
- Current original-50 tree-cap calibration run: `/mnt/pdf-review/pdfaf-validation/original50-figure-alt-tree-cap-calibration-2026-05-21-r1/baseline_report.json`
- Focused regression repeat: `/mnt/pdf-review/pdfaf-validation/figure-alt-tree-cap-regression-repeat-2026-05-21-r1/run-r1/baseline_report.json`

## Result

Decision: `document_stricter_score_candidate`

Summary:

- Compared rows: `50`
- Reference metadata structural optimism rows: `1`
- Current metadata structural drop volatility rows: `0`
- `false_positive_applied`: `0`

The only focus row is `4516`:

| Row | Reference | Current | Focused repeat | Metadata-stage evidence |
| --- | ---: | ---: | ---: | --- |
| `4516` | `85/B` | `59/F` | `55/F` | Reference metadata-only stage moves `43 -> 85` while `title_language 0 -> 100` and unrelated structural categories also jump: `alt_text`, `table_markup`, and `heading_structure`. Current/repeat metadata stages move only `43 -> 51`, with title/language fixed but no unrelated structural gain. |

## Interpretation

This supports a stricter-grading interpretation for the `4516` original-50 regression:

- the older `85/B` route is not strong evidence of a valid repair state;
- its large score jump appears to come from analyzer/route optimism during a metadata-only stage;
- current/repeat artifacts do not reproduce the unrelated structural gains;
- this is not caused by the figure/alt tree-cap scoring calibration and does not justify changing that predicate.

## Decision

No scorer, planner, mutator, timeout, checkpoint, PAC-gate, or Docker/API behavior changes are accepted from this diagnostic.

The cleanest acceptance path is an explicit gate decision: if the team accepts that `4516`'s former `85/B` reference route was analyzer-optimistic, then the current lower `4516` score can be treated as stricter/correct grading rather than a true regression caused by the latest PAC-aligned scoring work. If that is not accepted, the next work should be a dedicated analyzer-stabilization project, not another figure/alt scoring change.
