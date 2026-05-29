# Original-50 Early Route Repeatability Diagnostic

Date: 2026-05-29

## Summary

Added a read-only early-route diagnostic for the current original-50 route drops:

- `4680`
- `4683`
- `4754`

The diagnostic compares the current low focused repeat against accepted/focused A-range references using existing benchmark JSON only. It does not analyze PDFs, remediate PDFs, write remediated PDFs, call ODL/PAC/POC, or use semantic/LLM work.

Source script:

- `scripts/original50-early-route-repeatability-diagnostic.ts`

Local report:

- `/mnt/pdf-review/pdfaf-validation/original50-early-route-repeatability-2026-05-29-r1/original50-early-route-repeatability-diagnostic.md`

Input gate:

- `/mnt/pdf-review/original50-current-focus-2026-05-29-r1/run-2026-05-29T18-22-43-531Z/remediate.results.json`

## Result

Decision: `diagnose_early_route_variance_before_behavior`

All three rows classify as `initial_analysis_variance`:

| Row | Current Gate | Best Reference | Gate Drop | Classification |
| --- | ---: | ---: | ---: | --- |
| `4680` | `59/F` | `98/A` (`focus-r1`) | `39` | `initial_analysis_variance` |
| `4683` | `59/F` | `99/A` (`accepted-wrongref`) | `40` | `initial_analysis_variance` |
| `4754` | `59/F` | `94/A` (`accepted-template`) | `35` | `initial_analysis_variance` |

Initial replay signatures differ between the current low route and the best high reference for every selected row. The first divergence is at index `0`, stage `1`.

## Interpretation

This is not yet a behavior-ready table or figure cleanup lane.

The current low routes diverge before a clean family-specific repair point:

- `4680` has heavy figure-alt/PAC blocked attempts later in the route, but the initial replay signature already differs from the `98/A` reference.
- `4683` has initial replay variance plus metadata-stage reading-order guarded rejections and mixed figure/table work.
- `4754` has a major `alt_text` drop (`100 -> 20`) versus the best reference, but the initial replay signature also differs before the later no-gain figure/alt attempts.

Because the divergence is upstream, accepting a later rejected/no-effect figure or table state would be premature. The next useful lane is an initial analysis or metadata-route stability probe, not PAC guard weakening and not table-lane reopening.

## Guardrails

- Do not suppress PAC/category guards.
- Do not accept rejected high states from a different initial route.
- Do not broaden table admission from this evidence.
- Do not add file/source/row/hash gates.
- Keep table-heavy outside lanes parked until original-50 initial-route variance is fixed or formally parked with stronger evidence.

