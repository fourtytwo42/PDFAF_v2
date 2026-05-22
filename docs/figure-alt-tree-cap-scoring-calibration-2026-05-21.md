# Figure/Alt Tree-Cap Scoring Calibration - 2026-05-21

This checkpoint promotes the narrow scoring-calibration proof identified by the outside figure/alt no-gain diagnostic. It changes native PDFAF scoring only; it does not add remediation tools, broaden planner routing, call PAC/POC/ODL/Java, call semantic AI, or use filenames/source/corpus gates.

## Change

Before this checkpoint, `treeFigureMissingForExtractedFigures=true` always forced the `alt_text` figure score to `20` and also triggered the strict overall `no_checker_visible_alt_on_informative_figures` cap.

The new predicate keeps that cap unless native checker-visible figure evidence is fully covered:

- reachable checker-visible targets exist;
- targets resolve as `/Figure`;
- targets are not artifacts;
- every such target has non-empty `/Alt`.

When those conditions are true, the tree-missing signal no longer acts as an alt-coverage failure by itself. The finding and manual-review evidence remain visible, and `alt_text` is still capped at `89` by the existing non-verified ownership policy. Partial checker-visible coverage, missing alt, non-Figure role debt, weak/generic alt, and PAC/PDF-UA structural evidence remain strict.

## Validation

Focused unit validation:

- `tests/scorer.test.ts`
- `treeFigureMissingForExtractedFigures=true` plus full checker-visible alt coverage now avoids the `20` alt cap and avoids the strict overall no-alt blocker.
- Partial checker-visible alt coverage still keeps `alt_text=20` and the strict overall blocker.

Target/control validation:

- Artifact: `/mnt/pdf-review/pdfaf-validation/figure-alt-tree-cap-calibration-2026-05-21-r1/run-r1/baseline_report.json`
- `va-11`: `59/F -> 94/A`; `alt_text 20 -> 89`; `false_positive_applied=0`
- `va-17`: stable at `91/A`
- `original-4683`: remains low (`59/F`), matching the partial-coverage control shape rather than the tree-cap candidate
- `va-03`: landed lower (`91/A` prior outside artifact to `87/B`) because `heading_structure` landed `79` instead of `99`; `alt_text` stayed `85`, so this is route/heading variance rather than the tree-cap scoring predicate

Outside holdout validation:

- Artifact: `/mnt/pdf-review/pdfaf-validation/virginia-dcjs-figure-alt-tree-cap-full-2026-05-21-r1/baseline_report.json`
- Rows: `20/20`
- Mean: `93.35` versus prior bounded holdout `91.15`
- Grades: `18 A / 1 B / 1 D`
- `false_positive_applied=0`
- Timeout/error rows: `0`
- p95: `199055ms` versus prior bounded holdout `224644ms`
- Primary movement: `va-11 59/F -> 94/A`; `va-18 79/C -> 96/A`; `va-13 89/B -> 96/A`

Original-50 validation:

- Artifact: `/mnt/pdf-review/pdfaf-validation/original50-figure-alt-tree-cap-calibration-2026-05-21-r1/baseline_report.json`
- Rows: `50`, completed `49`
- Mean all rows: `91.30` versus current baseline artifact `92.14`
- Completed-row mean: `93.1633`
- `false_positive_applied=0`
- Timeout/error rows: `4438` hard timeout
- p95: `234529ms`, within `max(3%, 5s)` of the current baseline p95 `229628ms`

The original-50 gate is not clean. The largest negative movements are known volatile/runtime rows:

- `4516`: prior artifact `85/B`, current `59/F`, focused repeat `55/F`
- `4680`: prior artifact `98/A`, current `59/F`, focused repeat recovered to `95/A`
- `4683`: prior artifact `61/D`, current `59/F`

The current original-50 figure/alt no-gain diagnostic found `0` tree-cap scoring candidates. `4683` remains partial checker-visible alt coverage (`5/6`) and does not match the promoted full-coverage predicate. This supports the predicate as narrow, but the accepted-gate status remains blocked by original-50 volatility, mainly `4516`.

## Follow-Up Runtime-Guard Repeats

After the narrow slow no-gain figure/alt runtime guard was added, two fresh bounded original-50 repeats were run against the current tree-cap/guard source state:

- `/mnt/pdf-review/pdfaf-validation/original50-slow-no-gain-guard-bounded-2026-05-21-r1/baseline_report.json`
- `/mnt/pdf-review/pdfaf-validation/original50-current-treecap-guard-bounded-repeat-2026-05-21-r2/baseline_report.json`

The first repeat improved over the blocked tree-cap repeat: `49/50` completed, all-row mean `92.24`, completed-row mean `94.1224`, `false_positive_applied=0`, and only known timeout `structure-4438`. However, p95 was `237114ms`, narrowly above the p95 bound when compared with the Form XObject confidence reference (`229628ms`, allowed `236517ms`).

The second repeat kept `false_positive_applied=0` and the same known timeout, but it did not clear acceptance:

- all-row mean `91.82`;
- completed-row mean `93.6939`;
- p95/max `253462ms / 300041ms`;
- `4516` repeated low at `59/F`;
- `4680` repeated low at `59/F`;
- `4754` repeated lower at `85/B`.

Updated read-only audit:

- `/mnt/pdf-review/pdfaf-validation/figure-alt-tree-cap-acceptance-audit-current-repeat-2026-05-21-r2`
- Decision: `blocked_by_validation_gate`
- Passing gates: `false_positive_applied=0`, outside holdout improved to target, and no new timeout versus the reference.
- Failing gate: original-50 p95 exceeds the bounded runtime allowance.

The outside-corpus result remains real and useful, but the original-50 runtime/route gate is not clean enough to accept the score-active rule as a fully accepted checkpoint.

## Status

This remains a useful score-active improvement for outside-corpus generalization, but it is not sufficient to close the active goal and is still not a fully accepted broad checkpoint. Treat it as a provisional scoring calibration until one of these happens:

- a fresh original-50 deterministic repeat clears the no-regression gate; or
- the `4516` runtime/analyzer route volatility is separately resolved or explicitly waived.

No all-unique completion claim is made from this checkpoint.
