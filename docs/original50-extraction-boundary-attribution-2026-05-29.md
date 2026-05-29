# Original-50 Extraction Boundary Attribution

Date: 2026-05-29

## Summary

This diagnostic separates original-50 analyzer volatility by extraction
boundary. It repeats three native phases on selected PDFs:

- pdf.js extraction via `extractWithPdfjs`;
- Python structure extraction via `extractStructure`;
- full PDFAF analysis via `analyzePdf`.

It is diagnostic-only. It does not remediate PDFs, write remediated PDFs, call
ODL/PAC/POC/Java, or use semantic/LLM behavior.

The first focused run attributes the main `4516` score-volatility lane to
Python structure extraction, not pdf.js and not the full-analyzer merge/scorer
layer. The stable-low control row `4438` remains stable and should be handled as
separate remediation/table-control debt.

## Local Report

- Report directory:
  `/mnt/pdf-review/pdfaf-validation/original50-extraction-boundary-attribution-2026-05-29-r2`
- Repeats per row: `3`
- Timeout per phase: `45000ms`
- Rows: `4516`, `4438`
- Decision: `fix_or_park_python_structure_extraction_before_behavior`
- Next lane: `python_structure_extraction_stability_or_parking`

## Classification

| Row | Class | Score range | Boundary evidence |
| --- | --- | --- | --- |
| `4516` | `python_structure_extraction_volatile` | `58..58` | pdf.js was stable; Python structure extraction varied heavily: `figureCount 3->24`, `headingCount 0->34`, `paragraphStructElemCount 4->1671`, `tableCount 0->17`. Full analyzer output was stable in this specific repeat. |
| `4438` | `full_analyzer_stable_low` | `59..59` | pdf.js, Python structure extraction, and full analyzer output were all stable. |

## Decision

Do not reopen table-heavy outside-source behavior from this evidence. The next
general lane is Python structure extraction stability or source-tracked parking,
with `4516` as the priority row because it has demonstrated true same-PDF
native analyzer score volatility in the prior all-six analyzer repeat.

Recommended next steps:

1. Inspect the Python structure walker/output boundary for `4516`, focusing on
   why repeated runs alternate between nearly empty structure evidence and full
   headings/figures/tables/paragraph extraction.
2. If a quality-preserving, general deterministic traversal fix exists, test it
   first on `4516` plus stable controls such as `4438`.
3. If the variance is not safely canonicalizable, park `4516` as
   source-tracked Python analyzer volatility and keep it out of table behavior
   acceptance.

The diagnostic script is source-tracked as
`scripts/original50-extraction-boundary-attribution.ts`, with focused tests in
`tests/scripts/original50ExtractionBoundaryAttribution.test.ts`.
