# Original-50 Current Focus Repeat

Date: 2026-05-29

## Summary

Ran a fresh current-source focused deterministic repeat over the known original-50 blocker rows:

- `figure-4754`
- `structure-4076`
- `structure-4438`
- `long-4516`
- `long-4680`
- `long-4683`

Command shape:

- Node 22
- `scripts/experiment-corpus-benchmark.ts`
- `--mode full`
- `--no-semantic`
- default no remediated PDF output

Local run artifact:

- `/mnt/pdf-review/original50-current-focus-2026-05-29-r1/run-2026-05-29T18-22-43-531Z/`

No source behavior changed. The run completed `6/6`, with no hard timeouts and `false_positive_applied=0`.

## Results

| Row | Current Repeat | Prior Best Reference | Current Classification |
| --- | ---: | ---: | --- |
| `4076` | `90/A` | `90/A` | runtime-near-wall A-range row |
| `4438` | `69/D` | `83/B` | stable table-control checkpoint debt |
| `4516` | `92/A` | `92/A` | accepted low/near-pass non-table debt |
| `4680` | `59/F` | `98/A` | upstream mixed route-state variance |
| `4683` | `59/F` | `99/A` | upstream mixed route-state variance |
| `4754` | `59/F` | `94/A` | upstream mixed route-state variance |

Focused repeat summary:

- Mean: `71.3`
- Median: `59`
- p95 after score: `92`
- p95 wall runtime: `213068.5ms`
- `false_positive_applied=0`
- hard timeouts/errors: `0`

## Diagnostics

The original-50 diagnostics were updated to read both wrapped `baseline_report.json` artifacts and raw `remediate.results.json` arrays, because this benchmark path writes `remediate.results.json`.

Local diagnostic artifacts:

- Route-drop report: `/mnt/pdf-review/pdfaf-validation/original50-current-focus-route-drop-2026-05-29-r1/original50-route-drop-diagnostic.md`
- Route-state report: `/mnt/pdf-review/pdfaf-validation/original50-current-focus-route-state-2026-05-29-r1/original50-route-state-timeline-diagnostic.md`
- Guarded-candidate report: `/mnt/pdf-review/pdfaf-validation/original50-current-focus-guarded-candidate-2026-05-29-r1/original50-guarded-candidate-side-effect-diagnostic.md`

Diagnostic decisions:

- Route-drop: `diagnose_non_table_route_volatility_before_table_reopen`
- Route-state: `diagnose_upstream_state_variance`
- Guarded-candidate: `no_behavior_ready`

## Interpretation

The current committed source does not reproduce the stale table-continuation gate as a high-candidate side-effect problem. The current focus repeat has no rejected high-scoring candidate ready for cleanup or guarded acceptance.

The active blocker is route/analyzer variance before the useful repair state:

- `4680`, `4683`, and `4754` are current route drops from accepted A-range references to `59/F`.
- `4438` remains stable table-control debt at `69/D` unless the longer accepted table route is reached.
- `4516` is close enough to the accepted route at `92/A` to park as low non-table debt unless the full gate needs the last point.
- `4076` remains A-range but slow and historically volatile.

## Next Lane

Do not reopen parked table-heavy outside-source behavior yet.

The next useful work is an initial-state / early-route repeatability diagnostic over the three current `59/F` route drops:

- `4680`
- `4683`
- `4754`

The diagnostic should compare initial analysis signatures, first-stage metadata decisions, figure/table target availability, PAC regressions, and no-gain figure/alt attempts across the current low repeat and accepted A-range references. A behavior change should be considered only if it is structural, repeatable, control-safe, and does not weaken PAC/category guards.

## Guardrails

- No PAC suppression or score inflation.
- No source/file/row/hash gates.
- No table admission broadening from this current repeat.
- No acceptance of rejected high states without proving side-effect prevention or analyzer/PAC attribution stability.
- Keep generated artifacts under `/mnt/pdf-review`; do not commit PDFs or benchmark payloads.
