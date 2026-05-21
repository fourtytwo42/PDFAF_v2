# Outside Holdout Low-Row Diagnostic - 2026-05-21

This checkpoint adds a diagnostic/reporting layer for outside-corpus validation rows that remain below the active goal target. It reads an existing `baseline_report.json` and classifies low rows by native score debt plus tool/PAC-like evidence. It does not analyze PDFs, remediate PDFs, write remediated PDFs, call PAC/POC/ODL/Java, call semantic AI, or change production scoring/planning behavior.

## Source Artifact

- Script: `scripts/outside-holdout-low-row-diagnostic.ts`
- Local report: `/mnt/pdf-review/pdfaf-validation/virginia-dcjs-low-row-diagnostic-2026-05-21-r1/outside-holdout-low-row-diagnostic.md`
- Source run: `/mnt/pdf-review/pdfaf-validation/virginia-dcjs-20pdf-bounded-2026-05-21-r1/baseline_report.json`
- Input holdout: `Input/virginia_dcjs_research_holdout_2026_05_18`

## Result

- Rows: `20`
- Mean: `91.15`
- Target mean: `93`
- Raw points needed: `37`
- Median: `94.5` in the source validation checkpoint
- `false_positive_applied`: `0`
- Timeout/error rows: `0`
- Diagnostic decision: `plan_high_impact_targeted_diagnostic`
- Recommended first lane: `figure_alt_object_candidate`

## Lane Summary

| Lane | Rows | Raw Points To 93 | Interpretation |
| --- | ---: | ---: | --- |
| `figure_alt_object_candidate` | 1 | 34 | `va-11` has `alt_text=20`, three accepted `set_figure_alt_text` attempts, and PAC-like figure-alt regression guards. This is the largest single outside-holdout opportunity, but needs object ownership/target evidence before behavior. |
| `table_target_resolution_needed` | 1 | 24 | `va-15` has `table_markup=0` and table-header PAC debt, but prior table behavior was parked because target resolution can hit non-table refs. Do not promote table routing until `/Table` target identity is proven immediately before mutation. |
| `reading_link_order_candidate` | 1 | 14 | `va-18` has `reading_order=68` and `link_quality=73`; any behavior must separate true order/link debt from controls. |
| `metadata_pdfua_candidate` | 1 | 4 | `va-13` has `title_language=50` and `pdf_ua_compliance=50` with metadata/PDF-UA tools rejected. This is a smaller root-cause lane. |
| `near_miss_monitor` | 2 | 4 | `va-03` and `va-17` are low-priority near misses that should move only if a broader general lane reaches them naturally. |

## Decision

The next useful behavior proof should not be another broad table or reading retry. The highest-impact outside-corpus lane is a focused figure/alt object diagnostic around `va-11`-style failures: accepted alt writes exist, but the final score remains low, so the likely question is target ownership, checker visibility, or unresolved figure structure debt.

Acceptance for any follow-up behavior remains unchanged:

- native PDFAF logic only;
- no filename/source/corpus/hash gates;
- object-backed positive evidence;
- nearby controls stable;
- `false_positive_applied=0`;
- original-50 deterministic validation before accepting source behavior;
- outside holdout re-run before claiming broad improvement.
