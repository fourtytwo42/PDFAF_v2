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
- Repeat report: `/mnt/pdf-review/pdfaf-validation/original50-early-route-repeatability-2026-05-29-r2/original50-early-route-repeatability-diagnostic.md`

Input gate:

- `/mnt/pdf-review/original50-current-focus-2026-05-29-r1/run-2026-05-29T18-22-43-531Z/remediate.results.json`
- Repeat gate: `/mnt/pdf-review/original50-initial-route-repeat-2026-05-29-r1/run-2026-05-29T18-48-39-015Z/remediate.results.json`

## Result

Decision: `diagnose_early_route_variance_before_behavior`

The first local diagnostic classified the rows as:

| Row | Current Gate | Best Reference | Gate Drop | Classification |
| --- | ---: | ---: | ---: | --- |
| `4680` | `59/F` | `98/A` (`focus-r1`) | `39` | `initial_analysis_variance` |
| `4683` | `59/F` | `99/A` (`accepted-mcrpg`) | `40` | `initial_analysis_variance` |
| `4754` | `59/F` | `94/A` (`accepted-wrongref`) | `35` | `mixed_figure_table_route_variance` |

A same-day deterministic repeat of only `4680`, `4683`, and `4754` stayed low:

- `4680`: `59/F`
- `4683`: `59/F`
- `4754`: `59/F`

The repeat diagnostic classified the rows as:

| Row | Repeat Gate | Best Reference | Gate Drop | Classification |
| --- | ---: | ---: | ---: | --- |
| `4680` | `59/F` | `98/A` (`focus-r1`) | `39` | `initial_analysis_variance` |
| `4683` | `59/F` | `99/A` (`accepted-wrongref`) | `40` | `early_structural_route_variance` |
| `4754` | `59/F` | `94/A` (`accepted-mcrpg`) | `35` | `early_structural_route_variance` |

The diagnostic now prefers tied high references with matching initial signatures. This matters for `4754`, where some A-range references share the current initial signature but diverge during early structure/annotation/figure-guard routing.

## Interpretation

This is not yet a behavior-ready table or figure cleanup lane.

The repeat-supported split is:

- `4680` is repeat-stable `initial_analysis_variance`; its initial replay signature differs from the `98/A` reference before a later family-specific repair point.
- `4683` is route-variable: one current low run differs at the initial signature, while the focused repeat shares the `99/A` reference initial signature and diverges at early structural stage `2`.
- `4754` is repeat-stable low but not a pure initial-signature problem: tied high references can share its initial signature, and the repeat diverges in early structure/annotation/PAC-guarded routing with major `alt_text`, `heading_structure`, and `reading_order` drops.

Because the divergence is upstream, accepting a later rejected/no-effect figure or table state would be premature. The next useful lane is an initial analysis / early structural route stability probe, not PAC guard weakening and not table-lane reopening.

## Guardrails

- Do not suppress PAC/category guards.
- Do not accept rejected high states from a different initial route.
- Do not broaden table admission from this evidence.
- Do not add file/source/row/hash gates.
- Keep table-heavy outside lanes parked until original-50 initial-route variance is fixed or formally parked with stronger evidence.
