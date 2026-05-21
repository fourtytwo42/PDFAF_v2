# Figure/Alt Tree-Cap Acceptance Audit

Date: 2026-05-21

This is a read-only acceptance audit for the provisional figure/alt tree-cap scoring calibration. It compares existing validation JSON only; it does not analyze PDFs, remediate PDFs, write PDFs, call PAC/POC/ODL/Java/semantic AI, or change production behavior.

Local artifact:

- `/mnt/pdf-review/pdfaf-validation/figure-alt-tree-cap-acceptance-audit-2026-05-21-r1/figure-alt-tree-cap-acceptance-audit.md`

## Result

Decision: `needs_fresh_original50_repeat_after_route_variance`

The high-level gates are mostly clean:

- `false_positive_applied=0`
- Virginia outside holdout improved `91.15 -> 93.35`
- no new original-50 timeout rows versus the reference run
- original-50 p95 is within the bounded runtime allowance (`229628ms -> 234529ms`)
- all-unique remains tracked separately at `92.9972`, one raw point short

The original-50 diff set is now narrow:

| Row | Classification | Reference | Current | Focused repeat | Meaning |
| --- | --- | ---: | ---: | ---: | --- |
| `4680` | `repeat_recovered_route_variance` | `98/A` | `59/F` | `95/A` | The broad current run regressed, but focused repeat recovered. Needs fresh broad repeat before acceptance. |
| `4516` | `stricter_score_candidate_unaccepted` | `85/B` | `59/F` | `55/F` | Metadata structural optimism evidence supports treating the lower score as stricter/correct, but explicit acceptance has not been recorded. |
| `3661` | `small_a_grade_movement` | `98/A` | `93/A` | n/a | Small A-grade movement, not a material blocker. |
| `3981` | `small_a_grade_movement` | `99/A` | `94/A` | n/a | Small A-grade movement, not a material blocker. |
| `4470` | `material_improvement` | `59/F` | `96/A` | `96/A` | Material improvement. |

## Decision

Do not mark the figure/alt tree-cap calibration fully accepted yet.

The next validation step is a fresh original-50 deterministic repeat. If `4680` recovers in that broad context and only the documented `4516` stricter-score candidate remains, the remaining decision is explicit acceptance or rejection of `4516` as stricter/correct grading.

No score caps, PAC gates, planner routes, mutators, timeout floors, or Docker/API behavior should change from this audit.

## Broad Repeat Update

Local artifact:

- `/mnt/pdf-review/pdfaf-validation/figure-alt-tree-cap-acceptance-audit-bounded-repeat-2026-05-21-r1/figure-alt-tree-cap-acceptance-audit.md`

Decision: `blocked_by_validation_gate`

Fresh bounded original-50 repeat:

- report: `/mnt/pdf-review/pdfaf-validation/original50-figure-alt-tree-cap-bounded-repeat-2026-05-21-r1/baseline_report.json`
- completed: `48/50`
- all-row mean: `90.22`
- completed-row mean: `93.9792`
- `false_positive_applied=0`
- timeout/error rows: `4438`, `4683`
- p95/max runtime: `283638ms / 300118ms`

The broad repeat answered the first open question: `4680` recovered to `97/A`, so the prior `59/F` broad-run result was route/analyzer volatility rather than a stable tree-cap regression.

The repeat did not clear acceptance. It added a new original-50 timeout on `4683` compared with the reference timeout set (`4438` only), and p95 exceeded the bounded runtime allowance (`229628ms -> 283638ms`). The only material score diff among completed rows is still `4516`, now `85/B -> 55/F`, classified as `stricter_score_candidate_unaccepted` by the metadata structural optimism diagnostic.

Current decision:

- Keep the figure/alt tree-cap scoring calibration provisional.
- Do not accept it into the durable baseline until original-50 runtime gates are clean or the added timeout/runtime debt is explicitly waived.
- Treat `4516` as a separate stricter-score adjudication item, not as tree-cap score movement.
