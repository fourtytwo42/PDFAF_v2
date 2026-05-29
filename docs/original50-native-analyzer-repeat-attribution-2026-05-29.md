# Original-50 Native Analyzer Repeat Attribution

Date: 2026-05-29

## Summary

This diagnostic runs native PDFAF `analyzePdf` repeatedly on selected
original-50 PDFs with `bypassCache: true`. It is analyzer-only: it does not
remediate PDFs, write remediated PDFs, call ODL/PAC/POC/Java, or use
semantic/LLM behavior.

The diagnostic was added because the original-50 gate blockers are now better
explained by analyzer/final-reanalysis variance than by table-lane behavior.
The first complete focused run over the six active blockers shows that native
analysis itself is not fully stable on the same input PDFs.

## Local Report

- Report directory:
  `/mnt/pdf-review/pdfaf-validation/original50-native-analyzer-repeat-attribution-2026-05-29-r3`
- Repeats per row: `3`
- Timeout per analysis: `45000ms`
- Rows: `4076`, `4438`, `4516`, `4680`, `4683`, `4754`
- Decision: `fix_or_park_native_analyzer_variance_before_behavior`
- Next lane: `native_analyzer_stability_or_source_tracked_parking`

## Classification

| Row | Class | Score range | Key variance |
| --- | --- | --- | --- |
| `4076` | `native_analyzer_profile_volatile` | `62..62` | Score stable, but table-header snapshot evidence swung: `tableDataCellsWithoutHeaderCount 0->976`. |
| `4438` | `native_analyzer_stable_low` | `59..59` | Analyzer stable; this remains stable low remediation/table-control debt. |
| `4516` | `native_analyzer_score_volatile` | `43..76` | Same PDF repeats swung across figure, heading, table, and PDF/UA evidence. |
| `4680` | `native_analyzer_profile_volatile` | `59..59` | Score stable, but heading, figure, table, and paragraph evidence varied heavily. |
| `4683` | `native_analyzer_profile_volatile` | `59..59` | Score stable in this repeat, but `heading_structure 85->99` and `reading_order 96->100` varied. |
| `4754` | `native_analyzer_profile_volatile` | `59..59` | Score stable, but paragraph structure count varied. |

## Decision

Do not resume table-heavy outside-source acceptance yet. The current blocker is
native analyzer stability, not a missing table predicate.

Recommended next steps:

1. Attribute the native analyzer variance to the extraction boundary: pdf.js
   output, Python structure extraction, snapshot merge, or scorer/detection.
2. Prioritize `4516` first because it is score-volatile on repeated native
   analysis of the same input PDF.
3. Treat `4438` separately as stable low table-control debt; it should not be
   mixed with analyzer-volatility fixes.
4. Keep `4680`, `4683`, `4754`, and `4076` out of behavior acceptance until
   their category/snapshot drift is fixed or source-parked.

The diagnostic script is source-tracked as
`scripts/original50-native-analyzer-repeat-attribution.ts`, with focused tests
in `tests/scripts/original50NativeAnalyzerRepeatAttribution.test.ts`.
