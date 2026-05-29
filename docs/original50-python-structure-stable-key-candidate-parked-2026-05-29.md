# Original-50 Python Structure Stable-Key Candidate Parked

Date: 2026-05-29

## Summary

A local Python analyzer experiment changed `traverse_struct_tree` de-duplication
from Python wrapper identity (`id(elem)`) to the existing stable structure
object key helper (`_struct_elem_visit_key`). The experiment targeted original-50
row `4516`, where native analyzer repeats showed score volatility and the
extraction-boundary diagnostic attributed the instability to Python structure
extraction.

The candidate is parked and was not kept in source. It successfully stabilized
Python structure traversal, but it stabilized `4516` to a stricter low-score
state that current deterministic remediation did not recover enough for the
original-50 gate.

## Local Evidence

Pre-candidate boundary report:

- `/mnt/pdf-review/pdfaf-validation/original50-extraction-boundary-attribution-2026-05-29-r2/original50-extraction-boundary-attribution.md`
- `4516` classified as `python_structure_extraction_volatile`.
- pdf.js was stable.
- Python structure extraction varied heavily:
  - `figureCount 3->24`
  - `headingCount 0->34`
  - `paragraphStructElemCount 4->1671`
  - `tableCount 0->17`
- Control `4438` classified as stable low.

Local stable-key trace experiment:

- Five direct `--trace-structure` repeats on `4516` became stable:
  - `headings=34`
  - `figures=25`
  - `checkerFigureTargets=18`
  - `tables=17`
  - `paragraphStructElems=2000` capped
  - `rootReachableKeyCount=7059`
- This confirms the old `id(elem)` de-duplication can falsely stop traversal
  early when pikepdf wrapper identities are reused.

Candidate boundary report after the local source edit:

- `/mnt/pdf-review/pdfaf-validation/original50-extraction-boundary-attribution-stable-key-candidate-2026-05-29-r1/original50-extraction-boundary-attribution.md`
- `4516` and `4438` both became stable low:
  - `4516`: `43/F`, `43/F`, `43/F`
  - `4438`: `59/F`, `59/F`, `59/F`

Candidate deterministic remediation check:

- `/mnt/pdf-review/original50-stable-key-candidate-focus-2026-05-29-r1/run-2026-05-29T19-53-13-513Z`
- Mode: `full`
- Semantic: disabled
- PDF output: disabled by default
- Rows:
  - `4438`: `59/F -> 69/D`
  - `4516`: `43/F -> 69/D`
- `4516` ended with persistent table debt (`table_markup=0`) despite improved
  metadata, headings, alt ownership, and reading order.

## Decision

Do not accept the stable-key traversal change by itself. It is likely a real
general analyzer-stability fix, but it currently converts volatile/occasionally
optimistic analysis into stable stricter table debt that fails the active
original-50 acceptance floor.

The source experiment was reverted before commit. A future promotion would need
both:

1. the stable-key traversal change, and
2. a general, PAC-honest remediation path that recovers the newly visible
   `4516` table/header debt while preserving controls such as `4438`.

Until then, keep `4516` classified as Python structure extraction volatility
with a parked quality-preserving stabilization candidate, not as permission to
reopen broad table-heavy outside-source behavior.
