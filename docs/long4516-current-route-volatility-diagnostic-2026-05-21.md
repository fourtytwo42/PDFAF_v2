# Long-4516 Current Route Volatility Diagnostic

Date: 2026-05-21

This is a read-only diagnostic for the current original-50 blocker after the figure/alt tree-cap scoring calibration. It compares existing benchmark JSON only; it does not analyze PDFs, remediate PDFs, write remediated PDFs, call PAC/POC/ODL/Java/semantic AI, or change production behavior.

Local artifact:

- `/mnt/pdf-review/pdfaf-validation/long4516-current-route-volatility-2026-05-21-r1/long4516-current-route-volatility-diagnostic.md`

Compared artifacts:

- Reference current baseline: `/mnt/pdf-review/pdfaf-validation/original50-form-xobject-content-confidence-2026-05-21-r1/baseline_report.json`
- Current original-50 tree-cap calibration run: `/mnt/pdf-review/pdfaf-validation/original50-figure-alt-tree-cap-calibration-2026-05-21-r1/baseline_report.json`
- Focused regression repeat: `/mnt/pdf-review/pdfaf-validation/figure-alt-tree-cap-regression-repeat-2026-05-21-r1/run-r1/baseline_report.json`

## Result

Classification: `repeatable_low_route_current_blocker`

Decision: `park_tree_cap_acceptance_on_4516_route_debt`

The row is a real current original-50 acceptance blocker:

| Artifact | Score | Key shape |
| --- | ---: | --- |
| Reference baseline | `85/B` | Metadata-only stage reanalysis reports `alt_text=80`, `table_markup=100`, `heading_structure=78`. |
| Current original-50 | `59/F` | Title/language and page-furniture/link work apply, but `alt_text=0`; no score-moving floor-safe current state appears. |
| Focused repeat | `55/F` | Figure/alt tools lift `alt_text` only to `20`; `table_markup` remains `0`, `heading_structure=44`. |

Important evidence:

- Current and focused repeat stay at or below `65`, with drops of `26` and `30` points from the `85/B` reference route.
- The compared current/repeat evidence does not match the figure/alt tree-cap scoring predicate: `treeFigureMissingForExtractedFigures=false`, and checker-visible figure-alt coverage is not complete.
- The `85/B` reference route is analyzer/route-optimistic: the same metadata-only stage coincides with high alt/table evidence that does not reproduce in current/repeat artifacts.
- This is not a safe checkpoint-return proof. The compared current/repeat tool timelines do not expose a floor-safe current state to preserve.

## Decision

Do not broaden scoring, checkpoint floors, PAC gates, timeout policy, or figure/alt tree-cap behavior from this evidence.

The figure/alt tree-cap calibration remains useful outside-corpus evidence, but it is not original-50 accepted while `long-4516` remains below the current accepted fresh-run floor. The next route should be either:

- a dedicated `4516` analyzer/route-stabilization stage with fresh targeted controls; or
- an explicit acceptance decision that the old `85/B` route was analyzer-optimistic and the lower current score is stricter, more correct grading.

Until one of those happens, treat the tree-cap calibration as provisional for the active PAC/POC alignment goal rather than accepted completion evidence.
